const { createService, listen, ah } = require('../../common/base');
const requireAuth = require('../../common/auth');
const { call } = require('../../common/http');
const cfg = require('../../common/config');

const app = createService('cart-service');
const carts = new Map(); // userId -> [{productId,name,price,qty}]
const get = (id) => carts.get(id) || [];
const total = (items) => items.reduce((s, i) => s + i.price * i.qty, 0);

app.use(requireAuth);
app.get('/', (req, res) => { const items = get(req.user.id); res.json({ items, total: total(items) }); });
app.post('/items', ah(async (req, res) => {
  const { productId, qty = 1 } = req.body || {};
  const p = await call(cfg.PRODUCT, `/${productId}`);
  if (!p.ok) return res.status(404).json({ error: 'product not found' });
  const items = get(req.user.id);
  const ex = items.find((i) => i.productId === p.data.id);
  ex ? (ex.qty += qty) : items.push({ productId: p.data.id, name: p.data.name, price: p.data.price, image: p.data.image, emoji: p.data.emoji, qty });
  carts.set(req.user.id, items);
  res.status(201).json({ items, total: total(items) });
}));
app.delete('/items/:productId', (req, res) => {
  const items = get(req.user.id).filter((i) => i.productId !== Number(req.params.productId));
  carts.set(req.user.id, items); res.json({ items, total: total(items) });
});
app.delete('/', (req, res) => { carts.set(req.user.id, []); res.json({ items: [], total: 0 }); });
listen(app, 'cart-service', 3004);