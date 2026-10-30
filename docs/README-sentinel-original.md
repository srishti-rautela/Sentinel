# Sentinel Platform — Observability Preview v0.4.0

An independent Sentinel control-plane starter. This is separate from the E-Commerce website and is the first build milestone: account creation/login, private workspace-scoped project registry, public URL health checks, incident records, and an early dashboard.

## Included in this milestone

- Sign up and sign in with bcrypt password hashing and signed JWTs.
- A private workspace is created for each new user.
- Project registry with tenant/workspace scoping on API reads, writes, checks, deletes, and incidents.
- Public HTTP/HTTPS URL checks on project creation, on-demand, and every 60 seconds.
- Response latency, HTTP status, latest check time, basic degraded/unhealthy incident creation, and recovery-to-healthy resolution.
- A separate “Local / Agent” project type so local projects can be registered while agent telemetry is built in a later milestone.
- Responsive dashboard with Overview, My Projects, Monitoring History, Incidents, and Settings pages.
- Light/dark theme toggle in the top bar and Settings → Appearance.
- Edit existing project name, description, connection type, and monitored URL from My Projects.
- Server-side scheduled URL checks every 60 seconds while the backend process is running.
- Sample uptime/success rate from the recorded checks and automatic incident creation/resolution based on check results.

## Not implemented yet

This is a starter, not a production-ready SaaS. Docker/Kubernetes agents, Prometheus integration, log/trace ingestion, AI diagnosis, policy engine, automatic recovery, email verification, password reset, team memberships, and production database migrations are not wired into this milestone. Agent-connected projects display “Agent needed”; they are not live-monitored yet.

## Requirements

- Node.js 20 or newer recommended
- npm

## Run locally

Open a terminal in this folder:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
cp .env.example .env
```

Set `JWT_SECRET` in `.env` to a long random value before deployment. The API loads this file through `dotenv`. For local-only development, the built-in fallback secret works but must never be used for deployment.

Start the API in terminal 1:

```bash
npm run dev --prefix backend
```

Start the UI in terminal 2:

```bash
npm run dev --prefix frontend
```

Open `http://localhost:5173`. The API runs on `http://localhost:4000`.

## Local data

The API creates `backend/data.json` at runtime. This is a simple development store so the first milestone is easy to run. It is not intended for multi-instance production use; move to MongoDB with indexes, schema validation, migrations, and backups before deployment.

## Monitoring safety

URL mode is intended for public HTTP/HTTPS endpoints only. It rejects common private/local address ranges to reduce SSRF risk. This is defense-in-depth for a local prototype, not a complete production SSRF defense (DNS rebinding, redirect policy, outbound firewalling, and egress controls still need hardening). Do not enter URLs for systems you do not own or have permission to monitor. Private/local apps should be connected through a future authenticated customer-side agent, not by opening private network access to the platform.

## Next milestone

1. Replace the JSON development store with MongoDB.
2. Add authenticated agent enrollment and signed telemetry.
3. Integrate Prometheus/Alertmanager.
4. Add AI diagnosis and evidence-linked recommendations.
5. Add policy-validated, allowlisted recovery actions with approval, audit logs, and health verification.


## Monitoring history (v0.2.0)

The Monitoring page reads the last 50 saved checks for a selected URL-connected project. It shows the sample check success rate (not an SLA-grade uptime guarantee), average/latest response time, a latency chart, and recent HTTP/status details. The history refreshes while the page is open. Check records are written to the JSON development store (`backend/data.json` by default).

To use the update, replace the previous `sentinel-platform-v1` folder with this `sentinel-platform-v2` folder, then run `npm install` from the project root and `npm run dev`. Your existing local `backend/data.json` can be copied into the new `backend` folder if you want to preserve the account and project data; stop the old server first and keep a backup. Do not overwrite a newer data file.

## Appearance themes

The dashboard now includes a light/dark theme toggle in the top bar and in Settings → Appearance. The selected theme is saved in this browser using `localStorage` and does not affect the separate CampusCart application.

## Scheduled checks and incident lifecycle

The local backend runs URL health checks every 60 seconds while its process is alive. Each check is saved, and an incident is created when an endpoint returns a non-success HTTP status or becomes unreachable. A later successful check resolves open incidents for that project. This is a prototype: the timer is not durable across restarts, and a production service should use a persistent database and dedicated scheduler/worker. Avoid automated recovery actions until policy checks and audit logs exist.

## Editing projects

Use My Projects → the edit/settings icon to update the project name, description, connection type, or health-check URL. Saving a changed public URL runs a fresh check. Check history is retained; open incidents are updated with the new project name.

## Run Sentinel with Docker Desktop (local development)

1. Stop any locally running Sentinel processes using ports 4000 and 5173.
2. Ensure `backend/data.json` exists. Back it up before starting containers.
3. From this project root, run `docker compose up --build`.
4. Open `http://localhost:5173`. The API health endpoint is `http://localhost:4000/api/health`.
5. Stop the stack with `Ctrl+C`, then run `docker compose down`. The data file remains on your host because it is bind-mounted.

This Compose setup is for local development/demo use, not production deployment. It runs the Vite development server. Do not expose these ports to the public internet. Set a strong `JWT_SECRET` in a local `.env` file before using beyond a disposable local demo. Do not commit `.env` or account data.


## Observability preview (v0.4.0)

This preview adds basic metrics and centralized Docker log collection to Sentinel's own stack, so the observability plumbing can be demonstrated before the e-commerce application is ready.

### Services and local URLs

- Sentinel UI: `http://localhost:5173`
- Sentinel API health: `http://localhost:4000/api/health`
- Sentinel API Prometheus metrics: `http://localhost:4000/metrics`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001` (default local demo login `admin` / `change-this-password`; change this before use)
- Loki API: `http://localhost:3100`

### Start

1. Back up `backend/data.json` and keep your existing Sentinel folder untouched.
2. Copy `.env.docker.example` to `.env` in this project root and set a unique `JWT_SECRET` and `GRAFANA_ADMIN_PASSWORD`.
3. Run `docker compose up --build`.
4. In Prometheus, open **Status → Targets** and confirm `sentinel-api` is `UP`.
5. In Grafana, explore the Prometheus datasource and query `sentinel_http_requests_total`. In Explore, choose Loki and query `{container=~".+"}` to inspect collected Docker logs.

The `/metrics` endpoint currently exports Sentinel API request totals by method/route/status, accumulated request duration, process uptime, and resident memory. Request logs are emitted as JSON to stdout and collected from Docker container logs by Promtail into Loki.

### Scope and limitations

- This is a local development/demo configuration. Prometheus and Loki are not connected to the existing Sentinel incident UI yet; they are separate observability tools at this stage.
- Metrics currently describe the Sentinel API only, not the separate e-commerce application.
- Automatic alert-to-incident integration, service-specific e-commerce metrics, log-to-incident correlation, AI diagnosis, policy enforcement and recovery remain future work.
- Promtail uses the Docker Engine socket to discover container logs. Treat the socket as a privileged interface; keep this stack local and do not expose its ports publicly.
- The Docker socket mount and Linux container logging discovery should be tested on the target Docker Desktop installation. If Promtail cannot discover containers on a particular setup, use Docker's built-in logs (`docker compose logs`) until the collector configuration is adjusted.
