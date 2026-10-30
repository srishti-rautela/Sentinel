const API = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
export function getToken(){ return localStorage.getItem('tilda_token'); }
export async function api(path, options={}) {
  const headers = { ...(options.body && !(options.body instanceof FormData) ? {'Content-Type':'application/json'} : {}), ...(getToken() ? {Authorization:`Bearer ${getToken()}`} : {}), ...options.headers };
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(()=>({message:'The server returned an unreadable response.'}));
  if (!response.ok) { if(response.status===401 && getToken()){ localStorage.removeItem('tilda_token'); localStorage.removeItem('tilda_user'); window.dispatchEvent(new Event('tilda:auth-expired')); } throw new Error(data.message || 'Request failed.'); }
  return data;
}
export const money = n => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(n||0));
export const imageUrl = image => { if (!image) return '/images/notebook.svg'; if(image.startsWith('/uploads/')) return `${(import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/,'')}${image}`; return image; };export const seedFallback = [
  ['Spiral Notebook', 'Stationery', 299, 50, '/images/notebook.jpg'],

  ['Gel Pen Set (4 pcs)', 'Stationery', 199, 100, '/images/gel-pens.jpg'],

  ['Classic Backpack', 'Bags', 1299, 30, '/images/backpack.jpg'],

  ['Insulated Flask', 'Drinkware', 899, 40, '/images/flask.jpg'],

  ['LED Desk Lamp', 'Desk', 1199, 25, '/images/desk-lamp.jpg'],

  ['Wireless Headphones', 'Electronics', 2499, 18, '/images/headphones.jpg'],

  ['Cork Desk Mat', 'Desk', 599, 35, '/images/desk-mat.jpg'],

  ['Indoor Planter', 'Home Decor', 399, 22, '/images/planter.jpg'],

  ['Cedar Soy Candle', 'Home Decor', 549, 28, '/images/candle.jpg'],

  ['Stoneware Mug', 'Drinkware', 649, 24, '/images/ceramic-mug.png'],

  ['Oak Laptop Riser', 'Desk', 1899, 12, '/images/oak-riser.png'],

  ['Linen Cushion Cover', 'Home Decor', 799, 20, '/images/linen-cushion.png'],
].map((p, i) => ({
  _id: `demo-${i}`,

  name: p[0],

  category: p[1],

  price: p[2],

  stock: p[3],

  image: p[4],

  description: 'A thoughtfully selected everyday essential, designed to bring a little more ease and beauty to your routine.',
}));

