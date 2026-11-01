const { createService, listen } = require('../../common/base');
const app = createService('payment-service');
const payments = [];
const LIMIT = 50000;
// internal: called by order-service
app.post('/charge', (req, res) => {
  const { orderRef, amount, userId } = req.body || {};
  if (!(amount > 0)) return res.status(400).json({ error: 'invalid amount' });
  const ok = amount <= LIMIT;
  const p = { paymentId: `PAY-${1000 + payments.length}`, orderRef, userId, amount, status: ok ? 'paid' : 'declined', at: new Date().toISOString() };
  payments.push(p);
  res.status(ok ? 201 : 402).json(p);
});
app.get('/', (req, res) => res.json(payments.slice(-20)));
listen(app, 'payment-service', 3005);
