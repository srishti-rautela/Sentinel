import { app, startService } from './base.js';
import orderRoutes from '../routes/orderRoutes.js';
import { log } from '../observability/telemetry.js';
app.use('/', orderRoutes);
startService('order-service', 5003).catch(err => { log('error','startup_failed',{error:err}); process.exit(1); });
