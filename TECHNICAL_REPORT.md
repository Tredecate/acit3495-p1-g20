# ACIT3495 Project 1 Group 20 Technical Report

## 1. Executive Summary
This repository implements a small distributed analytics platform with four application services and two databases.

We used:
- `web_dataentry` to collect environmental readings from authenticated users.
- `svc_authentication` to handle login, token issuance, and admin user management.
- `svc_analytics` to periodically aggregate readings into snapshots.
- `web_analytics` to visualize snapshot data in a dashboard.
- MySQL to store raw readings.
- MongoDB to store analytics snapshots.

The design separates write workload (raw inserts) from read workload (aggregated dashboard queries). This keeps user data entry simple and keeps analytics queries fast.

## 2. System Architecture

### 2.1 Service Topology
The stack is orchestrated with Docker Compose:
- `db_mysql` (`mysql:8.4`) for transactional storage.
- `db_mongodb` (`mongo:8.2`) for analytics documents.
- `svc_authentication` (FastAPI + SQLite) for identity and authorization.
- `svc_analytics` (Python worker) for ETL-style aggregation.
- `web_dataentry` (Express + EJS) for authenticated data input and admin operations.
- `web_analytics` (Express + EJS + Chart.js) for authenticated analytics viewing.

External ports:
- Data Entry UI: `localhost:8080`
- Analytics UI: `localhost:8081`

### 2.2 Why this Split
We used service boundaries for clear responsibilities:
- Authentication logic and user table are isolated in one service.
- Data entry focuses on validation and inserting clean records.
- Analytics worker does periodic computation in background.
- Dashboard reads pre-computed values for faster response.

This is simple to reason about and easy to scale by service role.

## 3. Data Layer Design

### 3.1 MySQL Raw Readings
We used MySQL as the source of truth for raw measurement events.

`readings` schema (initialized by `.volumes/.mysql_init_volume/01-init-readings.sql`):

```sql
CREATE TABLE IF NOT EXISTS readings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    recorded_at DATETIME NOT NULL,
    location VARCHAR(100) NOT NULL,
    metric_type ENUM('temperature_c','humidity_pct','co2_ppm') NOT NULL,
    metric_value DECIMAL(10,2) NOT NULL,
    notes VARCHAR(255) NULL,
    entered_by VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_recorded_at (recorded_at),
    INDEX idx_metric_location_time (metric_type, location, recorded_at),
    INDEX idx_entered_by (entered_by)
);
```

Why we used this:
- Enum metric types give predictable categories.
- `recorded_at` indexes support window queries for the analytics worker.
- `metric_type + location + recorded_at` supports grouped time-window scanning.

### 3.2 MongoDB Analytics Snapshots
We used MongoDB to store denormalized snapshots so dashboard reads do not recalculate aggregates every request.

Collection: `analytics_snapshots` (created/indexed by `.volumes/.mongodb_init_volume/01-init-analytics.js`).

Main indexed fields:
- `calculated_at` for latest/range selection.
- nested `groups.metric_type` and `groups.location` for grouped filtering patterns.

Snapshot structure includes:
- `calculated_at`
- `window_start`, `window_end`
- `source_count`
- `groups[]` with per `(metric_type, location)` stats
- `global_by_metric[]` with global per metric stats

## 4. Authentication and Authorization

### 4.1 Auth Service Responsibilities
`svc_authentication` provides:
- `POST /auth/login` for credential validation and JWT issuance.
- `GET /auth/me` for token verification and user context.
- `POST /users`, `GET /users`, `PATCH /users/{username}` for admin user management.

We used:
- `bcrypt` hashing (configurable rounds) for password storage.
- JWT bearer tokens (`HS256`) with `sub`, `is_admin`, `iat`, `exp` claims.
- role checks in dependencies (`require_admin`) for admin routes.

### 4.2 Startup Seeding
On startup, auth service:
1. validates required environment variables,
2. initializes password context,
3. initializes DB schema,
4. seeds initial admin user if no users exist.

This gives deterministic bootstrap behavior for local/dev environments.

### 4.3 Guardrails
Admin update logic prevents lockout of the platform by blocking:
- removing admin role from the last active admin,
- deactivating the last active admin.

This is a practical operational safety check.

## 5. Data Entry Web App

### 5.1 Main Responsibilities
`web_dataentry` handles:
- login/logout UX,
- session management,
- secure data entry form,
- admin user management page.

It keeps a server-side session and stores auth token in session state.

### 5.2 Validation and Normalization
Input is validated in `readingValidation.js`:
- required `recorded_at`
- location length 1 to 100
- metric type in allowed list
- numeric metric value
- timezone offset bounds
- notes length <= 255

Then timestamp is normalized to UTC before insert.

Example insert flow:

```javascript
await pool.execute(
  `INSERT INTO readings (
    recorded_at,
    location,
    metric_type,
    metric_value,
    notes,
    entered_by
  ) VALUES (?, ?, ?, ?, ?, ?)`,
  [recordedAt, normalized.location, normalized.metricType,
   normalized.metricValue, normalized.notes, req.session.user.username]
);
```

Why we used this:
- Clean server-side validation protects DB integrity.
- UTC normalization avoids timezone drift in analytics windows.

### 5.3 Authorization in UI
Middleware verifies token via `/auth/me` on protected routes.
If token is invalid, session is cleared and user is redirected to login.

Admin-only routes (`/admin/users`) require both authentication and admin flag.

## 6. Analytics Worker Service

### 6.1 Processing Model
`svc_analytics` runs as a long-running worker with a fixed interval (`ANALYTICS_INTERVAL_SECONDS`).

Cycle behavior:
1. wait for MySQL and Mongo readiness,
2. compute current window,
3. fetch MySQL readings in window,
4. aggregate into snapshot,
5. write snapshot to Mongo,
6. sleep until next cycle.

Core run loop:

```python
while True:
    started = time.monotonic()
    try:
        self.run_once()
    except Exception as exc:
        log_event("error", "run_failed", error=str(exc))

    elapsed = time.monotonic() - started
    sleep_seconds = max(1, self.interval_seconds - int(elapsed))
    time.sleep(sleep_seconds)
```

### 6.2 Aggregation Strategy
We used two aggregation levels:
- group-level: `(metric_type, location)`
- global-level: `metric_type`

Each aggregate tracks:
- `count`
- `min`
- `max`
- weighted `avg`
- `last_recorded_at`

This provides both local detail and high-level trend metrics in one snapshot document.

### 6.3 Operational Benefits
- Dashboard reads stay fast because metrics are precomputed.
- Worker failures are isolated from user-facing services.
- Time windows are explicit and auditable (`window_start`, `window_end`).

## 7. Analytics Web App

### 7.1 Main Responsibilities
`web_analytics` provides:
- authenticated dashboard page,
- `/dashboard/data` JSON endpoint for filtered/ranged data,
- timeline range selection UX,
- chart rendering with Chart.js.

### 7.2 Range and Timeline Logic
The service:
- loads timeline markers from snapshot `calculated_at` values,
- resolves requested start/end against available bounds,
- fetches snapshots in selected range,
- re-aggregates matched snapshots for display,
- builds chart data arrays (`labels`, `values`).

This gives dynamic date filtering while still leveraging stored snapshots.

### 7.3 Front End Stack
Dashboard uses:
- EJS SSR template,
- Chart.js for metric average bars,
- noUiSlider for timeline control,
- static CSS/JS assets from `public`.

## 8. API and Contract Summary

### 8.1 Authentication Service APIs
- `POST /auth/login` -> token + user info
- `GET /auth/me` -> authenticated user context
- `GET /users` (admin)
- `POST /users` (admin)
- `PATCH /users/{username}` (admin)
- `GET /health`

### 8.2 Web Application Routes
`web_dataentry`:
- `/login`, `/logout`
- `/entry` (GET/POST, auth required)
- `/admin/users` (admin only)

`web_analytics`:
- `/login`, `/logout`
- `/dashboard` (auth required)
- `/dashboard/data` (auth required)

## 9. Configuration and Environment

Required examples include:
- Auth: `WEB_AUTH_ADMIN_USER`, `WEB_AUTH_ADMIN_PASSWORD`, `AUTH_JWT_SECRET`
- MySQL: `MYSQL_HOST_ADDR`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`
- Mongo: `MONGO_HOST_ADDR`, `MONGO_PORT`, `MONGO_INITDB_DATABASE`, `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`
- Runtime: `SESSION_SECRET`, `ANALYTICS_INTERVAL_SECONDS`

Each service validates required values at startup where relevant.

## 10. Logging, Error Handling, and Health

### 10.1 Error Model
Auth service returns a consistent JSON error shape:

```json
{
  "error": {
    "code": "invalid_credentials",
    "message": "Invalid username or password"
  }
}
```

This makes web clients simple to implement and maintain.

### 10.2 Request Tracing
Auth middleware propagates `X-Request-Id` and logs requests with request ID context.

### 10.3 Health Endpoints
- Auth has DB-aware health check.
- Web apps include health routes.
- Analytics worker logs dependency retry attempts and runtime failures.

## 11. Security Design

We used practical baseline controls:
- Password hashing with bcrypt.
- JWT expiration with server-side signature verification.
- Admin role enforcement at API dependency level and web route middleware.
- Session cookies with `httpOnly` and `sameSite=lax`.
- Username uniqueness and active-admin guardrail.

Current dev-oriented defaults to note:
- session cookie `secure` is false in app code (works in local HTTP).
- internal service traffic is plain HTTP in Docker network.

For production, enable HTTPS and secure cookie settings.

## 12. End to End Flow

### 12.1 User Login and Data Submission
1. User logs in on `web_dataentry`.
2. App calls `svc_authentication /auth/login`.
3. Token and user role saved in session.
4. User submits reading.
5. App validates and inserts into MySQL `readings`.

### 12.2 Analytics Generation and Dashboard Read
1. `svc_analytics` polls new MySQL window.
2. Service computes grouped and global metrics.
3. Snapshot inserted into MongoDB.
4. User opens `web_analytics` dashboard.
5. App fetches snapshots by selected timeframe and renders chart/tables.

## 13. What Worked Well
- Clear separation of concerns.
- Good local bootstrap with Docker Compose and seeded admin.
- Solid input validation for readings.
- Practical admin management features.
- Dashboard designed around precomputed data for speed.

## 14. Known Tradeoffs
- Auth user store is SQLite in service volume, separate from MySQL data domain.
- Worker runs interval polling instead of event-driven streaming.
- Dashboard aggregations are recomputed from selected snapshots on request.
- Session store is default in-memory store in Express (fine for coursework/dev).

These are acceptable choices for a course-scale system and keep complexity low.

## 15. Recommended Next Improvements
If extended beyond coursework, next steps are:
1. Use Redis-backed session store.
2. Add refresh token flow or revocation list.
3. Add structured centralized logs across services.
4. Add contract tests between web apps and auth service.
5. Add retention/archival policy for old snapshots.
6. Optionally move worker to queue/event architecture.

## 16. Conclusion
This solution is a clean multi-service architecture where each component has one clear job. We used MySQL for raw event writes, MongoDB for snapshot reads, and a dedicated analytics worker to connect both. Authentication is centralized and reused by both web apps. The result is simple to run, fast enough for the project scope, and easy to explain and maintain.