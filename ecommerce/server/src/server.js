import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import Product from './models/Product.js';
import bcrypt from 'bcryptjs';
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
const app = express(); const port = Number(process.env.PORT || 5000); const here = path.dirname(fileURLToPath(import.meta.url));
app.disable('x-powered-by'); app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const allowedOrigins = String(process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(s=>s.trim());
app.use(cors({ origin(origin, callback) { if (!origin || allowedOrigins.includes(origin)) return callback(null, true); return callback(new Error('Origin is not allowed by CORS.')); }, credentials: false }));
app.use(express.json({ limit: '100kb' })); app.use(express.urlencoded({ extended: false, limit: '100kb' })); if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));
app.use('/uploads', express.static(path.resolve(here, '../uploads'), { maxAge: '1d', immutable: true }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));
app.get('/api/health', (_req,res)=>res.json({ status:'ok', service:'tilda-api', timestamp:new Date().toISOString() }));
app.use('/api/auth', authRoutes); app.use('/api/products', productRoutes); app.use('/api/orders', orderRoutes); app.use('/api/uploads', uploadRoutes);
app.use((req,res)=>res.status(404).json({ message:`Route not found: ${req.method} ${req.path}` }));
app.use((err,_req,res,_next)=>{ console.error(err); if (err.name === 'ValidationError') return res.status(400).json({ message: 'Please check the product fields.', details: Object.values(err.errors).map(e=>e.message) }); if (err.code === 11000) return res.status(409).json({ message: 'A record with that value already exists.' }); if (err.name === 'MulterError') return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large.' : 'Image upload failed.' }); const status = err.status || 500; res.status(status).json({ message: status === 500 ? (err.message || 'Unexpected server error.') : err.message }); });
async function start(){
 if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('Set JWT_SECRET to a random string of at least 32 characters in server/.env.');
 await connectDB();
 const email = String(process.env.ADMIN_EMAIL || 'admin@tilda.local').toLowerCase();
 if (!(await User.exists({ email }))) await User.create({ name: process.env.ADMIN_NAME || 'Store Admin', email, passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'ChangeThisAdminPassword123!',12), role:'admin' });
 if (!(await Product.exists())) { const { default: seed } = await import('./seedData.js'); await Product.insertMany(seed); }
 app.listen(port, ()=>console.log(`Tilda API running at http://localhost:${port}`));
}
start().catch(err=>{ console.error('Startup failed:',err.message); process.exit(1); });
