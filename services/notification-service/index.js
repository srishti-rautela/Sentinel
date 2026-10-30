const { createService, listen } = require('../../common/base');
const requireAuth = require('../../common/auth');
const app = createService('notification-service');
const inbox = []; // simulated email/SMS

app.post('/send', (req, res) => { // internal: called by order-service
  const { userId, message, channel = 'email' } = req.body || {};
  if (!userId || !message) return res.status(400).json({ error: 'userId and message required' });
  const n = { id: inbox.length + 1, userId, channel, message, at: new Date().toISOString() };
  inbox.push(n); console.log(`[${channel}] to user ${userId}: ${message}`);
  res.status(201).json(n);
});
app.get('/', requireAuth, (req, res) => res.json(inbox.filter((n) => n.userId === req.user.id).reverse()));
listen(app, 'notification-service', 3006);
