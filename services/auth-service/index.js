const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createService, listen } = require('../../common/base');
const { JWT_SECRET } = require('../../common/config');

const app = createService('auth-service');
const hash = (p) => crypto.createHash('sha256').update(p).digest('hex');
const users = [{ id: 1, name: 'Demo User', email: 'demo@sentinel.com', password: hash('demo123') }];

app.post('/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  if (users.find((u) => u.email === email)) return res.status(409).json({ error: 'email already registered' });
  const u = { id: users.length + 1, name, email, password: hash(password) };
  users.push(u);
  res.status(201).json({ id: u.id, name, email });
});
app.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = users.find((x) => x.email === email && x.password === hash(password || ''));
  if (!u) return res.status(401).json({ error: 'invalid credentials' });
  const user = { id: u.id, name: u.name, email: u.email };
  res.json({ token: jwt.sign(user, JWT_SECRET, { expiresIn: '8h' }), user });
});
app.get('/verify', (req, res) => {
  try {
    const { id, name, email } = jwt.verify((req.headers.authorization || '').slice(7), JWT_SECRET);
    res.json({ user: { id, name, email } });
  } catch { res.status(401).json({ error: 'invalid_token' }); }
});
listen(app, 'auth-service', 3001);
