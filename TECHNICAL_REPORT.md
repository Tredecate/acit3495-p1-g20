# ACIT3495 Project 1 Group 20 Technical Report

## 1. Executive Summary
This repository implements a small distributed analytics platform with four application services and two databases.

We used:
- `web_dataentry` to collect environmental readings (eg. temperature) from authenticated users.
- `svc_authentication` to handle login, session tokens, and user management.
- `svc_analytics` to periodically aggregate readings into snapshots.
- `web_analytics` to present snapshot data in a dashboard.
- MySQL to store raw readings.
- MongoDB to store analytics snapshots.

The services are deployed using Docker Compose, using `Dockerfile`s to define the application images and initialization scripts to set up the databases.

## 2. System Architecture

### 2.1 Service Topology
The stack is orchestrated with Docker Compose:
- `db_mysql` (`mysql:8.4`) for raw data storage.
- `db_mongodb` (`mongo:8.2`) for analytics snapshots.
- `svc_authentication` (FastAPI + SQLite) for auth management.
- `svc_analytics` (Python worker) for simple periodic aggregation calculations.
- `web_dataentry` (Express + EJS) for authenticated data input and admin operations.
- `web_analytics` (Express + EJS + Chart.js) for authenticated analytics viewing.

External ports:
- Data Entry UI: `localhost:8080`
- Analytics UI: `localhost:8081`

### 2.2 Dockerfiles
We have two types of `Dockerfile`s:
- Web apps built on NodeJS, which are based on `node:20-alpine`
- Services built on Python, which are based on `python:3.12-slim`

Each `Dockerfile`:
- declares its base image,
- sets environment variables (if applicable, currently just python),
- sets its work directory,
- copies either `requirements.txt` or `package*.json` into the image,
- installs dependencies (with `pip` or `npm`),
- copies the app source code directory into the image,
- exposes the relevant port,
- sets the command to start the service.

(We also tossed in `.dockerignore` files for the node apps, just to cover us in case we'd ran `npm install` locally for testing at some point.)

### 2.3 Database Initialization
Both database images are configured to run any scripts found in `/docker-entrypoint-initdb.d` on startup. So, we took advantage of this to create schemas/collections and indexes the first time either container is run.

We toyed with the idea of having the analytics service initialize the databases, but that kinda goes against the whole Microservices thing, and we didn't want to define an additional service *just* for the databases.

Fortunately, we found the init script feature, so we just mounted the scripts (currently stored in `.volumes/.databasename_init_volume`) with bind mounts to the expected folders inside the database containers.

### 2.4 Docker Compose
Prior to actually creating any of the services, we wrote a `docker-compose.yml` that defined them all. The service definitions include:
- `build`, pointing to each service's directory (excluding the databases)
- `image`, (just for the databases)
- `container_name`, just to keep things clean
- `expose` or `ports`, depending on if we wanted the services to be internal-only or externally accessible
- `env_file`, referring to a shared `.env` file (saved us from a bunch of variable interpolation)
- `depends_on`, which makes sure the services start in the correct order
- `volumes`, which pointed out the database bind mounts and the auth's named volume


## 3. Databases

### 3.1 Raw Readings (MySQL)
We used MySQL to store raw measurements entered by users.

Table `readings` (created by `.volumes/.mysql_init_volume/01-init-readings.sql`):

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

### 3.2 Analytics Snapshots (MongoDB)
We used MongoDB to store snapshots calculated by `svc_analytics`.

Collection `analytics_snapshots` (created by `.volumes/.mongodb_init_volume/01-init-analytics.js`).

Indexes:
- `calculated_at` for latest/range selection.
- `groups.metric_type` and `groups.location` for group filtering.

Snapshots generally include:
- `calculated_at`
- `window_start`, `window_end`
- `source_count`
- `groups[]` with per `(metric_type, location)` stats
- `global_by_metric[]` with global per metric stats

## 4. Authentication and Authorization

### 4.1 Auth Service
`svc_authentication` is a purely ui-less service that provides:
- Credential validation and JWT creation.
- JWT verification and user role.
- User management.

We used:
- `bcrypt` hashing for passwords stored in SQLite
- JWT bearer tokens
- FastAPI dependencies for authorization checks (`api.dependencies.require_admin`)

### 4.2 Guardrails
The auth service also prevents actions that would brick admin access:
- Removing admin role from the last active admin,
- Deactivating the last active admin.

### 4.3 Routes
- `POST /auth/login` -> token + user info
- `GET /auth/me` -> authenticated user context
- `GET /users` (admin) -> list of users
- `POST /users` (admin) -> create user
- `PATCH /users/{username}` (admin) -> update user
- `GET /health` -> health check

## 5. Data Entry Web App

### 5.1 Main Responsibilities
`web_dataentry` primarily performs two main functions:
- Data entry form
- User management page

To do this, it needs to deal with:
- login/logout UX,
- session management,
- form validation,
- auth checks.

### 5.2 Validation and Normalization
Input is validated in `readingValidation.js` on the server (not the client), then a timestamp is normalized to UTC before forwarding to MySQL. This wasn't originally the plan, but encountered some annoying errors so decided to just UTC all the things.
- Server-side validation protects data integrity.
- UTC normalization negates timezone drift.

(We should've just stuck with created-date rather than adding an extra recorded-date field... 🙃)

### 5.3 Authorization & Protecting Pages
When a user logs in, the backend requests a JWT token from `svc_authentication` and stores it as a session cookie in the client's browser.

When a client requests a protected route, the backend verifies the token by checking it with `svc_authentication` through it's `/auth/me` endpoint.
- If token is invalid, session is cleared and user is redirected to login.

We used JWT tokens to make sure the claims aren't able to be faked by a malicious actor, and to simplify the session tracking for the web app specifically. (Yay separation of concerns)

### 5.4 Routes
- `/login`, `/logout`
- `/entry` (GET/POST, auth required)
- `/admin/users` (admin only)

## 6. Analytics Service

### 6.1 Loop Flow
`svc_analytics` uses `time.sleep()` and a `while True:` loop to perform a set of calculations every `ANALYTICS_INTERVAL_SECONDS` (an env variable).

Prior to starting its loop, it also checks to make sure both MySQL and MongoDB are ready and available.

Then, on every execution, it:
1. calculates the window to read data from,
3. fetches MySQL readings from that window,
4. does some calculations to aggregate it into a snapshot,
5. write snapshot to Mongo,
6. sleeps until next cycle.

### 6.2 Target Stats
We just decided to use some basic stats, but in theory this could be expanded:
- `count`
- `min`
- `max`
- weighted `avg`
- `last_recorded_at`

## 7. Analytics Web App

### 7.1 Main Responsibilities
`web_analytics` primarily performs three main functions:
- Dashboard page that displays data
- Data filtering and time range selection
- Chart rendering with Chart.js

To do this, it needs to deal with:
- login/logout UX,
- session management,
- auth checks.

(hey that sounds familiar...)

### 7.2 Range and Timeline Logic
The service:
- loads timeline ticks to display based on snapshot `calculated_at` values,
- fetches snapshots in selected range,
- re-aggregates matched snapshots for display,
- displays!

This gives dynamic date filtering while still leveraging stored snapshots. We thought it was a bit boring at first, otherwise.

### 7.3 Front End Stack
The dashboard itself uses:
- ExpressJS templates for server-side rendering,
- Chart.js for metric average bars,
- noUiSlider for timeline control,
- static CSS/JS assets stored in `/public`.

### 7.4 Routes
- `/login`, `/logout`
- `/dashboard` (auth required)
- `/dashboard/data` (auth required)

## 8. Configuration
We provided an `.env.example` file with all necessary environment variables in one file. It's referenced in the `docker-compose.yml` with the `env_file` keyword, and contains three sections:
- Variables that you *really* should change (secrets/passwords)
- Variables that you can change if you want to (ports, intervals, etc.)
- Variables that you probably don't want to change (other stuff)

## 9. Example User Flow

### 9.1 User Login and Data Entry
1. User logs in on `web_dataentry`.
2. App calls `svc_authentication /auth/login`.
3. Token and user role saved in session.
4. User submits a reading.
5. App validates and inserts into MySQL `readings`.

### 9.2 Analytics Generation and Dashboard Read
1. `svc_analytics` fetches latest window's data from MySQL.
2. Service calculates aggregated snapshot.
3. Snapshot inserted into MongoDB.
4. User opens `web_analytics` dashboard.
5. App fetches snapshots by selected timeframe and renders chart/tables.