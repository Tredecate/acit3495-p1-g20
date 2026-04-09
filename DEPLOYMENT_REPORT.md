# Project 1 - Part 2: Kubernetes Deployment & Horizontal Scaling

## 1. Goal

The Part 2 instructions asked us to:

1. Deploy the Part 1 microservices to a public-cloud Kubernetes cluster (we picked AWS EKS).
2. Test horizontal scalability of the backend.
3. Demonstrate a scenario where the backend "grows and shrinks according to demand."

---

## 2. Scaling decisions

Not every service should - or even *can* - scale horizontally. The first thing we did was sort each service into one of three buckets.

| Service           | Workload type                | Replicas | Scaling policy        |
| ----------------- | ---------------------------- | -------- | --------------------- |
| `db_mysql`        | StatefulSet (EBS-backed PVC) | 1        | Singleton             |
| `db_mongodb`     | StatefulSet (EBS-backed PVC) | 1        | Singleton             |
| `svc_analytics`   | Deployment                   | 1        | Singleton (no HPA)    |
| `svc_authentication` | Deployment                | 2 → 6    | HPA on CPU @ 60%      |
| `web_dataentry`   | Deployment                   | 2 → 6    | HPA on CPU @ 60%      |
| `web_analytics`   | Deployment                   | 2 → 6    | HPA on CPU @ 60%      |

### 2.1 The obvious horizontal scalers: the two web apps

`web_dataentry` and `web_analytics` are request-driven, stateless-by-nature Express apps. They are the most obvious candidates. Under user load they need to grow, and when the load fades they should shrink to save money. They became `Deployment` + `HorizontalPodAutoscaler` + `PodDisruptionBudget`.

### 2.2 The obvious singletons: the databases

MySQL and MongoDB are stateful, talk to a single EBS volume each, and we explicitly avoided dealing with managed databases. They stay as `StatefulSet`s with `replicas: 1` and a `ReadWriteOnce` EBS volume claim. We added resource requests/limits and a readiness probe to MySQL so the kubelet can correctly schedule it and detect when it's ready to accept connections (important so dependent services don't try to connect during MySQL's ~20 second cold start).

### 2.3 The choice: `svc_authentication`

The auth service is a stateless FastAPI process *as a server*, but in Part 1 it stored users in a SQLite file on a local volume (`/data/auth.db`). That makes it impossible to safely run more than one replica, as replica A would have a different user list than replica B and logins and admin user creation would fail randomly depending on which pod the load balancer hit.

We had three options:

1. Keep one replica.
2. Add a Redis-backed shared session store (adds infra, overcomplicated).
3. Move the user storage to MySQL. We already run a MySQL StatefulSet for the dataentry app, so this is essentially free infrastructure-wise.

We picked option 3. Auth now points at the same MySQL StatefulSet, but uses its own database (`auth`) and its own user (`auth_user`). The implementation details are in section 3.1.

### 2.4 The worker singleton: `svc_analytics`

`svc_analytics` is a periodic worker. Every `ANALYTICS_INTERVAL_SECONDS` (60s by default) it pulls a window of new readings out of MySQL, builds an aggregated snapshot, and writes it to MongoDB. It tracks `self.last_window_end` in process memory so the next run knows where to pick up from.

Two replicas of this would race: both would compute overlapping windows, both would write the same snapshot, and the dashboard could show duplicate data with double the volume. The worker isn't request-driven anyway though, so it doesn't even benefit from extra replicas under user load.

So, we made the deliberate decision to keep it pinned to `replicas: 1` and add a safety net for the failure mode that pinning doesn't solve: a pod restart mid-cycle re-running an in-flight window.

### 2.5 Why CPU-based HPA at 60%

For the three scalable services we use `HorizontalPodAutoscaler` v2 with a CPU utilization target of 60%. We picked 60% (rather than something like 80%) because the HPA reacts slowly. Triggering at 60% gives a buffer so users don't see degradation while new pods spin up. `minReplicas: 2` ensures we always survive a single pod failure or a node drain. `maxReplicas: 6` is a sanity cap so a runaway test can't accidentally scale to 100 pods and exhaust the cluster.

Each scalable workload also has a `PodDisruptionBudget` with `minAvailable: 1` so a node drain (during an EKS upgrade, for example) can't take the whole tier down.

---

## 3. Code changes that were necessary

Three of the six services needed code changes before they could be deployed safely on Kubernetes.

### 3.1 `svc_authentication`: SQLite → MySQL

Files changed:
- `svc_authentication/app/core/config.py`
- `svc_authentication/app/db/session.py`
- `svc_authentication/app/db/models.py`
- `svc_authentication/app/services/startup.py`
- `svc_authentication/app/requirements.txt`

Main updates:
- Replaced SQLite path config with MySQL env-based config (`AUTH_MYSQL_*`) and computed DSN.
- Added explicit pool settings (`AUTH_DB_POOL_SIZE`, `AUTH_DB_MAX_OVERFLOW`) and `pool_pre_ping=True`.
- Extended DB startup retry timing for slower Kubernetes MySQL startup.
- Updated SQLAlchemy model string lengths for MySQL compatibility.
- Made initial admin seeding safe under multi-replica startup (`IntegrityError` handling).
- Added `pymysql` and `cryptography` dependencies.

### 3.2 `web_dataentry` and `web_analytics`: stateless cookie auth

Files changed in both apps:
- `app/package.json`
- `app/src/config/env.js`
- `app/src/app.js`
- `app/src/middleware/auth.js`
- `app/src/middleware/locals.js`
- `app/src/controllers/authController.js`
- All other controllers (`entryController.js`, `adminController.js`, `dashboardController.js`)
- All views in `app/src/views/`

Main updates:
- Removed `express-session` and moved auth state to an HTTP-only JWT cookie.
- Added `cookie-parser` and new helpers/middleware to read, validate, and clear the token cookie.
- Updated controllers to use `req.user` instead of `req.session.user`.
- Kept `/health` at root and added `BASE_PATH` support for optional route prefixing.
- Added `TRUST_PROXY` and cookie security settings (`httpOnly`, `sameSite`, env-driven `secure`).

### 3.3 `svc_analytics`: idempotent snapshot writes

Files changed:
- `svc_analytics/app/db/mongo.py`

Main updates:
- Added a unique MongoDB index on `(window_start, window_end)`.
- Replaced `insert_one` with `update_one(..., upsert=True)`.

This prevents duplicate snapshots when the worker restarts and reprocesses the same window.

---

## 4. Kubernetes manifests

All manifests live in `.k8s/`. The directory layout mirrors the service topology:

| File                | Contains                                                                          |
| ------------------- | --------------------------------------------------------------------------------- |
| `aws.yml`           | EBS-backed `StorageClass` for the database PVCs                                   |
| `env.yml`           | All `ConfigMap`s and the single `Secret` shared across workloads                  |
| `db-mysql.yml`      | `StatefulSet`, headless `Service`, and init `ConfigMap` for MySQL                 |
| `db-mongodb.yml`    | `StatefulSet`, headless `Service`, and init `ConfigMap` for MongoDB               |
| `svc-auth.yml`      | `Deployment` + `Service` + `HPA` + `PDB` for `svc_authentication`                 |
| `web-dataentry.yml` | `Deployment` + `LoadBalancer Service` + `HPA` + `PDB` for `web_dataentry`         |
| `web-analytics.yml` | `Deployment` + `LoadBalancer Service` + `HPA` + `PDB` for `web_analytics`         |
| `svc-analytics.yml` | Singleton `Deployment` for the analytics worker (no Service, no HPA)              |

### 4.1 Configuration and secrets (`env.yml`)

We use one shared `Secret` (`env-secret`) and multiple `ConfigMap` objects (one per workload).

- The `Secret` holds anything sensitive: MySQL passwords for both schemas, the Mongo root password, the JWT signing key, the seed admin password.
- Each `ConfigMap` holds the non-sensitive env (hostnames, ports, DB names, pool sizes, feature flags) for exactly one workload.

We chose per-workload ConfigMaps rather than one giant shared one so that:
1. Each workload's `envFrom` only injects the keys it actually needs (no leaking `MONGO_*` stuff into the dataentry pod, etc.).
2. Editing the auth service's pool size doesn't trigger a rollout of the dashboard.
3. The ConfigMaps are labeled with the app they belong to (`app: svc-auth`, etc.), which is useful for `kubectl get configmap -l app=svc-auth`.

The `Secret` uses `stringData:` (plain text) instead of `data:` (base64). This is purely a developer-experience choice, as `stringData` is editable in a normal text editor and Kubernetes converts it to base64 server-side. The values are still stored as base64 once created as if we'd written them as `data:`.

### 4.2 The MySQL init script

`db-mysql.yml`'s init `ConfigMap` originally had only `01-init-readings.sql` (the readings table for the dataentry app). We added `02-init-auth.sh`, a bash script that runs during MySQL's first startup and bootstraps the auth schema:

```bash
mysql -uroot <<-EOSQL
  CREATE DATABASE IF NOT EXISTS `${AUTH_MYSQL_DATABASE}`;
  CREATE USER IF NOT EXISTS '${AUTH_MYSQL_USER}'@'%' IDENTIFIED BY '${AUTH_MYSQL_PASSWORD}';
  GRANT ALL PRIVILEGES ON `${AUTH_MYSQL_DATABASE}`.* TO '${AUTH_MYSQL_USER}'@'%';
  FLUSH PRIVILEGES;
EOSQL
```

We used a shell script rather than a `.sql` file because `.sql` files can't reference environment variables, they're piped to mysql verbatim. The script is run as root via the Unix socket (the official `mysql:8.4` image's entrypoint sources every file in `/docker-entrypoint-initdb.d/` in alphabetical order on first boot and gives `.sh` files exactly this kind of shell context). The `${AUTH_MYSQL_*}` values come from the `mysql-env-configmap` ConfigMap and the `env-secret` Secret, both wired into the StatefulSet's pod spec. After this runs, `auth_user` exists and `svc_authentication` can connect to its own database without any cross-talk with the dataentry data.

We also added MySQL resource requests/limits and a `mysqladmin ping` readiness probe so dependent services wait for DB readiness.

### 4.3 Service exposure

The two web apps are exposed via `Service` of `type: LoadBalancer`. On EKS, this provisions an actual AWS Network Load Balancer per service, which gives each app its own public DNS name.

`svc_authentication` has a `ClusterIP` service. It is *not* publicly reachable; only the web apps inside the cluster talk to it. There is no reason for the open internet to be able to call `/auth/login` directly.

`svc_analytics` has no Service at all. It's a worker process and nothing calls it. It only makes outbound connections to MySQL and MongoDB.

The two databases use **headless services** (`clusterIP: None`) as is conventional for `StatefulSet`s. This gives each pod a stable DNS name (`mysql-set-0.mysql-service`, etc.).

### 4.4 Probes and resources

Every Deployment has:

- readiness probe on `/health`
- liveness probe on `/health`
- requests: `100m` CPU, `128Mi` memory
- limits: `500m` CPU, `512Mi` memory

These settings keep routing safe during startup, support HPA CPU calculations, and cap runaway usage.

MySQL uses higher resources (`200m`/`512Mi` requests, `1` CPU / `1Gi` limits) plus readiness checks because it has the heaviest startup/load profile.

### 4.5 The HPAs

Each scalable workload has an `autoscaling/v2` `HorizontalPodAutoscaler`:

```yaml
minReplicas: 2
maxReplicas: 6
metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60
```

The HPA scales the `Deployment` between 2 and 6 pods based on average CPU across all pods in the deployment. The reason for `minReplicas: 2` instead of `1` is we want to survive a single-pod failure without any user-visible downtime. The `maxReplicas: 6` is a sanity ceiling (god rest ye AWS credits).

For HPAs to function, the cluster must have **metrics-server** installed. Metrics-server scrapes the kubelet's `/metrics/resource` endpoint and exposes pod CPU/memory through the Kubernetes metrics API, which the HPA controller polls every 15 seconds.

### 4.6 PodDisruptionBudgets

Each scalable workload has a `PodDisruptionBudget` with `minAvailable: 1` to reduce downtime during voluntary disruptions (for example, node drains and cluster upgrades).

Singleton workloads are excluded. `svc_analytics` remains a single replica, so brief interruptions during node maintenance are acceptable for this periodic worker.

---

## 5. Things we deliberately did NOT do

- **No Redis/session store.** The cookie approach is simpler.
- **No managed databases (RDS / DocumentDB).** Out of scope.
- **No database HA/replication.** Out of scope.
- **No leader election for `svc_analytics`.** Pinned to a single replica with idempotent writes as the safety net.
- **No HTTPS / ACM / ALB Ingress.** The current manifests use one `LoadBalancer` Service per web app over plain HTTP. This is fine for the demo but would not be acceptable in production. `COOKIE_SECURE` is already wired to an env var so flipping it to `true` is a one-line change once HTTPS is added.

---

## 6. Cluster prerequisites

For the manifests to actually work on a fresh EKS cluster, the cluster needs:

1. **EBS CSI driver** add-on - required by the StorageClass in `aws.yml` so the database PVCs can provision real EBS volumes.
2. **metrics-server** - required by the three HPAs to read pod CPU usage. Without it, HPAs report `<unknown>` for CPU and never scale.
3. **AWS LoadBalancer support** - automatically present on EKS for `Service: type=LoadBalancer`. No extra controller needed because we're not using an Ingress in the current configuration.
