import React, { useEffect, useRef, useState } from 'react';
import { api, setToken, errText } from './api.js';
import Sentinel from './Sentinel.jsx';

const CRITICAL = ['payment-service', 'order-service', 'auth-service', 'api-gateway'];

const STATUS_CONFIG = {
  up: { bg: 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400', dot: 'bg-emerald-400', label: 'HEALTHY' },
  unhealthy: { bg: 'bg-amber-950/60 border-amber-500/40 text-amber-400', dot: 'bg-amber-400', label: 'DEGRADED' },
  down: { bg: 'bg-rose-950/60 border-rose-500/40 text-rose-400', dot: 'bg-rose-400 animate-pulse', label: 'CRASHED' },
};

function useHealth() {
  const [health, setHealth] = useState([]);
  const [log, setLog] = useState([]);
  const prev = useRef({});

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const r = await api('GET', '/system/health');
      if (!alive) return;
      const list = r.ok ? r.data : [];
      setHealth(list);

      const evs = [];
      list.forEach((s) => {
        const p = prev.current[s.name];
        if (p && p !== s.status) {
          evs.push({
            t: new Date().toLocaleTimeString(),
            name: s.name,
            msg: s.status === 'up' ? 'Health restored (Verified)' : s.status === 'down' ? 'Service DOWN (Process Terminated)' : 'Failing Health Checks (HTTP 503)',
            status: s.status,
          });
        }
        prev.current[s.name] = s.status;
      });
      if (evs.length) setLog((l) => [...evs.reverse(), ...l].slice(0, 40));
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return { health, log };
}

/* Top Telemetry Strip */
function StatusStrip({ health }) {
  const degradedCount = health.filter((s) => s.status !== 'up').length;

  return (
    <div className="bg-slate-950 border-b border-slate-800/80 px-4 py-2 flex flex-wrap items-center justify-between gap-y-2 text-xs">
      <div className="flex items-center gap-3">
        <span className="font-mono font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-indigo-500" />
          MESH TELEMETRY
        </span>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono border ${
          degradedCount === 0
            ? 'bg-emerald-950 text-emerald-400 border-emerald-800/60'
            : 'bg-rose-950 text-rose-300 border-rose-800 animate-pulse'
        }`}>
          {degradedCount === 0 ? 'ALL SYSTEMS OPERATIONAL (7/7)' : `${degradedCount} SERVICES DEGRADED / UNHEALTHY`}
        </span>
      </div>

      <div className="flex items-center gap-4 overflow-x-auto">
        {health.map((s) => {
          const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.down;
          return (
            <div key={s.name} className="flex items-center gap-1.5 whitespace-nowrap">
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              <span className="font-medium text-slate-300">{s.name.replace('-service', '')}</span>
              <span className="text-[10px] text-slate-500 font-mono">
                {s.latencyMs != null ? `${s.latencyMs}ms` : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Modern Enterprise Login Screen */
function Login({ onLogin }) {
  const [f, setF] = useState({ email: 'demo@sentinel.com', password: 'demo123', name: 'DevOps Engineer' });
  const [mode, setMode] = useState('login');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr('');
    setBusy(true);
    if (mode === 'register') {
      const r = await api('POST', '/api/auth/register', f);
      if (!r.ok) { setBusy(false); return setErr(errText(r)); }
    }
    const r = await api('POST', '/api/auth/login', { email: f.email, password: f.password });
    setBusy(false);
    r.ok ? onLogin(r.data) : setErr(errText(r));
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full p-8 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 mx-auto flex items-center justify-center text-indigo-400 mb-3 shadow-inner">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">Sentinel Platform Access</h1>
          <p className="text-xs text-slate-400 mt-1">Autonomous Observability & Microservices Workload</p>
        </div>

        <div className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">Full Name</label>
              <input
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
                placeholder="DevOps Lead"
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
              />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">Operator Email</label>
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition font-mono"
              placeholder="demo@sentinel.com"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">Password</label>
            <input
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
              type="password"
              placeholder="••••••••"
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
            />
          </div>

          {err && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs">
              {err}
            </div>
          )}

          <button
            onClick={submit}
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-950 transition flex items-center justify-center gap-2 mt-2"
          >
            {busy ? 'Authenticating...' : mode === 'login' ? 'Sign In to Platform' : 'Create Operator Account'}
          </button>

          <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
            <button
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-indigo-400 hover:text-indigo-300"
            >
              {mode === 'login' ? 'Register new operator' : 'Back to sign in'}
            </button>
            <span className="text-slate-500 font-mono">Demo: demo123</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Production-Grade E-Commerce Storefront */
function Shop({ onCart, toast, onOpenCart }) {
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('featured');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState(null);

  const load = async () => {
    setLoading(true);
    const r = await api('GET', '/api/products');
    setLoading(false);
    if (r.ok) {
      setProducts(r.data || []);
      setErr('');
    } else {
      setErr(errText(r));
    }
  };

  useEffect(() => { load(); }, []);

  const add = async (p) => {
    const r = await api('POST', '/api/cart/items', { productId: p.id, qty: 1 });
    toast(r.ok ? `✓ Added ${p.name} to cart` : errText(r), r.ok);
    if (r.ok) onCart();
  };

  const categories = ['All', 'Keyboards & Tech', 'Desk Setup', 'Stationery', 'Lifestyle'];

  const filtered = products
    .filter((p) => category === 'All' || p.category === category)
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || (p.description && p.description.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => {
      if (sort === 'price-low') return a.price - b.price;
      if (sort === 'price-high') return b.price - a.price;
      if (sort === 'rating') return (b.rating || 0) - (a.rating || 0);
      return a.id - b.id;
    });

  return (
    <div className="space-y-6">
      {/* High-Impact E-Commerce Promotional Hero Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none" />
        <div className="max-w-2xl relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-900/60 border border-indigo-700/60 text-xs font-semibold text-indigo-300">
            <span>🚀 FESTIVAL COLLECTION 2026</span>
            <span className="w-1 h-1 rounded-full bg-indigo-400" />
            <span>CODE: SENTINEL20 (20% OFF)</span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
            Curated Developer Gear & <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Workspace Setup</span>
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl">
            High-performance essentials engineered for modern creators. Fully backed by Sentinel's autonomous self-healing microservice cluster.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-slate-400">
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              Automated Stock Protection
            </span>
            <span className="flex items-center gap-1.5 text-cyan-400 font-medium">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Zero-Downtime Microservices
            </span>
            <span className="flex items-center gap-1.5 text-indigo-400 font-medium">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Instant Rollback on Faults
            </span>
          </div>
        </div>
      </div>

      {/* Product Search, Filter & Category Control Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-lg space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <svg className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search gear, notebooks, keyboards, accessories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white">
                ✕
              </button>
            )}
          </div>

          {/* Sort Controls & Refresh */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 text-xs hidden sm:inline">Sort:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="featured">Featured Picks</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="rating">Top Rated</option>
            </select>

            <button
              onClick={load}
              disabled={loading}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1.5"
            >
              <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-1 scrollbar-none">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                category === c
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800/80 hover:border-slate-700'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
          <span>{err}</span>
          <button className="underline font-semibold" onClick={load}>Retry Catalog</button>
        </div>
      )}

      {/* Rich E-Commerce Product Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 transition-all duration-200 shadow-md flex flex-col justify-between group relative overflow-hidden"
          >
            {/* Top Badges */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 uppercase tracking-wider">
                {p.category || 'General'}
              </span>
              {p.badge && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700/60">
                  {p.badge}
                </span>
              )}
            </div>

            {/* Visual Icon Avatar with Frame */}
            <div
              onClick={() => setQuickViewProduct(p)}
              className="py-6 px-4 rounded-xl bg-gradient-to-b from-slate-950 to-slate-900 border border-slate-800/80 text-center cursor-pointer group-hover:border-slate-700 transition"
            >
              <div className="text-6xl mb-1 transform group-hover:scale-110 transition duration-200">
                {p.emoji}
              </div>
              <span className="text-[11px] text-indigo-400 font-medium opacity-0 group-hover:opacity-100 transition">
                Click for Specs & Telemetry
              </span>
            </div>

            {/* Details */}
            <div className="mt-3 space-y-1.5 flex-1">
              <div className="flex items-center gap-1 text-amber-400 text-xs">
                <span>{'★'.repeat(Math.round(p.rating || 5))}</span>
                <span className="text-slate-400 font-mono text-[11px] ml-1">
                  {p.rating || 4.8} ({p.reviewsCount || 45})
                </span>
              </div>

              <h3
                onClick={() => setQuickViewProduct(p)}
                className="font-bold text-sm text-white group-hover:text-indigo-300 transition cursor-pointer line-clamp-1"
              >
                {p.name}
              </h3>

              <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed font-sans">
                {p.description || 'Precision crafted for daily engineering workflow and productivity.'}
              </p>
            </div>

            {/* Price & Stock Meter */}
            <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2">
              <div className="flex items-baseline justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-bold font-mono text-white">₹{p.price}</span>
                  {p.originalPrice && (
                    <span className="text-xs font-mono text-slate-500 line-through">₹{p.originalPrice}</span>
                  )}
                </div>
                {p.discount && (
                  <span className="text-[11px] font-bold text-emerald-400 font-mono">
                    {p.discount}
                  </span>
                )}
              </div>

              {/* Stock Meter */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>Stock Available</span>
                  <span className={p.stock < 50 ? 'text-amber-400' : 'text-slate-400'}>
                    {p.stock} units
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${p.stock < 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, (p.stock / 200) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => setQuickViewProduct(p)}
                  className="py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Quick View
                </button>
                <button
                  onClick={() => add(p)}
                  className="py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition flex items-center justify-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick-View Detailed Product Modal */}
      {quickViewProduct && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setQuickViewProduct(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              ✕
            </button>

            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-4xl shrink-0">
                {quickViewProduct.emoji}
              </div>
              <div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 uppercase">
                  {quickViewProduct.category}
                </span>
                <h3 className="text-lg font-bold text-white mt-1">{quickViewProduct.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-lg font-bold font-mono text-indigo-400">₹{quickViewProduct.price}</span>
                  {quickViewProduct.originalPrice && (
                    <span className="text-xs font-mono text-slate-500 line-through">₹{quickViewProduct.originalPrice}</span>
                  )}
                  {quickViewProduct.discount && (
                    <span className="text-xs font-bold text-emerald-400 font-mono">({quickViewProduct.discount})</span>
                  )}
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-300 leading-relaxed p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
              {quickViewProduct.description}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 font-mono">
                <span className="text-slate-500 block text-[10px]">MICROSERVICE OWNER</span>
                <span className="text-indigo-400 font-bold">product-service :3002</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 font-mono">
                <span className="text-slate-500 block text-[10px]">INVENTORY STATUS</span>
                <span className="text-emerald-400 font-bold">{quickViewProduct.stock} Units In Stock</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => { add(quickViewProduct); setQuickViewProduct(null); }}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg transition flex items-center justify-center gap-2"
              >
                Add to Cart (₹{quickViewProduct.price})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Production-Grade Slide-Over Cart Drawer & Checkout Flow */
function CartDrawer({ isOpen, onClose, toast, goOrders }) {
  const [cart, setCart] = useState({ items: [], total: 0 });
  const [busy, setBusy] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [checkoutErr, setCheckoutErr] = useState('');

  const load = async () => {
    const r = await api('GET', '/api/cart');
    if (r.ok) setCart(r.data || { items: [], total: 0 });
  };

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen]);

  const remove = async (id) => {
    await api('DELETE', `/api/cart/items/${id}`);
    load();
  };

  const applyPromo = () => {
    if (promoCode.trim().toUpperCase() === 'SENTINEL20') {
      setAppliedPromo({ code: 'SENTINEL20', discountPercent: 20 });
      toast('✓ Coupon SENTINEL20 applied! 20% discount added.', true);
    } else if (promoCode.trim().toUpperCase() === 'FREESHIP') {
      setAppliedPromo({ code: 'FREESHIP', discountPercent: 5 });
      toast('✓ Free shipping coupon applied!', true);
    } else {
      toast('Invalid promo code. Try SENTINEL20', false);
    }
    setPromoCode('');
  };

  const discountAmount = appliedPromo ? Math.round((cart.total * appliedPromo.discountPercent) / 100) : 0;
  const finalTotal = Math.max(0, cart.total - discountAmount);

  const checkout = async () => {
    setBusy(true);
    setCheckoutErr('');
    const r = await api('POST', '/api/orders/checkout');
    setBusy(false);

    if (r.ok) {
      toast(`✓ Order #${r.data.id} confirmed! Notification dispatched.`, true);
      onClose();
      goOrders();
    } else {
      const msg = errText(r);
      setCheckoutErr(msg);
      toast(msg, false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col justify-between">
          {/* Header */}
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">Shopping Cart</h3>
                <span className="text-[11px] text-slate-400 font-mono">{cart.items?.length || 0} unique items</span>
              </div>
            </div>

            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg">
              ✕
            </button>
          </div>

          {/* Failure Alert (If payment-service crashed) */}
          {checkoutErr && (
            <div className="m-4 p-4 rounded-xl bg-amber-950/70 border border-amber-500/70 text-amber-200 text-xs space-y-1.5 shadow-lg">
              <div className="font-bold flex items-center gap-1.5 text-amber-300">
                <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Payment Failure Detected & Isolated
              </div>
              <p className="leading-relaxed">{checkoutErr}</p>
              <div className="p-2 rounded bg-black/40 border border-amber-700/50 text-[11px] text-amber-300 font-mono">
                🛡️ Sentinel Rollback: Stock automatically returned to catalog. Payment service incident created in Sentinel tab!
              </div>
            </div>
          )}

          {/* Items Body */}
          <div className="flex-1 overflow-y-auto p-5 divide-y divide-slate-800/80">
            {!cart.items?.length ? (
              <div className="py-20 text-center space-y-3">
                <div className="text-5xl">🛒</div>
                <div className="text-sm font-medium text-slate-300">Your cart is empty</div>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Browse the developer gear collection and add items to experience the live checkout pipeline.
                </p>
              </div>
            ) : (
              cart.items.map((i) => (
                <div key={i.productId} className="py-3.5 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <h4 className="font-bold text-white text-sm">{i.name}</h4>
                    <div className="text-slate-400 font-mono mt-0.5">
                      Qty: {i.qty} × ₹{i.price}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono font-bold text-white text-sm">
                      ₹{i.price * i.qty}
                    </div>
                    <button
                      onClick={() => remove(i.productId)}
                      className="text-[11px] text-rose-400 hover:text-rose-300 transition mt-1"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer & Checkout Box */}
          {cart.items?.length > 0 && (
            <div className="p-5 border-t border-slate-800 bg-slate-950/80 space-y-3.5">
              {/* Promo Code Input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Coupon (e.g. SENTINEL20)"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white uppercase font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={applyPromo}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-white font-medium transition"
                >
                  Apply
                </button>
              </div>

              {appliedPromo && (
                <div className="flex items-center justify-between text-xs text-emerald-400 bg-emerald-950/50 p-2 rounded-lg border border-emerald-800/60 font-mono">
                  <span>Coupon {appliedPromo.code} applied (-{appliedPromo.discountPercent}%)</span>
                  <button onClick={() => setAppliedPromo(null)} className="text-slate-400 hover:text-white">✕</button>
                </div>
              )}

              {/* Price Breakdown */}
              <div className="space-y-1.5 text-xs font-mono pt-1">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Cart Subtotal</span>
                  <span>₹{cart.total}</span>
                </div>
                {appliedPromo && (
                  <div className="flex items-center justify-between text-emerald-400">
                    <span>Discount</span>
                    <span>-₹{discountAmount}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-slate-400">
                  <span>Express Delivery</span>
                  <span className="text-emerald-400">FREE</span>
                </div>
                <div className="flex items-center justify-between text-white font-bold text-sm pt-2 border-t border-slate-800">
                  <span>Final Total</span>
                  <span className="text-base text-indigo-400">₹{finalTotal}</span>
                </div>
              </div>

              {/* Checkout Stepper Button */}
              <button
                onClick={checkout}
                disabled={busy}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950 transition flex items-center justify-center gap-2"
              >
                {busy ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Executing Order Pipeline...
                  </>
                ) : (
                  `Authorize & Checkout (₹${finalTotal})`
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* Orders & Notifications View */
function Orders() {
  const [orders, setOrders] = useState([]);
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    api('GET', '/api/orders').then((r) => r.ok && setOrders(r.data || []));
    api('GET', '/api/notifications').then((r) => r.ok && setNotes(r.data || []));
  }, []);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500" />
          Confirmed Orders ({orders.length})
        </h3>

        {!orders.length ? (
          <p className="text-xs text-slate-500 py-10 text-center">No orders confirmed yet. Complete a checkout in the store.</p>
        ) : (
          <div className="divide-y divide-slate-800 max-h-[500px] overflow-y-auto pr-1 space-y-3">
            {orders.map((o) => (
              <div key={o.id} className="pt-3 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white font-mono text-sm">ORDER #{o.id}</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-mono font-bold">
                    ₹{o.total}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                  <div>Payment Ref: <span className="text-slate-300">{o.paymentId}</span></div>
                  <div>Time: <span className="text-slate-300">{new Date(o.at).toLocaleTimeString()}</span></div>
                </div>

                {/* Progress Tracking Stepper */}
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1">
                  <span className="text-emerald-400">✓ Reserved</span>
                  <span className="text-emerald-400">✓ Charged</span>
                  <span className="text-cyan-400">✓ Notified</span>
                  <span className="text-indigo-400">⚡ Dispatched</span>
                </div>

                <div className="text-slate-400 text-xs">
                  {o.items.map((i) => `${i.name} (×${i.qty})`).join(', ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400" />
          Simulated Notifications Inbox ({notes.length})
        </h3>

        {!notes.length ? (
          <p className="text-xs text-slate-500 py-10 text-center">No notifications dispatched yet.</p>
        ) : (
          <div className="divide-y divide-slate-800 max-h-[500px] overflow-y-auto pr-1 space-y-3">
            {notes.map((n) => (
              <div key={n.id} className="pt-3 text-xs space-y-1">
                <div className="text-white font-medium text-xs leading-relaxed">{n.message}</div>
                <div className="text-slate-500 flex items-center justify-between text-[11px] font-mono pt-1">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                    Channel: {n.channel}
                  </span>
                  <span>{new Date(n.at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* Service Mesh Topology & Chaos Engineering Studio (Dynatrace Smartscape + Sedai Chaos style) */
function System({ health, log }) {
  const [sel, setSel] = useState('payment-service');
  const [msg, setMsg] = useState('');
  const [injecting, setInjecting] = useState(false);

  const inject = async (action) => {
    setInjecting(true);
    const r = await api(
      'POST',
      `/system/chaos/${sel}/${action}`,
      action === 'slow' ? { ms: 4000 } : action === 'errors' ? { rate: 1 } : {}
    );
    setInjecting(false);
    setMsg(r.ok ? `⚡ ${action.toUpperCase()} injected into ${sel}` : `⚠️ Could not reach ${sel}`);
    setTimeout(() => setMsg(''), 4500);
  };

  const CHAOS_ACTIONS = [
    { id: 'crash', label: 'Kill Process (Crash)', desc: 'Simulate SIGKILL process termination', color: 'bg-rose-600 hover:bg-rose-500' },
    { id: 'slow', label: 'Latency (4000ms)', desc: 'Simulate network lag / thread starvation', color: 'bg-amber-600 hover:bg-amber-500' },
    { id: 'errors', label: '100% 5xx Spike', desc: 'Simulate bad deployment or internal crash', color: 'bg-orange-600 hover:bg-orange-500' },
    { id: 'leak', label: 'Memory Leak', desc: 'Simulate heap exhaustion (>180MB threshold)', color: 'bg-purple-600 hover:bg-purple-500' },
    { id: 'unhealthy', label: 'Unhealthy (503)', desc: 'Fail internal health check probe', color: 'bg-pink-600 hover:bg-pink-500' },
    { id: 'reset', label: 'Reset Baselines', desc: 'Clear simulated chaos and restore health', color: 'bg-slate-700 hover:bg-slate-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Mesh Topology Visual Map */}
      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              Service Topology & Dependency Mesh
            </h3>
            <p className="text-xs text-slate-500">
              Interactive architectural map. Click any node to select it for live failure injection and deep inspection.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Selected Target: <b className="text-indigo-400">{sel}</b>
          </span>
        </div>

        {/* Node Grid Layout with Criticality & Live Telemetry */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {health.map((s) => {
            const isSel = sel === s.name;
            const isCrit = CRITICAL.includes(s.name);
            const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.down;

            return (
              <button
                key={s.name}
                onClick={() => s.name !== 'api-gateway' && setSel(s.name)}
                disabled={s.name === 'api-gateway'}
                className={`text-left p-4 rounded-xl border transition-all duration-200 relative overflow-hidden ${
                  isSel
                    ? 'bg-slate-900 border-indigo-500 ring-2 ring-indigo-500/30 shadow-lg'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                } ${s.name === 'api-gateway' ? 'cursor-default opacity-85' : 'cursor-pointer'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                    <span className="font-bold text-sm text-white">{s.name}</span>
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${cfg.bg}`}>
                    {cfg.label}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[11px] mb-3">
                  <span className={`px-1.5 py-0.5 rounded font-mono uppercase text-[10px] ${
                    isCrit ? 'bg-rose-950 text-rose-300 border border-rose-800/60' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {isCrit ? 'Critical Service' : 'Non-Critical'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-slate-800/80 text-slate-400">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Latency</span>
                    <span className="text-slate-200">{s.latencyMs != null ? `${s.latencyMs} ms` : 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Memory RSS</span>
                    <span className="text-slate-200">{s.memoryMB != null ? `${s.memoryMB} MB` : 'N/A'}</span>
                  </div>
                </div>

                {isSel && (
                  <div className="absolute top-0 right-0 w-2 h-2 bg-indigo-500 rounded-bl" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chaos Engineering & Fault Injection Control Room */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Chaos Engineering Injection Studio
              </h3>
              <p className="text-xs text-slate-500">
                Trigger synthetic faults to test Sentinel's anomaly detection, dependency correlation, and automated recovery.
              </p>
            </div>
            <span className="text-xs px-3 py-1 rounded-lg bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">
              Target: {sel}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
            {CHAOS_ACTIONS.map((c) => (
              <button
                key={c.id}
                onClick={() => inject(c.id)}
                disabled={injecting}
                className={`${c.color} p-3.5 rounded-xl text-left text-white shadow-md transition-transform duration-150 active:scale-95 space-y-1`}
              >
                <div className="font-semibold text-xs">{c.label}</div>
                <div className="text-[11px] text-white/80 leading-snug">{c.desc}</div>
              </button>
            ))}
          </div>

          {msg && (
            <div className="p-3 rounded-xl bg-slate-950 border border-indigo-500/50 text-indigo-300 text-xs font-mono flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
              {msg}
            </div>
          )}
        </div>

        {/* Real-time State Change Event Feed */}
        <div className="lg:col-span-4 p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              State Transitions ({log.length})
            </h3>
            <span className="text-[11px] text-slate-500">Live feed</span>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {!log.length ? (
              <p className="text-xs text-slate-500 py-6 text-center italic">
                Zero state transitions observed yet. Inject chaos to see live health transitions.
              </p>
            ) : (
              log.map((e, idx) => (
                <div key={idx} className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs space-y-0.5">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="font-bold text-white">{e.name}</span>
                    <span className="text-slate-500">{e.t}</span>
                  </div>
                  <div className={`font-mono text-[11px] ${e.status === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {e.msg}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Master App Container */
export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [tab, setTab] = useState('shop');
  const [cartCount, setCartCount] = useState(0);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const { health, log } = useHealth();

  const toast = (m, ok) => {
    setToastMsg({ m, ok });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const syncCartCount = async () => {
    const r = await api('GET', '/api/cart');
    if (r.ok && r.data?.items) {
      setCartCount(r.data.items.reduce((s, i) => s + i.qty, 0));
    }
  };

  useEffect(() => {
    if (user) syncCartCount();
  }, [user]);

  const login = (d) => {
    setToken(d.token);
    localStorage.setItem('user', JSON.stringify(d.user));
    setUser(d.user);
    syncCartCount();
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Telemetry Strip */}
      <StatusStrip health={health} />

      {!user ? (
        <Login onLogin={login} />
      ) : (
        <>
          {/* Main App Navigation Bar */}
          <header className="bg-slate-900/90 border-b border-slate-800 backdrop-blur sticky top-0 z-40 px-4 py-3">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-indigo-950 font-bold">
                  🛡️
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-base tracking-tight text-white font-mono">
                      SENTINEL
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/80">
                      v1.0-PROD
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">Autonomous Observability & Microservices Self-Healing</p>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setTab('shop')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    tab === 'shop' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  Storefront
                </button>

                <button
                  onClick={() => setTab('orders')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    tab === 'orders' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Orders
                </button>

                <button
                  onClick={() => setTab('system')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    tab === 'system' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Topology & Chaos
                </button>

                <button
                  onClick={() => setTab('sentinel')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    tab === 'sentinel' ? 'bg-indigo-600 text-white shadow ring-2 ring-indigo-400/40' : 'text-indigo-400 hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Davis AI / Sentinel
                </button>
              </div>

              {/* User Bar & Cart Trigger */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsCartOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition flex items-center gap-2 border border-slate-700"
                >
                  <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span>Cart</span>
                  {cartCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-[10px] flex items-center justify-center font-bold">
                      {cartCount}
                    </span>
                  )}
                </button>

                <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                  {user.name || user.email}
                </span>

                <button
                  onClick={logout}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </header>

          {/* Main Workspace Body */}
          <main className="max-w-7xl mx-auto p-4 sm:p-6 w-full flex-1">
            {tab === 'shop' && <Shop onCart={syncCartCount} toast={toast} onOpenCart={() => setIsCartOpen(true)} />}
            {tab === 'orders' && <Orders />}
            {tab === 'system' && <System health={health} log={log} />}
            {tab === 'sentinel' && <Sentinel />}
          </main>

          {/* Slide-Over Cart Drawer */}
          <CartDrawer
            isOpen={isCartOpen}
            onClose={() => setIsCartOpen(false)}
            toast={toast}
            goOrders={() => setTab('orders')}
          />
        </>
      )}

      {/* Global Interactive Toast Notification */}
      {toastMsg && (
        <div className={`fixed bottom-6 right-6 z-50 p-4 rounded-xl shadow-2xl border text-xs font-medium flex items-center gap-3 transition-all transform duration-200 ${
          toastMsg.ok
            ? 'bg-emerald-950 border-emerald-600 text-emerald-200'
            : 'bg-rose-950 border-rose-600 text-rose-200'
        }`}>
          <span>{toastMsg.ok ? '✓' : '⚠️'}</span>
          <span>{toastMsg.m}</span>
        </div>
      )}
    </div>
  );
}
