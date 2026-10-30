# Tilda — Full-stack e-commerce starter

A full-stack storefront rebuilt with React + Vite, Node.js + Express, and MongoDB/Mongoose. Includes local product illustrations, search/category filtering, cart, wishlist, JWT authentication, cash-on-delivery checkout, server-side stock validation, customer order history, image uploads, and admin product/order management.

> **Security & production note:** This is a development-ready starter, not a certified production deployment. Configure a strong JWT secret, change the initial admin credentials, use HTTPS in production, configure trusted CORS origins, back up MongoDB, and test the checkout/admin flows before launch. COD orders are saved as `Pending confirmation`; no online payment gateway is connected.

## Requirements
- Node.js 18.18+ (Node.js 20 LTS recommended)
- npm
- MongoDB Community Server running locally **or** a MongoDB Atlas connection string
- VS Code

## 1. Open the project
Extract the ZIP, open the `tilda-fullstack` folder in VS Code, then open Terminal → New Terminal.

## 2. Configure backend
```bash
cd server
npm install
```
Copy `.env.example` to `.env` and edit it. For Windows PowerShell:
```powershell
Copy-Item .env.example .env
```
For Git Bash/macOS/Linux:
```bash
cp .env.example .env
```
Set `MONGODB_URI`, `JWT_SECRET`, and the initial admin email/password. Do not commit `.env` or share it publicly.

## 3. Start the backend
From the `server` folder:
```bash
npm run dev
```
It runs on `http://localhost:5000`. On first start, it creates the configured admin account if one does not already exist and seeds sample products if the product collection is empty.

## 4. Start React frontend
Open a **second** VS Code terminal, from the project root:
```bash
cd client
npm install
npm run dev
```
Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

## Sample admin login
Use the email and password you set as `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `server/.env`. The backend hashes the password before storing it. Change these defaults before any shared/public deployment.

## Product images
Bundled product illustrations are local files in `client/public/images/`. Product records reference paths such as `/images/notebook.svg`. To use a photo, add a `.jpg`, `.png`, or `.webp` file under `client/public/images/` and update the product's image path. Admins can upload image files using the dashboard; uploads are stored under `server/uploads/` and served from `/uploads/...`.

## API overview
- `GET /api/health` — health check
- `GET /api/products` — public products (supports `q`, `category`, `sort`)
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/orders/my` — signed-in user's orders
- `POST /api/orders` — create COD order; server recalculates totals and reserves stock
- Admin: `POST/PATCH/DELETE /api/products`, `GET/PATCH /api/orders`, `GET /api/admin/stats`
- Admin product image upload: `POST /api/uploads` (`multipart/form-data`, field `image`)

## Troubleshooting
- **MongoDB connection error:** Start MongoDB Community Server or replace `MONGODB_URI` with your Atlas URI. Check database network access and credentials.
- **Port in use:** Change `PORT` in `server/.env` or stop the process using that port.
- **CORS error:** Ensure frontend is running at `http://localhost:5173` or set `CLIENT_URL` accordingly.
- **Images missing:** Confirm the referenced image path exists in `client/public/images/` or `server/uploads/`.
- **Admin login fails:** Use the credentials in `server/.env`; if an admin with that email already exists, changing `ADMIN_PASSWORD` won't reset the existing account automatically. Update the user password in the database using a secure maintenance procedure.

## Production checklist
Use managed MongoDB, HTTPS, secure secret storage, rate limiting and monitoring, backups, explicit CORS allowlist, validated image uploads/CDN, email/order notifications, privacy/return policies, and end-to-end tests. Add a payment gateway only after merchant onboarding and server-side signature verification.


## Visual design update

The storefront styling has been refreshed to follow the supplied Tilda reference: a compact charcoal navigation bar, warm beige editorial hero, product-image cards, clear category filters, minimalist cart and checkout surfaces, and matching admin styling. Product cards and hero imagery include subtle hover/entrance motion, with responsive layouts for mobile. The interface uses the existing bundled local SVG product assets and does not depend on external image URLs.

To use real product photography, copy your JPG/PNG/WebP files into `client/public/images/`, then update the product `image` paths in `server/src/seedData.js` for a newly seeded database or edit product images through the admin dashboard.
