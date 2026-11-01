import mongoose from 'mongoose';
const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, unique: true, lowercase: true },
  category: { type: String, required: true, trim: true, maxlength: 60 },
  description: { type: String, required: true, maxlength: 2000 },
  price: { type: Number, required: true, min: 1 },
  compareAtPrice: { type: Number, default: 0, min: 0 },
  stock: { type: Number, required: true, min: 0, validate: Number.isInteger },
  image: { type: String, default: '/images/notebook.svg' },
  active: { type: Boolean, default: true }
}, { timestamps: true });
productSchema.index({ name: 'text', description: 'text', category: 'text' });
export default mongoose.model('Product', productSchema);
