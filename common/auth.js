const cfg = require('./config');
const { call } = require('./http');
const { ah } = require('./base');
// Verifies the Bearer token by calling auth-service (creates a real service dependency).
module.exports = ah(async (req, res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'missing_token' });
  const r = await call(cfg.AUTH, '/verify', { token: h.slice(7) });
  if (!r.ok) return res.status(401).json({ error: 'invalid_token' });
  req.user = r.data.user; req.token = h.slice(7);
  next();
});
