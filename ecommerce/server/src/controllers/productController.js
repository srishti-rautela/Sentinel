import Product from '../models/Product.js';
import { asyncHandler, slugify } from '../utils/http.js';
export const listProducts = asyncHandler(async (req, res) => {
  const filter = { active: true };
  if (req.query.category && req.query.category !== 'All') filter.category = String(req.query.category).slice(0, 60);
  if (req.query.q) { const q = String(req.query.q).trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.$or = [{ name: { $regex: q, $options: 'i' } }, { category: { $regex: q, $options: 'i' } }]; }
  let query = Product.find(filter);
  if (req.query.sort === 'price-asc') query = query.sort({ price: 1 }); else if (req.query.sort === 'price-desc') query = query.sort({ price: -1 }); else query = query.sort({ createdAt: -1 });
  res.json({ products: await query.limit(100) });
});
export const getProduct = asyncHandler(async (req, res) => { const p = await Product.findOne({ _id: req.params.id, active: true }); if (!p) return res.status(404).json({ message: 'Product not found.' }); res.json({ product: p }); });
export const createProduct = asyncHandler(async (req, res) => {
  const { name, category, description, price, compareAtPrice = 0, stock = 0, image = '/images/notebook.svg' } = req.body;
  if (!name?.trim() || !category?.trim() || !description?.trim()) return res.status(400).json({ message: 'Name, category, and description are required.' });
  const nPrice = Number(price), nStock = Number(stock), nCompare = Number(compareAtPrice);
  if (!Number.isFinite(nPrice) || nPrice < 1 || !Number.isInteger(nStock) || nStock < 0 || !Number.isFinite(nCompare) || nCompare < 0) return res.status(400).json({ message: 'Enter a valid price, stock count, and comparison price.' });
  const slug = `${slugify(name)}-${Date.now().toString(36)}`;
  const product = await Product.create({ name: name.trim(), slug, category: category.trim(), description: description.trim(), price: nPrice, compareAtPrice: nCompare, stock: nStock, image });
  res.status(201).json({ product });
});
export const updateProduct = asyncHandler(async (req, res) => {
  const allowed = ['name', 'category', 'description', 'price', 'compareAtPrice', 'stock', 'image', 'active']; const update = {};
  for (const key of allowed) if (req.body[key] !== undefined) update[key] = req.body[key];
  if (update.price !== undefined && (!Number.isFinite(Number(update.price)) || Number(update.price) < 1)) return res.status(400).json({ message: 'Price must be at least ₹1.' });
  if (update.stock !== undefined && (!Number.isInteger(Number(update.stock)) || Number(update.stock) < 0)) return res.status(400).json({ message: 'Stock must be a non-negative whole number.' });
  if (update.name) update.slug = `${slugify(update.name)}-${Date.now().toString(36)}`;
  const product = await Product.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!product) return res.status(404).json({ message: 'Product not found.' }); res.json({ product });
});
export const deleteProduct = asyncHandler(async (req, res) => { const product = await Product.findByIdAndUpdate(req.params.id, { active: false }, { new: true }); if (!product) return res.status(404).json({ message: 'Product not found.' }); res.json({ message: 'Product archived.' }); });
