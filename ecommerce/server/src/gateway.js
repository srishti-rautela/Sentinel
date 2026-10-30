import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { log, startedAt, requestContext, requestTelemetry, metricsText } from './observability/telemetry.js';

process.env.SERVICE_NAME = 'api-gateway';
const app = express();
const port = Number(process.env.GATEWAY_PORT || process.env.PORT || 5000);
const origins = String(process.env.CLIENT_URL || 'http://localhost:5174').split(',').map(s => s.trim());
const upstreams = {
  auth: { label: 'Authentication Service', url: process.env.AUTH_SERVICE_URL || 'http://localhost:5001' },
  products: { label: 'Product Service', url: process.env.PRODUCT_SERVICE_URL || 'http://localhost:5002' },
  orders: { label: 'Order Service', url: process.env.ORDER_SERVICE_URL || 'http://localhost:5003' },
  media: { label: 'Media Service', url: process.env.MEDIA_SERVICE_URL || 'http://localhost:5004' }
};
const upstreamFailures = new Map(Object.keys(upstreams).map(k => [k, 0]));

app.disable('x-powered-by');
app.use(requestContext);
app.use(requestTelemetry({ quiet: ['/api/health', '/metrics'] }));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin(origin, callback) { if (!origin || origins.includes(origin)) return callback(null, true); return callback(new Error('Origin is not allowed by CORS.')); }, credentials: false }));

// Health + metrics are registered before the rate limiter so monitoring is never throttled.
// Gateway health describes the gateway itself; downstream status is reported separately and does not make the gateway unhealthy.
app.get('/api/health', async (_req, res) => {
  const results = await Promise.all(Object.entries(upstreams).map(async ([name, { url }]) => {
    try { const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) }); return [name, r.ok ? 'ok' : 'unhealthy']; } catch { return [name, 'unavailable']; }
  }));
  const services = Object.fromEntries(results);
  res.json({ status: 'ok', service: 'tilda-api-gateway', startedAt, uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString(), downstreamStatus: results.every(([, s]) => s === 'ok') ? 'ok' : 'degraded', services });
});
app.get('/metrics', (_req, res) => {
  res.type('text/plain; version=0.0.4; charset=utf-8').send(metricsText([
    '# HELP tilda_gateway_upstream_failures_total Requests that could not reach an upstream service.', '# TYPE tilda_gateway_upstream_failures_total counter',
    ...[...upstreamFailures].map(([k, n]) => `tilda_gateway_upstream_failures_total{upstream="${k}"} ${n}`)
  ]));
});

app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

// Meaningful 502/503/504 responses when a downstream container is stopped, unreachable or too slow.
const proxy = (key, prefix) => createProxyMiddleware({
  target: upstreams[key].url, changeOrigin: true, proxyTimeout: 10000, timeout: 12000,
  pathRewrite: { [`^${prefix}`]: '' },
  on: {
    proxyReq(proxyReq, req) { proxyReq.setHeader('X-Request-Id', req.requestId); if (req.incidentId) proxyReq.setHeader('X-Incident-Id', req.incidentId); },
    error(err, req, res) { upstreamError(key, err, req, res); }
  }
});
function upstreamError(key, err, req, res) {
  upstreamFailures.set(key, (upstreamFailures.get(key) || 0) + 1);
  const code = err.code || err.cause?.code || 'UNKNOWN';
  const unreachable = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code);
  const timeout = ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET'].includes(code) && !unreachable;
  const status = unreachable ? 503 : timeout ? 504 : 502;
  log('error', 'upstream_failure', { requestId: req.requestId, incidentId: req.incidentId, upstream: key, upstreamLabel: upstreams[key].label, method: req.method, path: req.originalUrl, status, code, error: err });
  if (!res || typeof res.writeHead !== 'function') return;
  if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json', 'X-Request-Id': req.requestId });
  res.end(JSON.stringify({
    message: `${upstreams[key].label} is temporarily unavailable. Please try again shortly.`,
    code: unreachable ? 'SERVICE_UNAVAILABLE' : timeout ? 'SERVICE_TIMEOUT' : 'BAD_GATEWAY', service: key, requestId: req.requestId
  }));
}
app.use('/api/auth', proxy('auth', '/api/auth'));
app.use('/api/products', proxy('products', '/api/products'));
app.use('/api/orders', proxy('orders', '/api/orders'));
app.use('/api/uploads', proxy('media', '/api/uploads'));
app.use('/uploads', createProxyMiddleware({
  target: upstreams.media.url, changeOrigin: true, proxyTimeout: 10000,
  pathRewrite: path => `/uploads${path.startsWith('/') ? path : `/${path}`}`,
  on: { error(err, req, res) { upstreamError('media', err, req, res); } }
}));
app.use((req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` }));
app.use((err, req, res, _next) => { log('error', 'gateway_error', { requestId: req.requestId, error: err }); res.status(err.status || 500).json({ message: err.message || 'Gateway error.', requestId: req.requestId }); });

const server = app.listen(port, '0.0.0.0', () => log('info', 'service_started', { port }));
const shutdown = signal => { log('info', 'shutdown_started', { signal }); server.close(() => { log('info', 'shutdown_complete'); process.exit(0); }); setTimeout(() => process.exit(0), 5000).unref(); };
process.once('SIGTERM', () => shutdown('SIGTERM')); process.once('SIGINT', () => shutdown('SIGINT'));
