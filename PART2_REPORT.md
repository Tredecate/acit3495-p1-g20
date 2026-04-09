# Project 1 — Part 2: Kubernetes Deployment & Horizontal Scaling

This document covers everything we did in Part 2: the deployment of the Part 1 microservices to AWS EKS, the code changes that were necessary to make horizontal scaling actually work, and the rationale behind every non-obvious decision.

It is intentionally focused on **what changed in Part 2 and why** — the Part 1 architecture and the per-service business logic are documented in `TECHNICAL_REPORT.md`.

---

## 1. Goal

The Part 2 rubric asked us to:

1. Deploy the Part 1 microservices to a public-cloud Kubernetes cluster (we picked AWS EKS).
2. Test horizontal scalability of the backend.
3. Demonstrate a scenario where the backend "grows and shrinks according to demand."

The implementation work in this PR is the foundation for items 2 and 3 — the manifests, service refactors, and scaling decisions that make the demo actually possible. The load testing scripts, screenshots, and the v2 report/presentation are deliberately out of scope for this PR and will follow.

---

## 2. Scaling decisions (the most important section)

Not every service should — or even *can* — scale horizontally. The first thing we did was sort each service into one of three buckets and document **why** for each.

| Service           | Workload type                | Replicas | Scaling policy        |
| ----------------- | ---------------------------- | -------- | --------------------- |
| `db_mysql`        | StatefulSet (EBS-backed PVC) | 1        | Singleton             |
| `db_mongodb`     | StatefulSet (EBS-backed PVC) | 1        | Singleton             |
| `svc_analytics`   | Deployment                   | 1        | Singleton (no HPA)    |
| `svc_authentication` | Deployment                | 2 → 6    | HPA on CPU @ 60%      |
| `web_dataentry`   | Deployment                   | 2 → 6    | HPA on CPU @ 60%      |
| `web_analytics`   | Deployment                   | 2 → 6    | HPA on CPU @ 60%      |

### 2.1 The obvious horizontal scalers: the two web apps

`web_dataentry` and `web_analytics` are request-driven, stateless-by-nature Express apps. They are the most obvious candidates: under user load they need to grow, and when the load fades they should shrink to save money. They became `Deployment` + `HorizontalPodAutoscaler` + `PodDisruptionBudget`.

The catch: they were **not actually stateless** in Part 1. See section 3.2.

### 2.2 The obvious singletons: the databases

MySQL and MongoDB are stateful, talk to a single EBS volume each, and our scope explicitly excludes managed databases (no RDS, no DocumentDB) or DB clustering. They stay as `StatefulSet`s with `replicas: 1` and a `ReadWriteOnce` EBS volume claim. We added resource requests/limits and a readiness probe to MySQL so the kubelet can correctly schedule it and detect when it's ready to accept connections (important so dependent services don't try to connect during MySQL's ~20 second cold start).

### 2.3 The painful middle ground: `svc_authentication`

The auth service is a stateless FastAPI process *as a server*, but in Part 1 it stored users in a **SQLite file on a local volume** (`/data/auth.db`). That makes it impossible to safely run more than one replica — replica A would have a different user list than replica B, logins and admin user creation would fail randomly depending on which pod the load balancer hit.

We had three options:

1. Keep one replica forever (defeats the rubric).
2. Add a Redis-backed shared session store (adds infra, doesn't solve the user-data problem, just moves it).
3. **Move the user storage to MySQL.** We already run a MySQL StatefulSet for the dataentry app, so this is essentially free infrastructure-wise.

We picked option 3. Auth now points at the same MySQL StatefulSet, but uses its own database (`auth`) and its own user (`auth_user`) so the blast radius stays small if we ever need to move it later. The implementation details are in section 3.1.

### 2.4 The painful singleton: `svc_analytics`

`svc_analytics` is a periodic worker, not a request handler. Every `ANALYTICS_INTERVAL_SECONDS` (60s by default) it pulls a window of new readings out of MySQL, builds an aggregated snapshot, and writes it to MongoDB. It tracks `self.last_window_end` **in process memory** so the next run knows where to pick up from.

Two replicas of this would race: both would compute overlapping windows, both would write the same snapshot, and your dashboard would show duplicate data with double the volume. Real horizontal scaling here would require either a leader-election lock (Kubernetes Lease object or a Redis lock) or sharding the readings by some key (location? metric type?). Both are more work than the assignment is asking for, and the worker isn't request-driven anyway — it's a fixed-tick loop, so it doesn't *benefit* from extra replicas under user load.

We made the deliberate decision to keep it pinned to `replicas: 1`, document **why** with a comment in the manifest, and add a safety net for the *one* failure mode that pinning doesn't solve: a pod restart mid-cycle re-running an in-flight window. The fix for that is in section 3.3.

This is, intentionally, the answer to the assignment's "painful services that will suffer when others are scaled, and how to handle that" question. The honest answer for a singleton periodic worker is "don't scale it, harden it instead."

### 2.5 Why CPU-based HPA at 60%

For the three scalable services we use `HorizontalPodAutoscaler` v2 with a CPU utilization target of **60%**. CPU is the right signal for our workloads:

- **`svc_authentication`**: bcrypt password hashing on every login is genuinely CPU-bound. This is the easiest service to push past the threshold during a load demo, and it's the one most likely to *need* horizontal scaling in a real outage scenario.
- **`web_dataentry` / `web_analytics`**: Node.js is single-threaded per process, so once one event loop is busy it's busy. CPU pressure is a good proxy for "this pod is saturated."

We picked 60% (rather than e.g. 80%) because the HPA reaction loop is slow — it samples every ~15s and waits for sustained pressure before adding pods. Triggering at 60% gives a buffer so users don't see degradation while new pods spin up. `minReplicas: 2` ensures we always survive a single pod failure or a node drain. `maxReplicas: 6` is a sanity cap so a runaway test can't accidentally scale to 100 pods and exhaust the cluster.

Each scalable workload also has a `PodDisruptionBudget` with `minAvailable: 1` so a node drain (during an EKS upgrade, for example) can't take the whole tier down.

---

## 3. Code changes that were necessary

Three of the six services needed code changes before they could be deployed safely on Kubernetes. The other three (`svc_analytics`'s worker loop, the two database images) were used as-is.

### 3.1 `svc_authentication`: SQLite → MySQL

Files changed:
- `svc_authentication/app/core/config.py`
- `svc_authentication/app/db/session.py`
- `svc_authentication/app/db/models.py`
- `svc_authentication/app/services/startup.py`
- `svc_authentication/app/requirements.txt`

**Configuration.** `auth_db_path` was deleted entirely. In its place, `Settings` now reads `AUTH_MYSQL_HOST`, `AUTH_MYSQL_PORT`, `AUTH_MYSQL_USER`, `AUTH_MYSQL_PASSWORD`, and `AUTH_MYSQL_DATABASE` from the environment, plus two new tuning knobs: `AUTH_DB_POOL_SIZE` and `AUTH_DB_MAX_OVERFLOW`. A computed `auth_db_url` property assembles the SQLAlchemy DSN:

```
mysql+pymysql://<user>:<password>@<host>:<port>/<database>?charset=utf8mb4
```

**Connection pool sizing.** This is the part most people forget. Each auth replica opens its own SQLAlchemy connection pool to MySQL. With `pool_size=5` and `max_overflow=5`, each replica can use up to 10 connections. With `maxReplicas: 6` that's 60 connections from auth alone. MySQL 8's default `max_connections` is 151. We're well under the cap, but the math has to be done — if we'd left the defaults at SQLAlchemy's `pool_size=5, max_overflow=10`, six replicas would be 90 connections, still fine, but `maxReplicas: 20` would have silently broken everything in production. Spelling these out as env vars makes the budget explicit.

**Engine initialization.** `init_database` in `db/session.py` was rewritten. The SQLite-specific `connect_args={"check_same_thread": False}` and the directory-creation logic are gone. We now create a SQLAlchemy engine with `pool_pre_ping=True` (so the pool detects dead connections after a MySQL restart instead of handing back broken handles) and the configured pool sizing. The retry loop was extended from 10 attempts × 1s to 30 attempts × 2s (60s total) because MySQL on a fresh EKS cluster takes longer to come up than a local SQLite file.

**Schema changes.** SQLAlchemy on SQLite happily accepts `String` columns without lengths because SQLite ignores type annotations. MySQL does not — `VARCHAR` *requires* a length. `User.username`, `password_hash`, `created_at`, and `updated_at` all got explicit lengths (`String(100)`, `String(255)`, `String(40)`). Without this fix `Base.metadata.create_all` would crash on first startup against MySQL.

**Idempotent admin seeding.** `seed_initial_admin` was wrapped in a `try/except IntegrityError`. With multiple replicas starting up simultaneously, two pods can both observe an empty `users` table, both attempt to insert the admin user, and one of them will hit a unique-constraint violation. Without the catch, that pod crashes and `CrashLoopBackOff`s forever. With the catch, the loser logs "Admin user already seeded by peer replica" and continues.

**New dependencies.** `pymysql` (the Python MySQL driver) and `cryptography` (required by PyMySQL for the modern auth plugin MySQL 8 uses by default).

### 3.2 `web_dataentry` and `web_analytics`: stateless cookie auth

Files changed in **both** apps (mirrored):
- `app/package.json`
- `app/src/config/env.js`
- `app/src/app.js`
- `app/src/middleware/auth.js`
- `app/src/middleware/locals.js`
- `app/src/controllers/authController.js`
- All other controllers (`entryController.js`, `adminController.js`, `dashboardController.js`)
- All views in `app/src/views/`

**The problem.** Both apps used `express-session` with **no session store configured**, which means Express defaults to an in-memory MemoryStore. After login, the JWT returned by `svc_authentication` was stuffed into `req.session.user.access_token` and lived in the Node process heap. If a load balancer routed your second request to a different replica, your session was simply gone — that replica had never seen your login. Sticky sessions would technically "fix" it but defeat the entire point of horizontal scaling.

**The fix.** We removed `express-session` entirely (no Redis, no MongoStore, no shim — a smaller dependency tree is its own reward) and replaced it with a stateless HTTP-only cookie containing the JWT.

The flow is now:

1. **Login** (`authController.postLogin`): user submits credentials, web app calls `svc_authentication /auth/login`, gets back `{access_token, expires_in, user}`. Instead of storing this in a session, we set an HTTP-only cookie named `access_token` with `maxAge = expires_in * 1000`.

2. **Subsequent requests** (`middleware/auth.requireAuth`): pull the token out of `req.cookies.access_token` (via the new `cookie-parser` middleware), call `svc_authentication /auth/me` to verify it and get the current user info, then attach the result to `req.user`. Every controller that previously read `req.session.user.is_admin` now reads `req.user.is_admin`. Every controller that needed `req.session.user.access_token` to call the auth service now passes `req.user.access_token`.

3. **Logout** (`authController.postLogout`): clear the cookie. Done. No session to destroy.

4. **Token expiry / 401**: same as before, except instead of `req.session.destroy()` we call a `clearTokenCookie(res)` helper and redirect to `/login`.

The cookie is set with `httpOnly: true` (no JavaScript access, mitigates XSS token theft), `sameSite: "lax"` (CSRF protection), and `secure: <env-controlled>` (which gets flipped to `true` when the ALB terminates HTTPS — see section 5).

**Why this approach over Redis.** The simpler approach is genuinely better here. The JWT *already* has all the state we need (the user identity, signed by the auth service); putting it in a cookie just means the browser carries it instead of the server remembering it. A Redis session store would have meant: another StatefulSet, another set of credentials, another point of failure, another thing to size, and zero functional benefit. The cookie approach also makes the demo cleaner — "we removed the session store entirely" is a stronger story than "we added Redis to back the session store."

**`BASE_PATH` support.** This part is unrelated to scaling but was needed for the original ALB-with-path-routing plan. The webapps now read a `BASE_PATH` env var (defaults to `""`). When set, all of the app's routes are mounted under that prefix via `app.use(basePath, router)`, and a `basePath` template local is passed into every EJS view so all `<form action>`, `<a href>`, and asset URLs are prefixed correctly. Redirects in controllers use `req.baseUrl + "/login"` (Express populates `req.baseUrl` from the mount path) so they work regardless of what the prefix is. The health endpoint is **deliberately** mounted at the root, *outside* the prefix, so the kubelet's readiness/liveness probes can hit `/health` directly without knowing about base paths.

In the final manifests we ended up routing each web app through its own dedicated `LoadBalancer` Service (one ALB per app, no shared ingress), so `BASE_PATH` is currently empty. The code still supports prefixing — it costs nothing — and we kept it in case we want to consolidate behind a single ALB later.

**`trust proxy`.** When running behind any cloud load balancer that terminates the connection and re-issues the request to the pod, Express needs `app.set("trust proxy", 1)` to honor the `X-Forwarded-Proto` header. Without it, `req.secure` is always `false` and `secure: true` cookies would never be set. We added a `TRUST_PROXY` env var that controls this and set it to `"true"` in the k8s ConfigMaps.

### 3.3 `svc_analytics`: idempotent snapshot writes

Files changed:
- `svc_analytics/app/db/mongo.py`

`svc_analytics` is pinned to one replica, so this isn't strictly *necessary*. But the same singleton can still produce duplicate writes in one common scenario: a pod restart that happens after the worker has computed and written a snapshot but before it has updated `last_window_end` in memory. The new pod starts fresh, has no `last_window_end`, falls back to "now minus one interval," and re-aggregates the same window. The original code's `insert_one` would happily insert that as a second document, and the dashboard would show double data for that minute.

The fix has two parts:

1. **A unique index** on `(window_start, window_end)` in the `analytics_snapshots` collection. The index is created on `MongoAnalyticsClient` construction with `create_index(..., unique=True, name="uniq_window_bounds")`. MongoDB's `create_index` is idempotent, so this is safe to call on every pod start.

2. **Upsert instead of insert.** `insert_snapshot` now calls `update_one({window_start, window_end}, {$set: ...}, upsert=True)`. If the snapshot already exists for that exact window, it gets harmlessly overwritten with identical data. If it doesn't, it gets inserted. Either way, the dashboard sees exactly one snapshot per window.

This is a 10-line change that buys us correctness under restart. It also future-proofs the service if we ever do figure out a way to scale it (the unique index would still hold).

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

We use **one shared `Secret`** (`env-secret`) and **one `ConfigMap` per workload**. The split is deliberate:

- The `Secret` holds anything sensitive: MySQL passwords for both schemas, the Mongo root password, the JWT signing key, the seed admin password.
- Each `ConfigMap` holds the non-sensitive env (hostnames, ports, DB names, pool sizes, feature flags) for exactly one workload.

We chose **per-workload** ConfigMaps rather than one giant shared one so that:
1. Each workload's `envFrom` only injects the keys it actually needs (no leaking `MONGO_*` into the dataentry pod, etc.).
2. Editing the auth service's pool size doesn't trigger a rollout of the dashboard.
3. The ConfigMaps are labeled with the app they belong to (`app: svc-auth`, etc.), which is useful for `kubectl get cm -l app=svc-auth`.

The `Secret` uses `stringData:` (plain text) instead of `data:` (base64). This is purely a developer-experience choice — `stringData` is editable in a normal text editor and Kubernetes converts it to base64 server-side. The values are still stored as base64 in etcd, exactly the same as if we'd written them as `data:`. For a real production deployment these would come from AWS Secrets Manager via the External Secrets Operator, but for the assignment it would be over-engineering.

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

We used a shell script rather than a `.sql` file because `.sql` files can't reference environment variables — they're piped to mysql verbatim. The script is run as root via the Unix socket (the official `mysql:8.4` image's entrypoint sources every file in `/docker-entrypoint-initdb.d/` in alphabetical order on first boot and gives `.sh` files exactly this kind of shell context). The `${AUTH_MYSQL_*}` values come from the `mysql-env-configmap` ConfigMap and the `env-secret` Secret, both wired into the StatefulSet's pod spec. After this runs, `auth_user` exists and `svc_authentication` can connect to its own database without any cross-talk with the dataentry data.

We also added MySQL resource requests/limits and a `mysqladmin ping` readiness probe so dependent services (auth, analytics, dataentry) don't try to connect during the cold start window.

### 4.3 Service exposure

The two web apps are exposed via `Service` of `type: LoadBalancer`. On EKS, this provisions an actual AWS Network Load Balancer per service, which gives each app its own public DNS name. This is the simplest path for the demo: no ingress controller installation required, no path-routing concerns, no cookie-path edge cases.

`svc_authentication` is exposed via a `ClusterIP` service. It is **not** publicly reachable; only the web apps inside the cluster talk to it. This is correct from a security standpoint — there is no reason for the open internet to be able to call `/auth/login` directly.

`svc_analytics` has **no Service at all**. It's a worker process; nothing calls it. It only makes outbound connections to MySQL and MongoDB.

The two databases use **headless services** (`clusterIP: None`) as is conventional for `StatefulSet`s. This gives each pod a stable DNS name (`mysql-set-0.mysql-service`, etc.), which matters for stateful workloads even when there's only one replica because it future-proofs us if we ever scale to a primary/replica topology.

### 4.4 Probes and resources

Every Deployment has:

- A **readiness probe** on `/health`. Until this passes, the kubelet does not add the pod to its Service's endpoints, so traffic only hits pods that have actually finished initializing (especially important during the slow initial DB connection on auth).
- A **liveness probe** on the same endpoint. If the pod stops responding, the kubelet kills and restarts it.
- **Resource requests** (`100m` CPU, `128Mi` memory) so the scheduler can place pods correctly and the HPA has a baseline to compute "60% utilization" against. **Without `requests`, HPA does not work** — it has nothing to compute a percentage of.
- **Resource limits** (`500m` CPU, `512Mi` memory) so a runaway pod can't starve the rest of the node.

The MySQL StatefulSet got the same treatment with bigger numbers (`200m`/`512Mi` requests, `1` CPU / `1Gi` limits) since it's the heaviest single component and there's only one of it.

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

The HPA scales the `Deployment` between 2 and 6 pods based on average CPU across all pods in the deployment. The reason for `minReplicas: 2` instead of `1`: we want to survive a single-pod failure or a rolling node drain without any user-visible downtime. The `maxReplicas: 6` is a sanity ceiling.

For HPAs to function, the cluster must have **metrics-server** installed. Metrics-server scrapes the kubelet's `/metrics/resource` endpoint and exposes pod CPU/memory through the Kubernetes metrics API, which the HPA controller polls every 15 seconds.

It is also worth setting expectations correctly: HPA is not instant. Scale-up usually takes tens of seconds because the controller waits for sustained pressure, and scale-down is intentionally slower because Kubernetes uses a stabilization window to avoid thrashing.

### 4.6 PodDisruptionBudgets

Each scalable workload also has a `PodDisruptionBudget` with `minAvailable: 1`. PDBs constrain *voluntary* disruptions (node drains during EKS upgrades, manual `kubectl drain`, cluster autoscaler scale-down) — they tell Kubernetes "you may not voluntarily evict the last replica of this app, even if the user asks for it." Combined with `minReplicas: 2`, this means an EKS control-plane upgrade can roll through every node without ever taking the auth service or web apps fully offline.

PDBs do **not** affect the singleton workloads. `svc_analytics` doesn't get one because it has nothing to protect — there's only one pod, and a node drain by definition has to take it down. That brief outage during a drain is acceptable for a periodic worker.

---

## 5. What the demo looks like

This isn't part of the implementation, but it explains what the manifests are *for*.

The horizontal scaling demo flow:

1. Start with the cluster idle. `kubectl get hpa` shows all three HPAs at 2 replicas, low CPU usage.
2. Port-forward the internal `svc_authentication` ClusterIP service so the load generator can hit it without exposing auth publicly:
   ```
   kubectl port-forward svc/svc-auth 8080:8080
   ```
3. Run a CPU-intensive load test against `svc_authentication` (the bcrypt path is the easiest to saturate):
   ```
   hey -z 5m -c 50 -m POST -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"admin"}' \
     http://127.0.0.1:8080/auth/login
   ```
4. Watch the autoscaler and pod CPU while the load is running:
   ```
   watch -n 2 kubectl get hpa
   watch -n 2 kubectl top pods -l app=svc-auth
   watch -n 2 kubectl get pods -l app=svc-auth
   ```
5. Within ~30 seconds, average CPU passes 60%. Within another ~30 seconds, the HPA decides to scale up. New auth pods appear and replica count climbs toward 6.
6. Stop the load. After the HPA's scale-down stabilization window (default 5 minutes), replicas tick back down to 2.

That "grew under load, shrunk after load" cycle is exactly what the rubric is asking for, and the manifests in this PR are the prerequisite for being able to demonstrate it.

---

## 6. Things we deliberately did NOT do

To keep this PR focused and to make the trade-offs explicit:

- **No Redis/session store.** The cookie approach is simpler and equally correct.
- **No managed databases (RDS / DocumentDB).** Out of scope per the assignment.
- **No database HA/replication.** Out of scope.
- **No leader election for `svc_analytics`.** Pinned to a single replica with idempotent writes as the safety net. Real leader election would need either a Kubernetes Lease or an external lock.
- **No load testing scripts in this PR.** The manifests support the demo; the actual `hey`/`k6` runs and screenshots will be generated during the demo phase.
- **No v2 technical report or v2 presentation in this PR.** This document is the *implementation* writeup; the slides and the formal v2 report build on top of it.
- **No `docker-compose.yml` updates.** The Part 2 changes (especially the auth service moving to MySQL and the new env vars) will break local docker-compose until that file is updated. That update will come in a follow-up so it doesn't bloat this PR.
- **No HTTPS / ACM / ALB Ingress.** The current manifests use one `LoadBalancer` Service per web app over plain HTTP. This is fine for the demo but would not be acceptable in production. `COOKIE_SECURE` is already wired to an env var so flipping it to `true` is a one-line change once HTTPS is added.

---

## 7. File-by-file change summary

### Code

| File                                                            | Change                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `svc_authentication/app/core/config.py`                         | Removed `auth_db_path`, added MySQL connection settings + pool sizing           |
| `svc_authentication/app/db/session.py`                          | SQLAlchemy engine now points at MySQL with bounded pool and longer init retry  |
| `svc_authentication/app/db/models.py`                           | Added explicit `String` lengths so `create_all` works against MySQL            |
| `svc_authentication/app/services/startup.py`                    | Catch `IntegrityError` on admin seed so racing replicas don't `CrashLoopBackOff` |
| `svc_authentication/app/requirements.txt`                       | + `pymysql`, `cryptography`                                                    |
| `web_dataentry/app/package.json`                                | − `express-session`, + `cookie-parser`                                          |
| `web_dataentry/app/src/config/env.js`                           | + `BASE_PATH`, `COOKIE_SECURE`, `TRUST_PROXY`; default auth host → `svc-auth`   |
| `web_dataentry/app/src/app.js`                                  | Stateless cookie middleware, BASE_PATH-mounted router, `trust proxy`            |
| `web_dataentry/app/src/middleware/auth.js`                      | Cookie-based token extraction, `req.user` instead of `req.session.user`         |
| `web_dataentry/app/src/middleware/locals.js`                    | Surfaces `req.user` and `basePath` to views                                     |
| `web_dataentry/app/src/controllers/authController.js`           | Sets/clears the cookie; redirects use `req.baseUrl`                             |
| `web_dataentry/app/src/controllers/entryController.js`          | `req.user.username` instead of `req.session.user.username`                      |
| `web_dataentry/app/src/controllers/adminController.js`          | All `req.session.user.access_token` replaced with `req.user.access_token`       |
| `web_dataentry/app/src/views/*.ejs`                             | All form actions and links prefixed with `<%= basePath %>`                      |
| `web_analytics/app/...` (all of the above)                      | Mirrored changes for the analytics web app                                      |
| `web_analytics/app/public/js/dashboard.js`                      | `fetch` URL prefixed with `window.BASE_PATH` for the dashboard data refresh     |
| `svc_analytics/app/db/mongo.py`                                 | Unique index on `(window_start, window_end)` + upsert in `insert_snapshot`      |

### Manifests

| File                | Change                                                                              |
| ------------------- | ----------------------------------------------------------------------------------- |
| `.k8s/env.yml`      | Added per-workload ConfigMaps and new Secret keys (auth pw, JWT secret, admin pw)   |
| `.k8s/db-mysql.yml` | New `02-init-auth.sh` init script; resource requests/limits; readiness probe       |
| `.k8s/svc-auth.yml` | Filled in: Deployment + ClusterIP Service + HPA + PDB                               |
| `.k8s/web-dataentry.yml` | Filled in: Deployment + LoadBalancer Service + HPA + PDB                       |
| `.k8s/web-analytics.yml` | Filled in: Deployment + LoadBalancer Service + HPA + PDB                       |
| `.k8s/svc-analytics.yml` | Filled in: singleton Deployment with `Recreate` strategy and explanatory comment |

---

## 8. Cluster prerequisites

For the manifests in this PR to actually work on a fresh EKS cluster, the cluster needs:

1. **EBS CSI driver** add-on — required by the StorageClass in `aws.yml` so the database PVCs can provision real EBS volumes.
2. **metrics-server** — required by the three HPAs to read pod CPU usage. Without it, HPAs report `<unknown>` for CPU and never scale.
3. **AWS LoadBalancer support** — automatically present on EKS for `Service: type=LoadBalancer`. No extra controller needed because we're not using an Ingress in the current configuration.

These are one-time cluster setup, not part of this PR.
