import React, { useEffect, useRef, useState } from 'react';
import { api, setToken, errText } from './api.js';
import Sentinel from './Sentinel.jsx';
import { ThemeToggle } from './theme.jsx';
import ProductImage from './ProductImage.jsx';

const CRITICAL = ['payment-service', 'order-service', 'auth-service', 'api-gateway'];

const STATUS = {
  up: { dot: 'bg-emerald-500', text: 'text-emerald-400', label: 'Healthy' },
  unhealthy: { dot: 'bg-amber-500', text: 'text-amber-400', label: 'Degraded' },
  down: { dot: 'bg-rose-500', text: 'text-rose-400', label: 'Down' },
};

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/* ---------- shared bits ---------- */
const ICONS = {
  shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  cart: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
  search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  close: 'M6 18L18 6M6 6l12 12',
  refresh: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  check: 'M5 13l4 4L19 7',
  warn: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  star: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
};
const Icon = ({ name, className = 'w-4 h-4', fill = 'none' }) => (
  <svg className={className} fill={fill} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[name]} />
  </svg>
);

const inputCls = 'w-full h-9 rounded-md border border-line bg-canvas px-3 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition';
const btnPrimary = 'inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors';
const btnGhost = 'inline-flex items-center justify-center gap-2 h-9 px-3 rounded-md border border-line text-sm text-body hover:bg-subtle hover:text-ink transition-colors';

function Logo() {
  return (
    <div className="flex items-center gap-2 text-ink">
      <Icon name="shield" className="w-5 h-5 text-accent" />
      <span className="text-[15px] font-semibold tracking-tight">Sentinel</span>
    </div>
  );
}

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
            msg: s.status === 'up' ? 'Health restored' : s.status === 'down' ? 'Service down (process terminated)' : 'Failing health checks (HTTP 503)',
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

/* ---------- header ---------- */
const TABS = [
  { id: 'shop', label: 'Store' },
  { id: 'orders', label: 'Orders' },
  { id: 'system', label: 'System' },
  { id: 'sentinel', label: 'Incidents' },
];

function Tabs({ tab, setTab, className = '' }) {
  return (
    <nav className={`flex items-center gap-1 ${className}`}>
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={`h-8 px-3 rounded-md text-sm whitespace-nowrap transition-colors ${
            tab === t.id ? 'bg-subtle text-ink font-medium' : 'text-muted hover:text-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}

function Header({ user, tab, setTab, health, cartCount, onCart, onLogout }) {
  const degraded = health.filter((s) => s.status !== 'up').length;
  const status = !health.length
    ? { dot: 'bg-zinc-500', label: 'Connecting' }
    : degraded === 0
      ? { dot: 'bg-emerald-500', label: 'All systems operational' }
      : { dot: 'bg-rose-500 animate-pulse', label: `${degraded} service${degraded > 1 ? 's' : ''} affected` };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <Logo />
            {user && <Tabs tab={tab} setTab={setTab} className="hidden md:flex" />}
          </div>

          <div className="flex items-center gap-2">
            {user && (
              <button
                onClick={() => setTab('system')}
                className="hidden lg:flex items-center gap-2 h-8 px-3 rounded-md text-xs text-muted hover:text-ink hover:bg-subtle transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </button>
            )}
            <ThemeToggle />
            {user && (
              <>
                <button onClick={onCart} className={`${btnGhost} relative`} aria-label="Open cart">
                  <Icon name="cart" />
                  <span className="hidden sm:inline">Cart</span>
                  {cartCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[11px] font-medium flex items-center justify-center tnum">
                      {cartCount}
                    </span>
                  )}
                </button>
                <span className="hidden xl:inline text-xs text-muted max-w-[140px] truncate">{user.name || user.email}</span>
                <button onClick={onLogout} className="h-8 px-2.5 rounded-md text-xs text-muted hover:text-ink hover:bg-subtle transition-colors">
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>
        {user && <Tabs tab={tab} setTab={setTab} className="md:hidden overflow-x-auto scrollbar-none pb-2 -mx-1 px-1" />}
      </div>
    </header>
  );
}

/* ---------- login ---------- */
function Login({ onLogin }) {
  const [f, setF] = useState({ email: 'demo@sentinel.com', password: 'demo123', name: 'DevOps Engineer' });
  const [mode, setMode] = useState('login');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
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
    <div className="flex-1 flex items-center justify-center px-4 py-16">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
          <p className="text-sm text-muted">Continue to the Sentinel platform.</p>
        </div>

        <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
          {mode === 'register' && (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-body">Full name</span>
              <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-body">Email</span>
            <input className={inputCls} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-body">Password</span>
            <input className={inputCls} type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </label>

          {err && <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">{err}</div>}

          <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </div>

        <div className="flex items-center justify-between text-xs">
          <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="text-link hover:underline">
            {mode === 'login' ? 'Create an account' : 'Back to sign in'}
          </button>
          <span className="text-muted">Demo password: demo123</span>
        </div>
      </form>
    </div>
  );
}

/* ---------- store ---------- */
function Stars({ rating, count }) {
  return (
    <div className="flex items-center gap-1 text-xs text-muted">
      <Icon name="star" className="w-3.5 h-3.5 text-amber-500" fill="currentColor" />
      <span className="text-body tnum">{rating || 4.8}</span>
      {count != null && <span className="tnum">({count})</span>}
    </div>
  );
}

function Price({ p, size = 'text-sm' }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={`${size} font-semibold text-ink tnum`}>{money(p.price)}</span>
      {p.originalPrice && <span className="text-xs text-muted line-through tnum">{money(p.originalPrice)}</span>}
    </div>
  );
}

function Shop({ onCart, toast }) {
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('featured');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [quick, setQuick] = useState(null);

  const load = async () => {
    setLoading(true);
    const r = await api('GET', '/api/products');
    setLoading(false);
    if (r.ok) { setProducts(r.data || []); setErr(''); } else { setErr(errText(r)); }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!quick) return undefined;
    const onKey = (e) => e.key === 'Escape' && setQuick(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quick]);

  const add = async (p) => {
    const r = await api('POST', '/api/cart/items', { productId: p.id, qty: 1 });
    toast(r.ok ? `${p.name} added to cart` : errText(r), r.ok);
    if (r.ok) onCart();
  };

  const categories = ['All', 'Keyboards & Tech', 'Desk Setup', 'Stationery', 'Lifestyle'];
  const q = search.toLowerCase();
  const filtered = products
    .filter((p) => category === 'All' || p.category === category)
    .filter((p) => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
    .sort((a, b) => {
      if (sort === 'price-low') return a.price - b.price;
      if (sort === 'price-high') return b.price - a.price;
      if (sort === 'rating') return (b.rating || 0) - (a.rating || 0);
      return a.id - b.id;
    });

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Store</h1>
          <p className="text-sm text-muted mt-1">Workspace essentials and developer gear.</p>
        </div>
        <span className="text-xs text-muted tnum">{filtered.length} products</span>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1 md:max-w-xs">
            <Icon name="search" className="w-4 h-4 absolute left-3 top-2.5 text-muted" />
            <input className={`${inputCls} pl-9`} placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 md:ml-auto">
            <select value={sort} onChange={(e) => setSort(e.target.value)} className={`${inputCls} !w-auto pr-8`}>
              <option value="featured">Featured</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
              <option value="rating">Top rated</option>
            </select>
            <button onClick={load} disabled={loading} className={`${btnGhost} !px-2.5`} aria-label="Refresh products">
              <Icon name="refresh" className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`h-8 px-3 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                category === c ? 'bg-ink text-canvas border-ink' : 'border-line text-muted hover:text-ink hover:bg-subtle'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400 flex items-center justify-between">
          <span>{err}</span>
          <button className="underline" onClick={load}>Retry</button>
        </div>
      )}

      {loading && !products.length ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="space-y-3 animate-pulse">
              <div className="aspect-square rounded-xl bg-subtle" />
              <div className="h-3 w-1/3 rounded bg-subtle" />
              <div className="h-4 w-3/4 rounded bg-subtle" />
            </div>
          ))}
        </div>
      ) : !filtered.length ? (
        <div className="py-20 text-center text-sm text-muted">No products match your search.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
          {filtered.map((p) => (
            <article key={p.id} className="group flex flex-col">
              <button
                onClick={() => setQuick(p)}
                className="relative aspect-square overflow-hidden rounded-xl border border-line bg-subtle flex items-center justify-center"
                aria-label={`View ${p.name}`}
              >
                <ProductImage product={p} className="w-full h-full transition-transform duration-300 group-hover:scale-[1.03]" emojiClass="text-6xl" />
                {p.discount && (
                  <span className="absolute left-2 top-2 rounded-md bg-surface/95 border border-line px-1.5 py-0.5 text-[11px] font-medium text-ink">
                    {p.discount}
                  </span>
                )}
              </button>

              <div className="pt-3 flex-1 space-y-1">
                <div className="text-xs text-muted">{p.category}</div>
                <button onClick={() => setQuick(p)} className="block text-left text-sm font-medium text-ink line-clamp-1 hover:underline">
                  {p.name}
                </button>
                <div className="flex items-center justify-between">
                  <Stars rating={p.rating} count={p.reviewsCount} />
                  {p.stock < 50 && <span className="text-[11px] text-amber-400">Only {p.stock} left</span>}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <Price p={p} />
                <button onClick={() => add(p)} className={`${btnGhost} !h-8 !px-3 text-xs`}>Add</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {quick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setQuick(null)}>
          <div className="relative w-full max-w-3xl rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setQuick(null)} className="absolute right-3 top-3 z-10 h-8 w-8 rounded-md flex items-center justify-center text-muted hover:text-ink hover:bg-subtle" aria-label="Close">
              <Icon name="close" />
            </button>
            <div className="grid md:grid-cols-2">
              <div className="aspect-square bg-subtle flex items-center justify-center">
                <ProductImage product={quick} className="w-full h-full" emojiClass="text-8xl" />
              </div>
              <div className="p-6 flex flex-col">
                <div className="text-xs text-muted">{quick.category}</div>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink pr-8">{quick.name}</h2>
                <div className="mt-2"><Stars rating={quick.rating} count={quick.reviewsCount} /></div>
                <div className="mt-4 flex items-baseline gap-3">
                  <Price p={quick} size="text-2xl" />
                  {quick.discount && <span className="text-xs font-medium text-emerald-400">{quick.discount}</span>}
                </div>
                <p className="mt-4 text-sm text-body leading-relaxed">{quick.description}</p>

                <dl className="mt-5 divide-y divide-line border-y border-line text-sm">
                  <div className="flex justify-between py-2"><dt className="text-muted">Availability</dt><dd className="text-ink tnum">{quick.stock} in stock</dd></div>
                  <div className="flex justify-between py-2"><dt className="text-muted">Served by</dt><dd className="text-ink font-mono text-xs">product-service :3002</dd></div>
                </dl>

                <button onClick={() => { add(quick); setQuick(null); }} className={`${btnPrimary} mt-auto w-full !h-10`}>
                  Add to cart · {money(quick.price)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- cart ---------- */
function CartDrawer({ isOpen, onClose, toast, goOrders, onChange }) {
  const [cart, setCart] = useState({ items: [], total: 0 });
  const [busy, setBusy] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [checkoutErr, setCheckoutErr] = useState('');

  const load = async () => {
    const r = await api('GET', '/api/cart');
    if (r.ok) setCart(r.data || { items: [], total: 0 });
  };
  useEffect(() => { if (isOpen) load(); }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const remove = async (id) => { await api('DELETE', `/api/cart/items/${id}`); await load(); onChange?.(); };

  const applyPromo = () => {
    const code = promoCode.trim().toUpperCase();
    if (code === 'SENTINEL20') { setAppliedPromo({ code, discountPercent: 20 }); toast('Coupon SENTINEL20 applied', true); }
    else if (code === 'FREESHIP') { setAppliedPromo({ code, discountPercent: 5 }); toast('Coupon FREESHIP applied', true); }
    else toast('Invalid coupon code', false);
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
      toast(`Order #${r.data.id} confirmed`, true);
      onChange?.();
      onClose();
      goOrders();
    } else {
      const msg = errText(r);
      setCheckoutErr(msg);
      toast(msg, false);
    }
  };

  if (!isOpen) return null;
  const count = cart.items?.length || 0;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 w-full max-w-md bg-surface border-l border-line shadow-2xl flex flex-col">
        <div className="h-14 px-5 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Cart <span className="text-muted font-normal tnum">({count})</span></h2>
          <button onClick={onClose} className="h-8 w-8 rounded-md flex items-center justify-center text-muted hover:text-ink hover:bg-subtle" aria-label="Close cart">
            <Icon name="close" />
          </button>
        </div>

        {checkoutErr && (
          <div className="m-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-amber-400"><Icon name="warn" className="w-4 h-4" /> Payment failed</div>
            <p className="text-body">{checkoutErr}</p>
            <p className="text-muted">Stock was returned to the catalog and an incident was opened in Incidents.</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5">
          {!count ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-1 py-20">
              <Icon name="cart" className="w-8 h-8 text-muted mb-2" />
              <div className="text-sm font-medium text-ink">Your cart is empty</div>
              <p className="text-xs text-muted">Add products from the store to get started.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {cart.items.map((i) => (
                <li key={i.productId} className="py-4 flex items-center gap-3">
                  <div className="w-14 h-14 rounded-md overflow-hidden border border-line bg-subtle flex items-center justify-center shrink-0">
                    <ProductImage product={i} className="w-full h-full" emojiClass="text-2xl" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink truncate">{i.name}</div>
                    <div className="text-xs text-muted tnum mt-0.5">{i.qty} × {money(i.price)}</div>
                    <button onClick={() => remove(i.productId)} className="text-xs text-muted hover:text-rose-400 mt-1">Remove</button>
                  </div>
                  <div className="text-sm font-medium text-ink tnum">{money(i.price * i.qty)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {count > 0 && (
          <div className="border-t border-line p-5 space-y-4">
            <div className="flex gap-2">
              <input className={`${inputCls} uppercase`} placeholder="Coupon code" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyPromo()} />
              <button onClick={applyPromo} className={btnGhost}>Apply</button>
            </div>
            {appliedPromo && (
              <div className="flex items-center justify-between text-xs rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-emerald-400">
                <span>{appliedPromo.code} · {appliedPromo.discountPercent}% off</span>
                <button onClick={() => setAppliedPromo(null)} aria-label="Remove coupon"><Icon name="close" className="w-3.5 h-3.5" /></button>
              </div>
            )}

            <dl className="space-y-1.5 text-sm tnum">
              <div className="flex justify-between text-muted"><dt>Subtotal</dt><dd>{money(cart.total)}</dd></div>
              {appliedPromo && <div className="flex justify-between text-emerald-400"><dt>Discount</dt><dd>−{money(discountAmount)}</dd></div>}
              <div className="flex justify-between text-muted"><dt>Delivery</dt><dd>Free</dd></div>
              <div className="flex justify-between pt-2 border-t border-line text-ink font-semibold text-base"><dt>Total</dt><dd>{money(finalTotal)}</dd></div>
            </dl>

            <button onClick={checkout} disabled={busy} className={`${btnPrimary} w-full !h-10`}>
              {busy ? 'Processing…' : `Checkout · ${money(finalTotal)}`}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

/* ---------- orders ---------- */
function Orders() {
  const [orders, setOrders] = useState([]);
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    api('GET', '/api/orders').then((r) => r.ok && setOrders(r.data || []));
    api('GET', '/api/notifications').then((r) => r.ok && setNotes(r.data || []));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Orders</h1>
        <p className="text-sm text-muted mt-1">Confirmed orders and customer notifications.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-medium text-ink">Orders <span className="text-muted font-normal tnum">({orders.length})</span></h2>
          {!orders.length ? (
            <div className="rounded-xl border border-dashed border-line py-16 text-center text-sm text-muted">No orders yet. Complete a checkout in the store.</div>
          ) : (
            <ul className="space-y-3">
              {orders.map((o) => (
                <li key={o.id} className="rounded-xl border border-line bg-surface p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-ink">Order #{o.id}</div>
                      <div className="text-xs text-muted tnum">{new Date(o.at).toLocaleString()}</div>
                    </div>
                    <div className="text-sm font-semibold text-ink tnum">{money(o.total)}</div>
                  </div>
                  <div className="text-sm text-body">{o.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}</div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 border-t border-line text-xs text-muted">
                    {['Reserved', 'Charged', 'Notified', 'Dispatched'].map((s) => (
                      <span key={s} className="flex items-center gap-1"><Icon name="check" className="w-3.5 h-3.5 text-emerald-500" />{s}</span>
                    ))}
                    <span className="ml-auto font-mono">{o.paymentId}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-ink">Notifications <span className="text-muted font-normal tnum">({notes.length})</span></h2>
          {!notes.length ? (
            <div className="rounded-xl border border-dashed border-line py-16 text-center text-sm text-muted">Nothing sent yet.</div>
          ) : (
            <ul className="rounded-xl border border-line bg-surface divide-y divide-line max-h-[520px] overflow-y-auto">
              {notes.map((n) => (
                <li key={n.id} className="p-4 space-y-1">
                  <div className="text-sm text-body">{n.message}</div>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span className="capitalize">{n.channel}</span>
                    <span className="tnum">{new Date(n.at).toLocaleTimeString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/* ---------- system ---------- */
const CHAOS_ACTIONS = [
  { id: 'crash', label: 'Kill process', desc: 'Simulate process termination (SIGKILL).', dot: 'bg-rose-500' },
  { id: 'slow', label: 'Add latency (4000 ms)', desc: 'Simulate network lag or thread starvation.', dot: 'bg-amber-500' },
  { id: 'errors', label: 'Inject 5xx errors', desc: 'Simulate a bad deployment.', dot: 'bg-orange-500' },
  { id: 'leak', label: 'Memory leak', desc: 'Push heap past the 180 MB threshold.', dot: 'bg-purple-500' },
  { id: 'unhealthy', label: 'Fail health check', desc: 'Return 503 from the health probe.', dot: 'bg-amber-500' },
  { id: 'reset', label: 'Reset to baseline', desc: 'Clear simulated faults and restore health.', dot: 'bg-emerald-500' },
];

function System({ health, log }) {
  const [sel, setSel] = useState('payment-service');
  const [msg, setMsg] = useState('');
  const [injecting, setInjecting] = useState(false);

  const inject = async (action) => {
    setInjecting(true);
    const r = await api('POST', `/system/chaos/${sel}/${action}`, action === 'slow' ? { ms: 4000 } : action === 'errors' ? { rate: 1 } : {});
    setInjecting(false);
    const label = CHAOS_ACTIONS.find((c) => c.id === action)?.label || action;
    setMsg(r.ok ? `${label} applied to ${sel}` : `Could not reach ${sel}`);
    setTimeout(() => setMsg(''), 4500);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">System</h1>
        <p className="text-sm text-muted mt-1">Live service health. Select a service to run a fault-injection test.</p>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {health.map((s) => {
          const cfg = STATUS[s.status] || STATUS.down;
          const isSel = sel === s.name;
          const locked = s.name === 'api-gateway';
          return (
            <button
              key={s.name}
              onClick={() => !locked && setSel(s.name)}
              disabled={locked}
              className={`text-left rounded-xl border p-4 bg-surface transition-colors ${
                isSel ? 'border-accent ring-1 ring-accent/40' : 'border-line hover:bg-subtle'
              } ${locked ? '!cursor-default !opacity-100 hover:!bg-surface' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{s.name}</span>
                <span className={`flex items-center gap-1.5 text-xs ${cfg.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${s.status === 'down' ? 'animate-pulse' : ''}`} />
                  {cfg.label}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted">{CRITICAL.includes(s.name) ? 'Critical' : 'Non-critical'}</div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div><div className="text-muted">Latency</div><div className="text-ink font-mono tnum mt-0.5">{s.latencyMs != null ? `${s.latencyMs} ms` : '—'}</div></div>
                <div><div className="text-muted">Memory</div><div className="text-ink font-mono tnum mt-0.5">{s.memoryMB != null ? `${s.memoryMB} MB` : '—'}</div></div>
              </div>
            </button>
          );
        })}
      </section>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 rounded-xl border border-line bg-surface">
          <div className="p-4 border-b border-line flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-ink">Fault injection</h2>
              <p className="text-xs text-muted mt-0.5">Test detection and automated recovery.</p>
            </div>
            <span className="text-xs text-muted">Target <span className="text-ink font-mono ml-1">{sel}</span></span>
          </div>
          <div className="p-4 grid sm:grid-cols-2 gap-3">
            {CHAOS_ACTIONS.map((c) => (
              <button key={c.id} onClick={() => inject(c.id)} disabled={injecting} className="text-left rounded-lg border border-line p-3 hover:bg-subtle transition-colors">
                <div className="flex items-center gap-2 text-sm font-medium text-ink"><span className={`w-2 h-2 rounded-full ${c.dot}`} />{c.label}</div>
                <div className="text-xs text-muted mt-1">{c.desc}</div>
              </button>
            ))}
          </div>
          {msg && <div className="mx-4 mb-4 rounded-md bg-subtle px-3 py-2 text-xs text-body font-mono">{msg}</div>}
        </section>

        <section className="rounded-xl border border-line bg-surface">
          <div className="p-4 border-b border-line flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink">Activity</h2>
            <span className="text-xs text-muted tnum">{log.length} events</span>
          </div>
          <ul className="max-h-80 overflow-y-auto divide-y divide-line">
            {!log.length ? (
              <li className="p-6 text-center text-xs text-muted">No state changes yet.</li>
            ) : (
              log.map((e, idx) => (
                <li key={idx} className="px-4 py-3 text-xs space-y-0.5">
                  <div className="flex justify-between"><span className="font-medium text-ink">{e.name}</span><span className="text-muted tnum">{e.t}</span></div>
                  <div className={e.status === 'up' ? 'text-emerald-400' : 'text-rose-400'}>{e.msg}</div>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

/* ---------- app ---------- */
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
    if (r.ok && r.data?.items) setCartCount(r.data.items.reduce((s, i) => s + i.qty, 0));
  };
  useEffect(() => { if (user) syncCartCount(); }, [user]);

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
    setCartCount(0);
  };

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col">
      <Header user={user} tab={tab} setTab={setTab} health={health} cartCount={cartCount} onCart={() => setIsCartOpen(true)} onLogout={logout} />

      {!user ? (
        <Login onLogin={login} />
      ) : (
        <>
          <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full flex-1">
            {tab === 'shop' && <Shop onCart={syncCartCount} toast={toast} />}
            {tab === 'orders' && <Orders />}
            {tab === 'system' && <System health={health} log={log} />}
            {tab === 'sentinel' && <Sentinel />}
          </main>
          <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} toast={toast} goOrders={() => setTab('orders')} onChange={syncCartCount} />
        </>
      )}

      {toastMsg && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 rounded-lg bg-ink text-canvas px-4 py-2.5 text-sm shadow-xl">
          <span className={`w-2 h-2 rounded-full ${toastMsg.ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          {toastMsg.m}
        </div>
      )}
    </div>
  );
}