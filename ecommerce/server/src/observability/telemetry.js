// Shared structured logging + Prometheus metrics for every Tilda Goods service.
// One JSON object per line on stdout -> Docker log driver -> Promtail -> Loki.
import crypto from 'node:crypto';

export const startedAt = new Date().toISOString();
export const serviceName = () => process.env.SERVICE_NAME || 'tilda-service';

export function log(level, event, fields = {}) {
  const { error, ...rest } = fields;
  const line = { timestamp: new Date().toISOString(), service: serviceName(), level, event, ...rest };
  if (error) line.error = error instanceof Error ? error.message : String(error);
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

const esc = v => String(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
const counters = new Map();

export function requestContext(req, res, next) {
  req.requestId = String(req.headers['x-request-id'] || crypto.randomUUID()).slice(0, 80);
  req.incidentId = req.headers['x-incident-id'] ? String(req.headers['x-incident-id']).slice(0, 80) : undefined;
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

// Records metrics + one structured access-log line per request.
export function requestTelemetry({ quiet = [] } = {}) {
  return (req, res, next) => {
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      const seconds = Number(process.hrtime.bigint() - t0) / 1e9;
      const route = req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : (req.baseUrl || 'unmatched');
      const key = `${req.method}|${route}|${res.statusCode}`;
      const c = counters.get(key) || { method: req.method, route, status: res.statusCode, count: 0, sum: 0 };
      c.count += 1; c.sum += seconds; counters.set(key, c);
      const isProbe = quiet.includes(req.path);
      if (isProbe && res.statusCode < 400) return; // keep health probes out of the log stream unless they fail
      log(res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', 'http_request', {
        requestId: req.requestId, incidentId: req.incidentId, method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, durationMs: Math.round(seconds * 1000)
      });
    });
    next();
  };
}

export function metricsText(extra = []) {
  const svc = esc(serviceName());
  const L = [
    '# HELP tilda_http_requests_total HTTP requests handled.', '# TYPE tilda_http_requests_total counter',
    ...[...counters.values()].map(c => `tilda_http_requests_total{service="${svc}",method="${c.method}",route="${esc(c.route)}",status="${c.status}"} ${c.count}`),
    '# HELP tilda_http_errors_total HTTP responses with status >= 500.', '# TYPE tilda_http_errors_total counter',
    ...[...counters.values()].filter(c => c.status >= 500).map(c => `tilda_http_errors_total{service="${svc}",route="${esc(c.route)}",status="${c.status}"} ${c.count}`),
    '# HELP tilda_http_request_duration_seconds_sum Total request duration.', '# TYPE tilda_http_request_duration_seconds_sum counter',
    ...[...counters.values()].map(c => `tilda_http_request_duration_seconds_sum{service="${svc}",method="${c.method}",route="${esc(c.route)}",status="${c.status}"} ${c.sum.toFixed(6)}`),
    '# HELP tilda_http_request_duration_seconds_count Observed request durations.', '# TYPE tilda_http_request_duration_seconds_count counter',
    ...[...counters.values()].map(c => `tilda_http_request_duration_seconds_count{service="${svc}",method="${c.method}",route="${esc(c.route)}",status="${c.status}"} ${c.count}`),
    '# HELP tilda_service_uptime_seconds Process uptime.', '# TYPE tilda_service_uptime_seconds gauge',
    `tilda_service_uptime_seconds{service="${svc}"} ${process.uptime().toFixed(1)}`,
    '# HELP tilda_service_start_time_seconds Process start time (changes on restart).', '# TYPE tilda_service_start_time_seconds gauge',
    `tilda_service_start_time_seconds{service="${svc}"} ${(Date.parse(startedAt) / 1000).toFixed(0)}`,
    ...extra
  ];
  return `${L.join('\n')}\n`;
}
