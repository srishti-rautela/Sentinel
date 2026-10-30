import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import { asyncHandler } from '../utils/http.js';
const shippingFee = subtotal => subtotal === 0 || subtotal >= 999 ? 0 : 79;
const validAddress = a => a && ['name','phone','address','city','state','pincode'].every(k => String(a[k] || '').trim().length > 0) && /^[0-9+() -]{8,18}$/.test(String(a.phone)) && /^[0-9]{5,10}$/.test(String(a.pincode));
export const createOrder = asyncHandler(async (req, res) => {
  const rawItems = req.body.items; const address = req.body.shippingAddress;
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 30) return res.status(400).json({ message: 'Your cart is empty or has too many different items.' });
  if (!validAddress(address)) return res.status(400).json({ message: 'Complete all shipping fields with a valid phone number and postal code.' });
  const quantities = new Map();
  for (const item of rawItems) { if (!mongoose.isValidObjectId(item.productId) || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 20) return res.status(400).json({ message: 'Invalid cart item.' }); quantities.set(String(item.productId), (quantities.get(String(item.productId)) || 0) + Number(item.quantity)); }
  const ids = [...quantities.keys()]; const products = await Product.find({ _id: { $in: ids }, active: true });
  if (products.length !== ids.length) return res.status(400).json({ message: 'One or more products are no longer available. Refresh your cart.' });
  const orderItems = []; let subtotal = 0;
  for (const p of products) { const quantity = quantities.get(p._id.toString()); if (p.stock < quantity) return res.status(409).json({ message: `${p.name} has only ${p.stock} left in stock.` }); subtotal += p.price * quantity; orderItems.push({ product: p._id, name: p.name, image: p.image, price: p.price, quantity }); }
  // Reserve stock with conditional updates to prevent two orders from overselling the same item.
  const reserved = [];
  try {
    for (const item of orderItems) {
      const p = await Product.findOneAndUpdate({ _id: item.product, active: true, stock: { $gte: item.quantity } }, { $inc: { stock: -item.quantity } }, { new: true });
      if (!p) throw new Error(`${item.name} just sold out or no longer has enough stock. Please refresh your cart.`);
      reserved.push(item);
    }
    const shipping = shippingFee(subtotal);
    const order = await Order.create({ orderNumber: `TIL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`, user: req.user._id, items: orderItems, shippingAddress: Object.fromEntries(Object.entries(address).map(([k,v]) => [k, String(v).trim().slice(0,200)])), subtotal, shipping, total: subtotal + shipping, paymentMethod: 'COD', paymentStatus: 'Pending', status: 'Confirmed' });
    res.status(201).json({ order, message: 'Order placed. Pay cash when your order is delivered.' });
  } catch (error) { for (const item of reserved) await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }); throw error; }
});
export const myOrders = asyncHandler(async (req, res) => res.json({ orders: await Order.find({ user: req.user._id }).sort({ createdAt: -1 }) }));
export const allOrders = asyncHandler(async (req, res) => { const orders = await Order.find().populate('user', 'name email').sort({ createdAt: -1 }).limit(500); res.json({ orders }); });
export const updateOrder = asyncHandler(async (req, res) => {
  const allowed = ['Confirmed','Packed','Shipped','Delivered','Cancelled']; if (!allowed.includes(req.body.status)) return res.status(400).json({ message: 'Invalid order status.' });
  const order = await Order.findById(req.params.id); if (!order) return res.status(404).json({ message: 'Order not found.' });
  if (order.status === 'Cancelled' || order.status === 'Delivered') return res.status(409).json({ message: 'Delivered or cancelled orders cannot be changed.' });
  if (req.body.status === 'Cancelled') { for (const item of order.items) await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }); }
  order.status = req.body.status; await order.save(); res.json({ order });
});
export const stats = asyncHandler(async (_req, res) => { const [products, orders, users, revenue] = await Promise.all([Product.countDocuments({ active: true }), Order.countDocuments(), mongoose.model('User').countDocuments({ role: 'customer' }), Order.aggregate([{ $match: { status: { $ne: 'Cancelled' } } }, { $group: { _id: null, total: { $sum: '$total' } } }])]); res.json({ products, orders, customers: users, orderValue: revenue[0]?.total || 0 }); });
