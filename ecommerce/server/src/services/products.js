import { app, startService } from './base.js';
import productRoutes from '../routes/productRoutes.js';
import Product from '../models/Product.js';
import { log } from '../observability/telemetry.js';
app.use('/', productRoutes);
async function start() {
  await startService('product-service', 5002);
  if (!(await Product.exists())) { const { default: seed } = await import('../seedData.js'); await Product.insertMany(seed); }
}
start().catch(err => { log('error','startup_failed',{error:err}); process.exit(1); });
