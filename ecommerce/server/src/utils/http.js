export function asyncHandler(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
export function slugify(value) { return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 100) || `product-${Date.now()}`; }
export function safeUser(user) { return { id: user._id, name: user.name, email: user.email, role: user.role }; }
