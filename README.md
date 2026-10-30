# Sentinel Platform + Tilda Goods microservices

One Sentinel platform, two kinds of project:

* **Campus Cart** — the existing public-URL project. Not modified (its record in `backend/data.json` is untouched).
* **Tilda Goods E-commerce** — a new project backed by five real Docker containers. Sentinel monitors them over the internal Docker network, opens incidents when they fail, and recovers them through an isolated Recovery Controller.

```
Storefront (5174) ─► API Gateway (5000) ─┬─► auth (5001)  ─┐
                                         ├─► products (5002)├─► MongoDB
                                         ├─► orders (5003)  │
                                         └─► media (5004) ──┘ (uploads volume)

Sentinel UI (5173) ─► Sentinel API (4000) ── health checks every 5s ──► gateway/auth/products/orders/media
                                         └── approved restart ──► Recovery Controller ──► Docker socket
Prometheus (9090) · Loki (3100) · Promtail · Grafana (3001)
```

The storefront and Sentinel are separate apps in separate folders (`ecommerce/` and `frontend/` + `backend/`); they only meet on the Docker network.

## Run it (VS Code + Docker Desktop on Windows)

1. Start **Docker Desktop** (WSL 2 backend) and wait until it says *Engine running*.
2. Open this folder in VS Code → **Terminal → New Terminal** (PowerShell).
3. Optional: `.env` already has local-development defaults. Change the secrets before sharing the project (see `.env.example`).
4. Build and start everything:
   ```powershell
   docker compose up --build -d
   docker compose ps
   ```
   The first build takes a few minutes. Wait until the services show `healthy`.

| What | URL |
|---|---|
| Sentinel | http://localhost:5173 |
| Tilda Goods storefront | http://localhost:5174 |
| API Gateway health | http://localhost:5000/api/health |
| Grafana (admin / `GRAFANA_ADMIN_PASSWORD`) | http://localhost:3001 → *Sentinel → Tilda Goods — microservices* |
| Prometheus / Loki | http://localhost:9090 · http://localhost:3100 |

Storefront admin: `admin@tilda.local` / the `ADMIN_PASSWORD` value in `.env`.
Sentinel: sign in with your existing account. Your existing users, Campus Cart project, incidents and history are kept (`backend/data.json`). On first start Sentinel adds the **Tilda Goods E-commerce** project to each workspace; new accounts get it automatically.

## The demo flow

1. **Sentinel → Services**: five services, real statuses, refreshed every 5 seconds.
2. Stop a service — either from the Services page (**Stop**) or from the terminal:
   ```powershell
   docker compose stop products
   ```
3. Within ~10–15 s (2 failed checks) the service turns **DOWN** and an incident appears in **Sentinel → Incidents** (source badge *Docker service*), with severity, failure reason, impact and recommendations.
4. Open the incident → **Approve Restart**. The Recovery Controller restarts only that container.
5. The service goes **RECOVERING**; after **2 consecutive healthy checks** it is **HEALTHY** and the incident resolves automatically with recovery time and duration. If the restart fails, or the service never becomes healthy, the incident stays **OPEN** and offers **Retry Recovery**.
6. *Resolve manually* remains available as a separate, audited action (it records who did it and that no verification happened).

## How it works

* **Trusted internal monitoring.** `backend/service-registry.js` lists the Docker health URLs (`http://products:5002/health`, …). They are read from the server only — no API accepts a URL — and each must be a single-label Docker DNS name or listed in `TRUSTED_INTERNAL_HOSTS`. The public-URL validator in `server.js` (which rejects localhost/private IPs) is unchanged.
* **State machine** (`backend/docker-monitor.js`): HEALTHY / DEGRADED / DOWN / RECOVERING / UNKNOWN from real HTTP probes. Defaults: 5 s interval, 2 failures → DOWN, 2 successes → HEALTHY (`SERVICE_CHECK_INTERVAL_MS`, `SERVICE_FAILURE_THRESHOLD`, `SERVICE_RECOVERY_THRESHOLD`). One incident per continuous outage.
* **Incidents** use the existing `db.incidents` store and `/api/incidents`; Docker incidents add `source: "docker"`, service/container, timeline, evidence and recovery fields. Existing URL incidents are unchanged (shown as *Public URL*).
* **Recovery Controller** (`recovery-controller/`): the only container with the Docker socket. Bearer-token protected; hard-coded allowlist `gateway|auth|products|orders|media` → fixed container names; supports only stop / start / restart / inspect / logs. No published port; the browser never reaches it or the socket.
* **Tilda services** (`ecommerce/server`): one image, five separate containers/processes. Each has `/health` (reports MongoDB status, returns 503 when the DB is down), `/metrics`, structured JSON logs (`timestamp, service, level, event, requestId, incidentId, error`) and graceful shutdown. The gateway returns **503** (unreachable), **504** (timeout) or **502** with a clear JSON message when a downstream service is stopped, and keeps serving the others.
* **Observability**: Prometheus scrapes Sentinel (`sentinel_service_*` health/uptime/failures/restarts/outages) and every service (`tilda_http_*`); Promtail ships all container logs to Loki; Sentinel's service **Logs** tab reads from the container (via the controller) or from Loki.

Gateway `/api/health` describes the gateway itself; its `services` field lists downstream status but does not make the gateway DEGRADED, so stopping `products` produces exactly one incident.

## Test checklist

```powershell
docker compose up --build -d          # 1. all five services HEALTHY, no incidents
docker compose stop products          # 2. Product incident; GET http://localhost:5000/api/products -> 503; other pages still work
docker compose stop orders            # 3. Order incident; checkout fails gracefully, browsing works
docker compose stop auth              # 4. Auth incident; login/register fail gracefully
docker compose stop media             # 5. Media incident; uploads fail gracefully
docker compose stop gateway           #    Gateway incident (critical)
# 6. Sentinel -> Incidents -> Approve Restart -> RECOVERING -> HEALTHY -> RESOLVED
# 7. every `docker compose stop ...` above is an external failure; no Sentinel button involved
# 8. Sign in with an existing account: Campus Cart, old incidents and Monitoring still there
# 9. Storefront: register, login, browse, cart, checkout (Cash on Delivery), order history, admin products/orders, image upload
docker compose start products orders auth media gateway   # restore anything left stopped
```

## Troubleshooting

* **Services show UNKNOWN for the first ~90 s** — startup grace period while containers boot; no incident is raised during it.
* **"Recovery Controller unreachable"** — `docker compose ps recovery-controller`; check `RECOVERY_TOKEN` is the same for backend and controller (both read it from `.env`); `docker compose logs recovery-controller`.
* **Docker socket errors on Windows** — use Docker Desktop with the WSL 2 backend; run `docker compose` from PowerShell or WSL.
* **Storefront cannot reach the API** — the browser calls `http://localhost:5000/api`; check `docker compose ps gateway` and that port 5000 is free. If you change the gateway port, rebuild the storefront with `VITE_API_URL`.
* **Port already in use** — stop whatever uses 5000/5173/5174/4000/9090/3001/3100, or edit the left side of the `ports:` mappings.
* **Products empty** — Product Service seeds the catalogue on first start; `docker compose logs products`.
* **Reset only the e-commerce data** — `docker compose down` then `docker volume rm sentinel-platform-v4-observability_mongo_data` (use `docker volume ls` for the exact name). Sentinel's `backend/data.json` is not affected.
* **Logs** — `docker compose logs -f products` (JSON lines).

## Notes and limits

* Docker socket access is for local demonstration only. Do not deploy this controller design to a shared host.
* All services share one MongoDB database (as in the original Tilda split); see `ecommerce/README-MICROSERVICES.md`. Product/Order services verify JWTs with the shared secret, so admin product/order calls keep working if only the Auth service is stopped; login/registration do not.
* Sentinel's original README is in `docs/README-sentinel-original.md`.
