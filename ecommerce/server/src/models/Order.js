import mongoose from 'mongoose';
const itemSchema = new mongoose.Schema({ product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, name: String, image: String, price: Number, quantity: { type: Number, min: 1, max: 20 } }, { _id: false });
const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true }, user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: { type: [itemSchema], required: true },
  shippingAddress: { name: String, phone: String, address: String, city: String, state: String, pincode: String },
  subtotal: { type: Number, required: true }, shipping: { type: Number, required: true }, total: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['COD'], default: 'COD' }, paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Refunded'], default: 'Pending' },
  status: {
  type: String,
  enum: [
    'Pending confirmation',
    'Confirmed',
    'Packed',
    'Shipped',
    'Delivered',
    'Cancelled'
  ],
  default: 'Confirmed'
}
}, { timestamps: true });
export default mongoose.model('Order', orderSchema);
