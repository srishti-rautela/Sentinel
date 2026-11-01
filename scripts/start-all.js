// Starts all 7 services in one terminal (no Docker needed).
const { spawn } = require('child_process');
const path = require('path');
const svcs = ['policy-engine', 'incident-manager', 'auth-service', 'product-service', 'cart-service', 'payment-service', 'notification-service', 'order-service', 'api-gateway'];
const colors = [95, 93, 36, 32, 33, 35, 34, 91, 96];
svcs.forEach((s, i) => {
  const p = spawn('node', [path.join(__dirname, '..', 'services', s, 'index.js')], { stdio: ['ignore', 'pipe', 'pipe'] });
  const out = (d) => d.toString().split('\n').filter(Boolean).forEach((l) => console.log(`\x1b[${colors[i]}m[${s}]\x1b[0m ${l}`));
  p.stdout.on('data', out); p.stderr.on('data', out);
  p.on('exit', (c) => console.log(`\x1b[31m[${s}] exited (code ${c})\x1b[0m`));
  process.on('SIGINT', () => { p.kill(); process.exit(0); });
});

// AI Engine is Python (stdlib only). If Python is missing, Incident Manager falls back to built-in rules.
const py = spawn(process.platform === 'win32' ? 'python' : 'python3', [path.join(__dirname, '..', 'services', 'ai-engine', 'app.py')], { stdio: ['ignore', 'pipe', 'pipe'] });
py.on('error', () => console.log('[ai-engine] Python not found, skipped (fallback rules will be used)'));
py.stdout.on('data', (d) => console.log(`\x1b[90m[ai-engine]\x1b[0m ${d.toString().trim()}`));
process.on('SIGINT', () => { py.kill(); });
