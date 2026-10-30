import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { log, startedAt, requestContext, requestTelemetry, metricsText } from '../observability/telemetry.js';

const app = express();
app.disable('x-powered-by');
app.use(requestContext);
app.use(requestTelemetry({ quiet: ['/health', '/metrics'] }));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const mongoState = () => (mongoose.connection.readyState === 1 ? 'up' : 'down');

// Independent health endpoint: reports this process and its MongoDB dependency.
app.get('/health', (_req, res) => {
  const mongo = mongoState();
  const body = {
    status: mongo === 'up' ? 'ok' : 'unhealthy', service: process.env.SERVICE_NAME || 'tilda-service',
    startedAt, uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString(), dependencies: { mongodb: mongo }
  };
  if (mongo !== 'up') body.reason = 'MongoDB connection is not available';
  res.status(mongo === 'up' ? 200 : 503).json(body);
});
app.get('/metrics', (_req, res) => {
  res.type('text/plain; version=0.0.4; charset=utf-8').send(metricsText([
    '# HELP tilda_dependency_up 1 when a dependency is reachable.', '# TYPE tilda_dependency_up gauge',
    `tilda_dependency_up{service="${process.env.SERVICE_NAME || 'tilda-service'}",dependency="mongodb"} ${mongoState() === 'up' ? 1 : 0}`
  ]));
});

// Everything below /health and /metrics needs the database; fail fast and gracefully when it is down.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use((req, res, next) => {
  if (mongoState() === 'up' || req.path.startsWith('/uploads/')) return next();
  res.status(503).json({ message: 'Service is temporarily unavailable (database connection lost). Please retry shortly.', code: 'DEPENDENCY_UNAVAILABLE', dependency: 'mongodb', requestId: req.requestId });
});

function errorHandler(err, req, res, _next) {
  log(err.status && err.status < 500 ? 'warn' : 'error', 'request_error', { requestId: req.requestId, incidentId: req.incidentId, path: req.originalUrl, error: err });
  if (err.name === 'ValidationError') return res.status(400).json({ message: 'Please check the submitted fields.', details: Object.values(err.errors).map(e => e.message) });
  if (err.code === 11000) return res.status(409).json({ message: 'A record with that value already exists.' });
  if (err.name === 'MulterError') return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large.' : 'Image upload failed.' });
  const status = err.status || 500;
  res.status(status).json({ message: status === 500 ? (err.message || 'Unexpected server error.') : err.message, requestId: req.requestId });
}

async function connectWithRetry(name) {
  for (let attempt = 1; ; attempt += 1) {
    try { await connectDB(); log('info', 'mongodb_connected', { host: mongoose.connection.host }); return; }
    catch (error) { if (/MONGODB_URI is missing/.test(error.message)) throw error; log('warn', 'mongodb_connect_retry', { attempt, error }); await new Promise(r => setTimeout(r, 3000)); }
  }
}

// Starts listening immediately (so /health can answer 503 while MongoDB is unavailable), then connects with retry.
export async function startService(name, port) {
  process.env.SERVICE_NAME = name;
  app.use((req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` }));
  app.use(errorHandler);
  const listenPort = Number(process.env.PORT || port);
  const server = app.listen(listenPort, '0.0.0.0', () => log('info', 'service_started', { port: listenPort }));
  const shutdown = signal => {
    log('info', 'shutdown_started', { signal });
    server.close(async () => { try { await mongoose.disconnect(); } catch { /* ignore */ } log('info', 'shutdown_complete'); process.exit(0); });
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  mongoose.connection.on('disconnected', () => log('error', 'mongodb_disconnected'));
  mongoose.connection.on('reconnected', () => log('info', 'mongodb_reconnected'));
  await connectWithRetry(name);
}
export { app };
