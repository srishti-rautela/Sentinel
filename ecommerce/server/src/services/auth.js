import { app, startService } from './base.js';
import authRoutes from '../routes/authRoutes.js';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import { log } from '../observability/telemetry.js';
app.use('/', authRoutes);
async function start() {
  await startService('auth-service', 5001);
  const email = String(process.env.ADMIN_EMAIL || 'admin@tilda.local').toLowerCase();
  if (!(await User.exists({ email }))) await User.create({ name: process.env.ADMIN_NAME || 'Store Admin', email, passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'ChangeThisAdminPassword123!', 12), role: 'admin' });
}
start().catch(err => { log('error','startup_failed',{error:err}); process.exit(1); });
