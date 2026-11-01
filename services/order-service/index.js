const { createService, listen, ah } = require('../../common/base');
const requireAuth = require('../../common/auth');
const { call } = require('../../common/http');
const cfg = require('../../common/config');

const app = createService('order-service');
const orders = [];

app.use(requireAuth);
app.get('/', (req, res) => res.json(orders.filter((o) => o.userId === req.user.id).reverse()));
app.get('/:id', (req, res) => {
  const o = orders.find((x) => x.id === Number(req.params.id) && x.userId === req.user.id);
  o ? res.json(o) : res.status(404).json({ error: 'order not found' });
});

// Checkout: cart -> reserve stock -> payment -> save order -> notify -> clear cart
app.post('/checkout', ah(async (req, res) => {
  const cart = await call(cfg.CART, '/', { token: req.token });
  if (!cart.ok) return res.status(502).json({ error: 'dependency_failure', service: 'cart-service' });
  const items = cart.data.items;
  if (!items.length) return res.status(400).json({ error: 'cart is empty' });
  const total = cart.data.total;
  const stockItems = items.map((i) => ({ productId: i.productId, qty: i.qty }));

  const stock = await call(cfg.PRODUCT, '/reserve', { method: 'POST', body: { items: stockItems } });
  if (!stock.ok) return res.status(stock.status >= 500 ? 502 : 409).json({ error: stock.status >= 500 ? 'dependency_failure' : 'out_of_stock', service: 'product-service', detail: stock.data });

  const orderId = orders.length + 1;
  let pay;
  try { pay = await call(cfg.PAYMENT, '/charge', { method: 'POST', body: { orderRef: orderId, amount: total, userId: req.user.id } }); }
  catch (e) { pay = { ok: false, status: 503 }; }
  if (!pay.ok) {
    await call(cfg.PRODUCT, '/release', { method: 'POST', body: { items: stockItems } }).catch(() => {}); // rollback
    return pay.status === 402
      ? res.status(402).json({ error: 'payment_declined', detail: pay.data })
      : res.status(502).json({ error: 'dependency_failure', service: 'payment-service', message: 'payment unavailable, stock released' });
  }

  const order = { id: orderId, userId: req.user.id, items, total, paymentId: pay.data.paymentId, status: 'confirmed', at: new Date().toISOString() };
  orders.push(order);
  // non-critical steps: failures must not fail the order
  await call(cfg.NOTIFICATION, '/send', { method: 'POST', body: { userId: req.user.id, message: `Order #${order.id} confirmed. Total: ${total}` }, timeout: 1500 }).catch(() => { order.notified = false; });
  await call(cfg.CART, '/', { method: 'DELETE', token: req.token }).catch(() => {});
  res.status(201).json(order);
}));
listen(app, 'order-service', 3003);
