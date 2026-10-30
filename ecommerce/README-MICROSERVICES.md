# Tilda Goods — Microservices development setup

This update splits the existing Express backend into independently running Auth, Product, Order and Media services, behind an API Gateway. The React frontend keeps using `http://localhost:5000/api`, so existing API paths remain compatible.

## Services
- Gateway: `localhost:5000` — frontend entry point and proxy
- Auth: `5001` — `/api/auth/*` proxied to service root
- Products: `5002` — `/api/products/*`
- Orders: `5003` — `/api/orders/*`
- Media: `5004` — `/api/uploads/*` and `/uploads/*`
- MongoDB: internal Docker service

## Run with Docker Compose (recommended)
1. Install Docker Desktop and start it.
2. Copy `.env.example` to `.env` in the project root.
3. Set `JWT_SECRET` to a random string of at least 32 characters and set a strong `ADMIN_PASSWORD`.
4. From the project root run:
   ```bash
   docker compose up --build
   ```
5. Keep the frontend running in another terminal:
   ```bash
   cd client
   npm install
   npm run dev
   ```
6. Open `http://localhost:5173`. Check `http://localhost:5000/api/health` for service health.

## Run services locally without Docker
Run `npm install` in `server`, configure `server/.env` with `MONGODB_URI`, a strong `JWT_SECRET`, and admin credentials. Start each in a separate terminal from `server`:
```bash
npm run gateway
npm run auth
npm run products
npm run orders
npm run media
```
The default local service URLs are configured for ports 5000–5004. For this local mode, use a running local MongoDB and set the same environment variables in each process (for example via `server/.env`).

## Important architecture note
This is a practical extraction step: services run as separate Node.js processes and communicate through the gateway, but they currently share the same MongoDB database and existing Mongoose models to preserve compatibility with existing data and behavior. This is not yet strict database-per-service ownership. For a production-grade microservices system, next migrate to service-owned databases, replace direct cross-service model access in the Order Service with Product Service APIs/events, and add reliable stock reservation/saga handling, distributed tracing, and integration tests.

## COD behavior
New orders are saved as `Confirmed` with `paymentStatus: Pending`. This means the store has accepted the order; cash is still due at delivery. Existing orders are not automatically changed.

## Security
Do not commit `.env`, production credentials, or JWT secrets. Use secret management and HTTPS in production. The gateway is the intended public entry point; do not expose service ports publicly in production.
