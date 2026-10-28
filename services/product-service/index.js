const { createService, listen } = require('../../common/base');
const app = createService('product-service');

const products = [
  {
    id: 1,
    name: 'Pro Minimalist A5 Notebook',
    category: 'Stationery',
    price: 120,
    originalPrice: 199,
    discount: '40% OFF',
    stock: 200,
    emoji: '📓',
    rating: 4.8,
    reviewsCount: 142,
    badge: 'Popular',
    description: '192-page archival acid-free dotted paper with leatherette hardcover and ribbon bookmark.'
  },
  {
    id: 2,
    name: 'Precision Gel Pen Set (Pack of 10)',
    category: 'Stationery',
    price: 80,
    originalPrice: 120,
    discount: '33% OFF',
    stock: 200,
    emoji: '🖊️',
    rating: 4.9,
    reviewsCount: 318,
    badge: 'Best Seller',
    description: '0.5mm Japanese ultra-fine tungsten carbide tip with waterproof, smudge-free matte black ink.'
  },
  {
    id: 3,
    name: 'Urban Commuter Tech Backpack (25L)',
    category: 'Lifestyle',
    price: 1499,
    originalPrice: 2499,
    discount: '40% OFF',
    stock: 50,
    emoji: '🎒',
    rating: 4.7,
    reviewsCount: 89,
    badge: 'Top Rated',
    description: 'Waterproof Cordura ballistic nylon with padded 16-inch laptop chamber and hidden anti-theft pocket.'
  },
  {
    id: 4,
    name: 'Insulated Thermal Flask (750ml)',
    category: 'Lifestyle',
    price: 349,
    originalPrice: 599,
    discount: '42% OFF',
    stock: 80,
    emoji: '🧴',
    rating: 4.6,
    reviewsCount: 74,
    badge: 'Sale',
    description: 'Double-wall 304 food-grade stainless steel keeping beverages cold for 24h and hot for 12h.'
  },
  {
    id: 5,
    name: 'Smart Ergonomic Desk Lamp (LED)',
    category: 'Desk Setup',
    price: 799,
    originalPrice: 1299,
    discount: '38% OFF',
    stock: 40,
    emoji: '💡',
    rating: 4.8,
    reviewsCount: 112,
    badge: 'Trending',
    description: 'Touch-dimmable color temperature (3000K-6500K) with USB-A charging port and memory preset.'
  },
  {
    id: 6,
    name: 'Wireless Mechanical Keyboard (RGB)',
    category: 'Keyboards & Tech',
    price: 2499,
    originalPrice: 3499,
    discount: '28% OFF',
    stock: 65,
    emoji: '⌨️',
    rating: 4.9,
    reviewsCount: 205,
    badge: 'Staff Pick',
    description: 'Hot-swappable Gateron Red switches, Bluetooth 5.1 & Type-C wired connectivity with PBT keycaps.'
  },
  {
    id: 7,
    name: 'Active Noise-Cancelling Headphones',
    category: 'Keyboards & Tech',
    price: 3299,
    originalPrice: 4999,
    discount: '34% OFF',
    stock: 35,
    emoji: '🎧',
    rating: 4.8,
    reviewsCount: 167,
    badge: 'Premium',
    description: 'Hybrid 40dB active noise cancellation with 40mm neodymium drivers and 45-hour battery life.'
  },
  {
    id: 8,
    name: 'Dual-Sided Vegan Leather Desk Mat',
    category: 'Desk Setup',
    price: 499,
    originalPrice: 899,
    discount: '44% OFF',
    stock: 120,
    emoji: '🖥️',
    rating: 4.7,
    reviewsCount: 96,
    badge: 'Essential',
    description: '900x400mm waterproof scratch-resistant desk blotter with smooth glide mouse surface.'
  }
];

app.get('/', (req, res) => res.json(products));
app.get('/:id', (req, res) => {
  const p = products.find((x) => x.id === Number(req.params.id));
  p ? res.json(p) : res.status(404).json({ error: 'product not found' });
});
app.post('/', (req, res) => {
  const { name, price, stock, category, description } = req.body || {};
  if (!name || !(price >= 0)) return res.status(400).json({ error: 'name and price required' });
  const p = {
    id: products.length + 1,
    name,
    category: category || 'General',
    price,
    stock: stock ?? 0,
    emoji: '📦',
    rating: 5.0,
    reviewsCount: 1,
    description: description || 'New product added to catalog.'
  };
  products.push(p);
  res.status(201).json(p);
});

// internal: reserve stock for all items atomically
app.post('/reserve', (req, res) => {
  const items = req.body?.items || [];
  for (const i of items) {
    const p = products.find((x) => x.id === i.productId);
    if (!p || p.stock < i.qty) return res.status(409).json({ error: 'insufficient_stock', productId: i.productId });
  }
  items.forEach((i) => { products.find((x) => x.id === i.productId).stock -= i.qty; });
  res.json({ reserved: true });
});

app.post('/release', (req, res) => {
  (req.body?.items || []).forEach((i) => { const p = products.find((x) => x.id === i.productId); if (p) p.stock += i.qty; });
  res.json({ released: true });
});

listen(app, 'product-service', 3002);
