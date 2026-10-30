import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import Product from './models/Product.js';
const seedProducts = [
  ['Spiral Notebook', 'Stationery', 'A premium blush notebook for plans, sketches, and everyday notes.', 299, 499, 50, '/images/notebook.jpg'],
  ['Gel Pen Set (4 pcs)', 'Stationery', 'Smooth-writing pens in soft, everyday colours.', 199, 249, 100, '/images/gel-pens.jpg'],
  ['Classic Backpack', 'Bags', 'A versatile canvas backpack with a roomy main compartment.', 1299, 1599, 30, '/images/backpack.jpg'],
  ['Insulated Flask', 'Drinkware', 'A reusable double-wall flask for hot or cold drinks.', 899, 1099, 40, '/images/flask.jpg'],
  ['LED Desk Lamp', 'Desk', 'A clean, adjustable lamp for focused work and reading.', 1199, 1499, 25, '/images/desk-lamp.jpg'],
  ['Wireless Headphones', 'Electronics', 'Comfortable over-ear headphones for work and travel.', 2499, 2999, 18, '/images/headphones.jpg'],
  ['Cork Desk Mat', 'Desk', 'A warm natural surface for a calmer workspace.', 599, 799, 35, '/images/desk-mat.jpg'],
  ['Indoor Planter', 'Home Decor', 'A modern planter that brings a little greenery to your desk.', 399, 499, 22, '/images/planter.jpg'],
  ['Cedar Soy Candle', 'Home Decor', 'A small-batch soy candle with a cosy cedar fragrance.', 549, 0, 28, '/images/candle.jpg'],
  ['Stoneware Mug', 'Drinkware', 'A tactile ceramic mug for your favourite daily drink.', 649, 799, 24, '/images/ceramic-mug.png'],
  ['Oak Laptop Riser', 'Desk', 'Raise your screen for a more comfortable workspace.', 1899, 2199, 12, '/images/oak-riser.png'],
  ['Linen Cushion Cover', 'Home Decor', 'Soft, neutral linen texture for a comfortable home.', 799, 999, 20, '/images/linen-cushion.png'],
];
await connectDB();
const email = String(process.env.ADMIN_EMAIL || 'admin@tilda.local').toLowerCase(); const password = process.env.ADMIN_PASSWORD || 'ChangeThisAdminPassword123!';
let admin = await User.findOne({ email });
if (!admin) { admin = await User.create({ name: process.env.ADMIN_NAME || 'Store Admin', email, passwordHash: await bcrypt.hash(password, 12), role: 'admin' }); console.log(`Created admin account: ${email}`); }
if (await Product.countDocuments() === 0) { await Product.insertMany(seedProducts.map(([name,category,description,price,compareAtPrice,stock,image])=>({ name,slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${Math.random().toString(36).slice(2,6)}`,category,description,price,compareAtPrice,stock,image }))); console.log('Seeded sample products.'); }
await import('mongoose').then(m=>m.default.disconnect()); console.log('Seed complete.');
