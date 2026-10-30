// Recovery executor. Docker mode: restarts the container through the Docker socket.
// Local mode (no Docker): stops the process and starts it again.
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { targets, T } = require('./detector');

const SOCK = process.env.DOCKER_SOCK || '/var/run/docker.sock';
const mode = () => (fs.existsSync(SOCK) ? 'docker' : 'local');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dockerReq = (method, p) => new Promise((res, rej) => {
  const r = http.request({ socketPath: SOCK, path: p, method }, (x) => { let b = ''; x.on('data', (d) => (b += d)); x.on('end', () => res({ status: x.statusCode, body: b })); });
  r.on('error', rej); r.end();
});

async function restartDocker(service) {
  const f = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.service=${service}`] }));
  const list = JSON.parse((await dockerReq('GET', `/containers/json?all=true&filters=${f}`)).body);
  if (!list.length) throw new Error(`no container found for ${service}`);
  const r = await dockerReq('POST', `/containers/${list[0].Id}/restart?t=2`);
  if (r.status >= 300) throw new Error(`docker restart failed (HTTP ${r.status})`);
  return `docker restart ${list[0].Names[0].replace('/', '')}`;
}
async function restartLocal(service) {
  try { await fetch(targets[service] + '/chaos/crash', { method: 'POST', signal: AbortSignal.timeout(1000) }); await sleep(900); } catch { /* already down */ }
  spawn(process.execPath, [path.join(__dirname, '..', service, 'index.js')], { detached: true, stdio: 'ignore' }).unref();
  return `local process restart (node services/${service}/index.js)`;
}
async function run(service, action) {
  if (action !== 'restart') throw new Error(`action "${action}" is not implemented yet (scale arrives with Kubernetes in Implementation-2)`);
  return mode() === 'docker' ? restartDocker(service) : restartLocal(service);
}
// Recovery verification: healthy and memory normal for 3 consecutive checks.
async function verify(service, timeoutMs = 25000) {
  const start = Date.now(); let good = 0;
  while (Date.now() - start < timeoutMs) {
    await sleep(1000);
    try {
      const r = await fetch(targets[service] + '/health', { signal: AbortSignal.timeout(1500) });
      const d = await r.json().catch(() => ({}));
      good = r.ok && (d.memoryMB ?? 0) < T.memoryMB ? good + 1 : 0;
      if (good >= 3) return { ok: true, seconds: Math.round((Date.now() - start) / 1000) };
    } catch { good = 0; }
  }
  return { ok: false, seconds: Math.round((Date.now() - start) / 1000) };
}
module.exports = { run, verify, mode };
