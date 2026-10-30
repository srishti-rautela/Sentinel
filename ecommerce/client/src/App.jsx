import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, imageUrl, money } from './api.js';
import {
  Search, Heart, ShoppingBag, UserRound, Menu, ArrowRight, ArrowUpRight,
  Truck, ShieldCheck, RefreshCw, Plus, Minus, Trash2, PackageCheck,
  LogOut, LayoutDashboard, Box, ClipboardList, Sparkles, CheckCircle2
} from 'lucide-react';

const initialUser = () => {
  try {
    return JSON.parse(localStorage.getItem('tilda_user') || 'null');
  } catch {
    return null;
  }
};

const seedFallback = [
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
  description:
    'A thoughtfully selected everyday essential, designed to bring a little more ease and beauty to your routine.',
}));

const emptyAddress = {
  name: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
};

// Converts old database image paths to the actual files in public/images.
const resolveProductImage = (image) => {
  const fileName = String(image || '')
    .split('?')[0]
    .split('/')
    .pop()
    .toLowerCase();

  const bundledImages = {
    'notebook.svg': '/images/notebook.jpg',
    'notebook.jpg': '/images/notebook.jpg',
    'gel-pens.svg': '/images/gel-pens.jpg',
    'gel-pens.jpg': '/images/gel-pens.jpg',
    'backpack.svg': '/images/backpack.jpg',
    'backpack.jpg': '/images/backpack.jpg',
    'flask.svg': '/images/flask.jpg',
    'flask.jpg': '/images/flask.jpg',
    'desk-lamp.svg': '/images/desk-lamp.jpg',
    'desk-lamp.jpg': '/images/desk-lamp.jpg',
    'headphones.svg': '/images/headphones.jpg',
    'headphones.jpg': '/images/headphones.jpg',
    'desk-mat.svg': '/images/desk-mat.jpg',
    'desk-mat.jpg': '/images/desk-mat.jpg',
    'planter.svg': '/images/planter.jpg',
    'planter.jpg': '/images/planter.jpg',
    'candle.svg': '/images/candle.jpg',
    'candle.jpg': '/images/candle.jpg',
    'ceramic-mug.svg': '/images/ceramic-mug.png',
    'ceramic-mug.jpg': '/images/ceramic-mug.png',
    'ceramic-mug.png': '/images/ceramic-mug.png',
    'oak-riser.svg': '/images/oak-riser.png',
    'oak-riser.png': '/images/oak-riser.png',
    'linen-cushion.svg': '/images/linen-cushion.png',
    'linen-cushion.png': '/images/linen-cushion.png',
  };

  return bundledImages[fileName] || imageUrl(image);
};

export default function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('newest');

  const [user, setUser] = useState(initialUser);
  const [page, setPage] = useState('shop');
  const [selected, setSelected] = useState(null);

  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('tilda_cart') || '{}');
    } catch {
      return {};
    }
  });

  const [wishlist, setWishlist] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('tilda_wishlist') || '[]');
    } catch {
      return [];
    }
  });

  const [toast, setToast] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [busy, setBusy] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState(emptyAddress);
  const [orders, setOrders] = useState([]);
  const [adminTab, setAdminTab] = useState('products');
  const [stats, setStats] = useState(null);
  const [adminProducts, setAdminProducts] = useState([]);
  const [adminOrders, setAdminOrders] = useState([]);
  const [productForm, setProductForm] = useState({
    name: '',
    category: 'Stationery',
    description: '',
    price: '',
    compareAtPrice: '',
    stock: '',
    image: '/images/notebook.jpg',
  });
  const [uploading, setUploading] = useState(false);

  const notify = useCallback((msg) => {
    setToast(msg);
    window.clearTimeout(window.__tildaToast);
    window.__tildaToast = window.setTimeout(() => setToast(''), 2800);
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/products');
            setProducts(data.products.map((p) => ({
        ...p,
        image: String(p.image || '').startsWith('/uploads/')
          ? resolveProductImage(p.image)
          : (nameImages[String(p.name || '').trim().toLowerCase()] || resolveProductImage(p.image)),
      })));
      setError('');
    } catch (e) {
      setError(`${e.message} Showing local preview items until the API is available.`);
      setProducts(seedFallback);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    localStorage.setItem('tilda_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem('tilda_wishlist', JSON.stringify(wishlist));
  }, [wishlist]);
  useEffect(() => {
  if (loading) return;

  const validIds = new Set(products.map((product) => product._id));

  setCart((currentCart) => {
    const cleanedCart = {};

    for (const [id, quantity] of Object.entries(currentCart)) {
      if (validIds.has(id) && Number(quantity) > 0) {
        cleanedCart[id] = Number(quantity);
      }
    }

    return cleanedCart;
  });
}, [products, loading]);

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      notify('Your session expired. Please sign in again.');
    };

    window.addEventListener('tilda:auth-expired', onExpired);
    return () => window.removeEventListener('tilda:auth-expired', onExpired);
  }, [notify]);

  const categories = useMemo(
    () => ['All', ...new Set(products.map((p) => p.category))],
    [products]
  );

  const shown = useMemo(() => {
    let items = products.filter(
      (p) =>
        (category === 'All' || p.category === category) &&
        `${p.name} ${p.category} ${p.description}`
          .toLowerCase()
          .includes(query.toLowerCase())
    );

    if (page === 'wishlist') {
      items = items.filter((p) => wishlist.includes(p._id));
    }
    if (sort === 'price-asc') items.sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') items.sort((a, b) => b.price - a.price);

    return items;
  }, [products, category, query, sort, page, wishlist]);

  const cartItems = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, quantity]) => ({
          product: products.find((p) => p._id === id),
          id,
          quantity,
        }))
        .filter((item) => item.product),
    [cart, products]
  );

  const subtotal = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
  const shipping = subtotal === 0 || subtotal >= 999 ? 0 : 79;
  const total = subtotal + shipping;
 const cartCount = cartItems.reduce(
  (sum, item) => sum + Number(item.quantity),
  0
);

  const addToCart = (product) => {
    if (product.stock < 1) {
      return notify('This product is currently out of stock.');
    }

    setCart((current) => ({
      ...current,
      [product._id]: Math.min((current[product._id] || 0) + 1, 20),
    }));
    notify(`${product.name} added to your bag.`);
  };

  const changeQty = (id, delta) =>
    setCart((current) => {
      const next = (current[id] || 0) + delta;

      if (next <= 0) {
        const updated = { ...current };
        delete updated[id];
        return updated;
      }

      const product = products.find((p) => p._id === id);
      return {
        ...current,
        [id]: Math.min(next, product?.stock || 20, 20),
      };
    });

  const toggleWish = (product) =>
    setWishlist((current) => {
      const alreadySaved = current.includes(product._id);
      notify(
        alreadySaved
          ? 'Removed from wishlist.'
          : 'Saved to your wishlist.'
      );

      return alreadySaved
        ? current.filter((id) => id !== product._id)
        : [...current, product._id];
    });

  const signOut = () => {
    localStorage.removeItem('tilda_token');
    localStorage.removeItem('tilda_user');
    setUser(null);
    setPage('shop');
    notify('You have signed out.');
  };

  const requireLogin = () => {
    setAuthMode('login');
    setPage('auth');
    notify('Sign in to continue.');
  };

  const signIn = async (event) => {
    event.preventDefault();
    setBusy(true);

    try {
      const data = await api(
        `/auth/${authMode === 'register' ? 'register' : 'login'}`,
        {
          method: 'POST',
          body: JSON.stringify(authForm),
        }
      );

      localStorage.setItem('tilda_token', data.token);
      localStorage.setItem('tilda_user', JSON.stringify(data.user));
      setUser(data.user);
      setPage(data.user.role === 'admin' ? 'admin' : 'shop');
      notify(authMode === 'register' ? 'Welcome to Tilda!' : 'Welcome back!');
      setAuthForm({ name: '', email: '', password: '' });
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };

  const placeOrder = async (event) => {
    event.preventDefault();
    if (!user) return requireLogin();

    setBusy(true);
    try {
      const data = await api('/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: cartItems.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
          shippingAddress: checkoutForm,
        }),
      });

      setCart({});
      setOrders((current) => [data.order, ...current]);
      setSelected(data.order);
      setPage('success');
      await loadProducts();
      notify('Your order has been placed.');
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };

  const openOrders = async () => {
    if (!user) return requireLogin();

    try {
      const data = await api('/orders/my');
      setOrders(data.orders);
      setPage('orders');
    } catch (e) {
      notify(e.message);
    }
  };

  const loadAdmin = async (tab = adminTab) => {
    if (user?.role !== 'admin') {
      return notify('Admin access required.');
    }

    setPage('admin');
    setAdminTab(tab);

    try {
      const [statsData, productData, orderData] = await Promise.all([
        api('/orders/admin/stats'),
        api('/products/admin/all'),
        api('/orders/admin/all'),
      ]);

      setStats(statsData);
      setAdminProducts(productData.products);
      setAdminOrders(orderData.orders);
    } catch (e) {
      notify(e.message);
    }
  };

  const submitProduct = async (event) => {
    event.preventDefault();
    setBusy(true);

    try {
      await api('/products', {
        method: 'POST',
        body: JSON.stringify({
          ...productForm,
          price: Number(productForm.price),
          compareAtPrice: Number(productForm.compareAtPrice || 0),
          stock: Number(productForm.stock),
        }),
      });

      setProductForm({
        name: '',
        category: 'Stationery',
        description: '',
        price: '',
        compareAtPrice: '',
        stock: '',
        image: '/images/notebook.jpg',
      });

      await loadAdmin('products');
      await loadProducts();
      notify('Product added to the catalogue.');
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (file) => {
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const data = await api('/uploads', {
        method: 'POST',
        body: formData,
      });

      setProductForm((current) => ({ ...current, image: data.image }));
      notify('Image uploaded. Save the product to apply it.');
    } catch (e) {
      notify(e.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteProduct = async (product) => {
    if (!window.confirm(`Archive “${product.name}”?`)) return;

    try {
      await api(`/products/${product._id}`, { method: 'DELETE' });
      await loadAdmin('products');
      await loadProducts();
      notify('Product archived.');
    } catch (e) {
      notify(e.message);
    }
  };

  const updateStock = async (product, value) => {
    try {
      await api(`/products/${product._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stock: Number(value) }),
      });
      await loadAdmin('products');
      await loadProducts();
    } catch (e) {
      notify(e.message);
    }
  };

  const updateOrder = async (id, status) => {
    try {
      await api(`/orders/admin/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadAdmin('orders');
      notify('Order status updated.');
    } catch (e) {
      notify(e.message);
    }
  };

  const header = (
    <header className="header">
      <a
        className="brand"
        onClick={() => {
          setPage('shop');
          setSelected(null);
        }}
      >
        <span className="brand-mark">t</span> tilda
        <span className="brand-dot">.</span>
      </a>

      <nav className="desktop-nav">
        <button onClick={() => setPage('shop')}>Shop</button>
        <button
          onClick={() => {
            setCategory('All');
            setPage('shop');
          }}
        >
          Collections
        </button>
        <a
          href="#story"
          onClick={() => setPage('shop')}
        >
          Our story
        </a>
      </nav>

      <div className="header-tools">
        <label className="searchbox">
          <Search size={17} />
          <input
            placeholder="Search essentials"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage('shop');
            }}
          />
          <kbd>⌘ K</kbd>
        </label>

        <button
          className={`icon-button ${page === 'wishlist' ? 'active' : ''}`}
          aria-label="Wishlist"
          onClick={() => setPage('wishlist')}
        >
          <Heart size={19} />
          <span className="counter">{wishlist.length}</span>
        </button>

        <button
          className="icon-button"
          aria-label="Shopping bag"
          onClick={() => setPage('cart')}
        >
          <ShoppingBag size={19} />
          <span className="counter">{cartCount}</span>
        </button>

        {user ? (
          <button
            className="user-pill"
            onClick={() => user.role === 'admin' ? loadAdmin() : openOrders()}
          >
            <UserRound size={16} />
            <span>{user.name.split(' ')[0]}</span>
          </button>
        ) : (
          <button className="login-link" onClick={requireLogin}>
            Sign in <ArrowUpRight size={15} />
          </button>
        )}

        <button
          className="mobile-menu"
          onClick={() => setPage('menu')}
          aria-label="Open menu"
        >
          <Menu />
        </button>
      </div>
    </header>
  );

  const productCard = (product) => (
    <article className="product-card" key={product._id}>
      <div
        className="product-image"
        onClick={() => {
          setSelected(product);
          setPage('detail');
        }}
      >
        <img
          src={resolveProductImage(product.image)}
          alt={product.name}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = '/images/notebook.jpg';
          }}
        />

        <span className="image-label">
          {product.stock > 0 ? 'In stock' : 'Sold out'}
        </span>

        <button
          className={`wish-button ${wishlist.includes(product._id) ? 'selected' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            toggleWish(product);
          }}
          aria-label="Toggle wishlist"
        >
          <Heart
            size={18}
            fill={wishlist.includes(product._id) ? 'currentColor' : 'none'}
          />
        </button>

        <button
          className="quick-add"
          disabled={product.stock < 1}
          onClick={(event) => {
            event.stopPropagation();
            addToCart(product);
          }}
        >
          <Plus size={16} /> Add to bag
        </button>
      </div>

      <div
        className="product-info"
        onClick={() => {
          setSelected(product);
          setPage('detail');
        }}
      >
        <p className="eyebrow">{product.category}</p>
        <h3>{product.name}</h3>
        <div className="product-bottom">
          <span className="price">{money(product.price)}</span>
          {product.compareAtPrice > product.price && (
            <span className="old-price">{money(product.compareAtPrice)}</span>
          )}
          <span className="arrow-circle">
            <ArrowUpRight size={15} />
          </span>
        </div>
      </div>
    </article>
  );

  const hero = (
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow hero-kicker">
          <span className="sparkle"><Sparkles size={14} /></span>
          SMALL THINGS. BETTER DAYS.
        </div>

        <h1>
          Everyday essentials,
          <br />
          <em>beautifully</em> considered.
        </h1>

        <p>
          Thoughtful objects for your desk, your bag, and the little rituals
          that make a day feel like yours.
        </p>

        <div className="hero-actions">
          <button
            className="button dark"
            onClick={() =>
              document.getElementById('catalogue')?.scrollIntoView({
                behavior: 'smooth',
              })
            }
          >
            Explore the collection <ArrowRight size={16} />
          </button>
          <span className="hero-note">
            Made for your everyday <span>✳</span>
          </span>
        </div>

        <div className="hero-proof">
          <div className="avatar-stack">
            <span>t</span>
            <span>✳</span>
            <span>♡</span>
          </div>
          <span>
            <b>Small details, big difference.</b>
            <br />
            A little more thoughtful, every day.
          </span>
        </div>
      </div>

      <div className="hero-visual">
        <div className="hero-photo photo-one">
          <img src="/images/backpack.jpg" alt="Everyday backpack" />
        </div>
        <div className="hero-photo photo-two">
          <img src="/images/notebook.jpg" alt="Notebook" />
        </div>
        <div className="hero-photo photo-three">
          <img src="/images/flask.jpg" alt="Reusable flask" />
        </div>

        <div className="hero-sticker">
          <span>THE DAILY</span>
          <strong>GOOD<br />THINGS</strong>
          <span>CLUB · 001</span>
        </div>

        <div className="hero-caption">
          A softer kind of everyday. <ArrowUpRight size={14} />
        </div>
      </div>
    </section>
  );

  const perks = (
    <section className="perks">
      <div>
        <Truck />
        <span><b>Free delivery</b><small>On orders over ₹999</small></span>
      </div>
      <div>
        <ShieldCheck />
        <span><b>Thoughtful quality</b><small>Made to be used daily</small></span>
      </div>
      <div>
        <RefreshCw />
        <span><b>Easy returns</b><small>7-day return window</small></span>
      </div>
      <div>
        <PackageCheck />
        <span><b>Cash on delivery</b><small>Pay when it arrives</small></span>
      </div>
    </section>
  );

  const shopPage = (
    <>
      {hero}
      {perks}

      <section className="catalogue section-wrap" id="catalogue">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE TILDA EDIT</p>
            <h2>Good things, <em>found.</em></h2>
            <p className="section-sub">
              Useful, lovely, and made to fit into your everyday.
            </p>
          </div>
          <div className="catalogue-count">
            {shown.length.toString().padStart(2, '0')} <span>pieces to love</span>
          </div>
        </div>

        <div className="catalogue-controls">
          <div className="category-list">
            {categories.map((item) => (
              <button
                key={item}
                className={category === item ? 'active' : ''}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <select
            aria-label="Sort products"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="newest">Sort: Featured</option>
            <option value="price-asc">Price: Low to high</option>
            <option value="price-desc">Price: High to low</option>
          </select>
        </div>

        {error && (
          <div className="notice">
            <span>{error}</span>
            <button onClick={loadProducts}>Retry</button>
          </div>
        )}

        {loading ? (
          <div className="loading-grid">
            {Array.from({ length: 8 }, (_, i) => (
              <div className="skeleton" key={i} />
            ))}
          </div>
        ) : shown.length ? (
          <div className="product-grid">{shown.map(productCard)}</div>
        ) : (
          <div className="empty-state">
            <Sparkles />
            <h3>No little treasures found.</h3>
            <p>Try another search or collection.</p>
            <button
              className="button outline"
              onClick={() => {
                setQuery('');
                setCategory('All');
                setPage('shop');
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </section>

      <section className="story section-wrap" id="story">
        <div className="story-image">
          <img src="/images/ceramic-mug.png" alt="Stoneware mug" />
          <span>OBJECTS WITH INTENTION</span>
        </div>
        <div className="story-copy">
          <p className="eyebrow">A NOTE FROM TILDA</p>
          <h2>Less noise.<br /><em>More meaning.</em></h2>
          <p>
            We believe the things we reach for every day should feel good to use.
            Tilda is a small collection of useful objects, considered materials,
            and quiet colours — chosen to make ordinary moments feel a little
            more special.
          </p>
          <button
            className="text-link"
            onClick={() => {
              setCategory('All');
              document.getElementById('catalogue')?.scrollIntoView({
                behavior: 'smooth',
              });
            }}
          >
            Find your everyday favourite <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </>
  );

  const cartPage = (
    <section className="page-shell">
      <button className="back-link" onClick={() => setPage('shop')}>
        ← Keep browsing
      </button>

      <div className="page-title">
        <div>
          <p className="eyebrow">YOUR LITTLE FINDS</p>
          <h1>Your bag<span className="brand-dot">.</span></h1>
        </div>
        <span>{cartCount} {cartCount === 1 ? 'item' : 'items'}</span>
      </div>

      {cartItems.length ? (
        <div className="checkout-layout">
          <div className="cart-list">
            {cartItems.map(({ product, quantity }) => (
              <div className="cart-row" key={product._id}>
                <img src={resolveProductImage(product.image)} alt={product.name} />
                <div className="cart-row-info">
                  <p className="eyebrow">{product.category}</p>
                  <h3>{product.name}</h3>
                  <span>{money(product.price)}</span>
                  <div className="quantity-control">
                    <button
                      onClick={() => changeQty(product._id, -1)}
                      aria-label="Decrease quantity"
                    >
                      <Minus size={14} />
                    </button>
                    <span>{quantity}</span>
                    <button
                      onClick={() => changeQty(product._id, 1)}
                      disabled={quantity >= product.stock || quantity >= 20}
                      aria-label="Increase quantity"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                <div className="cart-row-end">
                  <b>{money(product.price * quantity)}</b>
                  <button
                    className="remove-button"
                    onClick={() =>
                      setCart((current) => {
                        const updated = { ...current };
                        delete updated[product._id];
                        return updated;
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <aside className="order-summary">
            <p className="eyebrow">THE TOTAL</p>
            <h2>Order summary</h2>
            <div><span>Subtotal</span><b>{money(subtotal)}</b></div>
            <div><span>Delivery</span><b>{shipping === 0 ? 'Free' : money(shipping)}</b></div>
            {shipping > 0 && (
              <p className="shipping-hint">
                You're {money(999 - subtotal)} away from free delivery.
              </p>
            )}
            <div className="summary-total"><span>Total</span><b>{money(total)}</b></div>
            <button
              className="button dark full"
              onClick={() => {
                if (!user) requireLogin();
                else setPage('checkout');
              }}
            >
              Continue to checkout <ArrowRight size={16} />
            </button>
            <p className="cod-note"><ShieldCheck size={15} /> Secure checkout · Cash on delivery</p>
          </aside>
        </div>
      ) : (
        <div className="empty-state">
          <ShoppingBag />
          <h3>Your bag is taking a little break.</h3>
          <p>Find something useful and lovely to bring home.</p>
          <button className="button dark" onClick={() => setPage('shop')}>
            Explore the collection <ArrowRight size={16} />
          </button>
        </div>
      )}
    </section>
  );

const detailPage =
  selected && page === 'detail' ? (
    <section className="page-shell">
      <button
        className="back-link"
        onClick={() => {
          setSelected(null);
          setPage('shop');
        }}
      >
        ← Back to the collection
      </button>

      <div className="detail-layout">
        <div className="detail-image">
          <img
            src={resolveProductImage(selected.image)}
            alt={selected.name || 'Product'}
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = '/images/notebook.jpg';
            }}
          />
        </div>

        <div className="detail-copy">
          <p className="eyebrow">
            {(selected.category || 'Product').toUpperCase()} · THE TILDA EDIT
          </p>

          <h1>{selected.name || 'Product details'}</h1>

          <p className="detail-price">
            {money(selected.price || 0)}{' '}
            {selected.compareAtPrice > selected.price && (
              <del>{money(selected.compareAtPrice)}</del>
            )}
          </p>

          <p className="detail-description">
            {selected.description ||
              'A thoughtfully selected everyday essential.'}
          </p>

          <p
            className={`stock-line ${
              (selected.stock ?? 0) < 5 ? 'low-stock' : ''
            }`}
          >
            <span />
            {(selected.stock ?? 0) > 0
              ? `${selected.stock} in stock`
              : 'Currently sold out'}
          </p>

          <div className="detail-actions">
            <button
              className="button dark"
              disabled={!selected.stock}
              onClick={() => addToCart(selected)}
            >
              Add to bag <ShoppingBag size={17} />
            </button>

            <button
              className="button outline"
              onClick={() => toggleWish(selected)}
            >
              <Heart
                size={17}
                fill={
                  wishlist.includes(selected._id) ? 'currentColor' : 'none'
                }
              />
              {wishlist.includes(selected._id)
                ? 'Saved'
                : 'Save for later'}
            </button>
          </div>

          <div className="detail-benefits">
            <p>
              <Truck /> Free delivery on orders over ₹999
            </p>
            <p>
              <RefreshCw /> 7-day return window
            </p>
            <p>
              <ShieldCheck /> Cash on delivery available
            </p>
          </div>
        </div>
      </div>
    </section>
  ) : null; 


  const authPage = (
    <section className="auth-shell">
      <div className="auth-art">
        <img src="/images/notebook.jpg" alt="Tilda notebook" />
        <div>
          <p className="eyebrow">A LITTLE SPACE FOR YOU</p>
          <h2>Good things<br /><em>start here.</em></h2>
          <p>Keep your favourite finds close, and your next good thing even closer.</p>
        </div>
      </div>

      <form className="auth-form" onSubmit={signIn}>
        <p className="eyebrow">WELCOME TO TILDA</p>
        <h1>{authMode === 'login' ? 'Welcome back.' : 'Make yourself at home.'}</h1>
        <p className="muted">
          {authMode === 'login'
            ? 'Sign in to see your orders and saved things.'
            : 'Create an account for a more personal shopping experience.'}
        </p>

        {authMode === 'register' && (
          <label>
            Your name
            <input
              required
              minLength="2"
              maxLength="80"
              value={authForm.name}
              onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })}
              autoComplete="name"
            />
          </label>
        )}

        <label>
          Email address
          <input
            type="email"
            required
            value={authForm.email}
            onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
            autoComplete="email"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            required
            minLength={authMode === 'register' ? 10 : 1}
            maxLength="128"
            value={authForm.password}
            onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
            autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
          />
          {authMode === 'register' && <small>Use at least 10 characters.</small>}
        </label>

        <button className="button dark full" disabled={busy}>
          {busy ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Create account'}
          <ArrowRight size={16} />
        </button>

        <p className="auth-switch">
          {authMode === 'login' ? 'New around here?' : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
          >
            {authMode === 'login' ? 'Create an account' : 'Sign in instead'}
          </button>
        </p>

        <button
          type="button"
          className="back-link centered"
          onClick={() => setPage('shop')}
        >
          Back to shopping
        </button>
      </form>
    </section>
  );

  const checkoutPage = (
    <section className="page-shell">
      <button className="back-link" onClick={() => setPage('cart')}>← Back to your bag</button>
      <div className="page-title">
        <div>
          <p className="eyebrow">ALMOST YOURS</p>
          <h1>Delivery details<span className="brand-dot">.</span></h1>
        </div>
      </div>

      <form onSubmit={placeOrder} className="checkout-layout">
        <div className="address-form box-card">
          <h2>Where should we send it?</h2>
          <p className="muted">We'll use these details to deliver your order.</p>

          <div className="form-grid">
            <label className="wide">
              Full name
              <input
                required
                maxLength="100"
                autoComplete="name"
                value={checkoutForm.name}
                onChange={(event) => setCheckoutForm({ ...checkoutForm, name: event.target.value })}
              />
            </label>

            <label>
              Phone number
              <input
                required
                type="tel"
                pattern="[0-9()+ -]{8,18}"
                autoComplete="tel"
                value={checkoutForm.phone}
                onChange={(event) => setCheckoutForm({ ...checkoutForm, phone: event.target.value })}
              />
            </label>

            <label className="wide">
              Address
              <input
                required
                maxLength="200"
                autoComplete="street-address"
                value={checkoutForm.address}
                onChange={(event) => setCheckoutForm({ ...checkoutForm, address: event.target.value })}
              />
            </label>

            <label>
              City
              <input
                required
                maxLength="80"
                autoComplete="address-level2"
                value={checkoutForm.city}
                onChange={(event) => setCheckoutForm({ ...checkoutForm, city: event.target.value })}
              />
            </label>

            <label>
              State
              <input
                required
                maxLength="80"
                autoComplete="address-level1"
                value={checkoutForm.state}
                onChange={(event) => setCheckoutForm({ ...checkoutForm, state: event.target.value })}
              />
            </label>

            <label>
              PIN code
              <input
                required
                pattern="[0-9]{5,10}"
                maxLength="10"
                autoComplete="postal-code"
                value={checkoutForm.pincode}
                onChange={(event) => setCheckoutForm({ ...checkoutForm, pincode: event.target.value })}
              />
            </label>
          </div>

          <div className="payment-choice">
            <span className="payment-icon">₹</span>
            <div>
              <b>Cash on delivery</b>
              <p>Pay in cash when your order reaches you. Online payments will be added later.</p>
            </div>
            <CheckCircle2 className="checked-icon" />
          </div>

          <button
            className="button dark full mobile-submit"
            disabled={busy || !cartItems.length}
          >
            {busy ? 'Placing order…' : `Place COD order · ${money(total)}`}
            <ArrowRight size={16} />
          </button>
        </div>

        <aside className="order-summary">
          <p className="eyebrow">YOUR ORDER</p>
          <h2>Order summary</h2>

          {cartItems.map((item) => (
            <div className="mini-order" key={item.id}>
              <img src={resolveProductImage(item.product.image)} alt="" />
              <span>{item.product.name} <small>× {item.quantity}</small></span>
              <b>{money(item.product.price * item.quantity)}</b>
            </div>
          ))}

          <div><span>Subtotal</span><b>{money(subtotal)}</b></div>
          <div><span>Delivery</span><b>{shipping === 0 ? 'Free' : money(shipping)}</b></div>
          <div className="summary-total"><span>Total</span><b>{money(total)}</b></div>

          <button
            className="button dark full desktop-submit"
            disabled={busy || !cartItems.length}
          >
            {busy ? 'Placing order…' : `Place COD order · ${money(total)}`}
            <ArrowRight size={16} />
          </button>
          <p className="cod-note"><ShieldCheck size={15} /> No online payment required.</p>
        </aside>
      </form>
    </section>
  );

  const successPage = (
    <section className="success-shell">
      <div className="success-icon"><CheckCircle2 size={42} /></div>
      <p className="eyebrow">ORDER RECEIVED</p>
      <h1>That's a good thing<br /><em>on its way.</em></h1>
      <p>
        Your order <b>{selected?.orderNumber || ''}</b> has been placed.
        You'll pay cash on delivery once it arrives.
      </p>
      <div className="success-card">
        <div><span>Order total</span><b>{money(selected?.total)}</b></div>
        <div><span>Payment</span><b>Cash on delivery</b></div>
        <div><span>Status</span><b>{selected?.status || 'Pending confirmation'}</b></div>
      </div>
      <button className="button dark" onClick={() => setPage('orders')}>
        View my orders <ArrowRight size={16} />
      </button>
      <button className="text-link" onClick={() => setPage('shop')}>Continue shopping</button>
    </section>
  );

  const ordersPage = (
    <section className="page-shell">
      <button className="back-link" onClick={() => setPage('shop')}>← Shop</button>
      <div className="page-title">
        <div>
          <p className="eyebrow">YOUR TILDA ACCOUNT</p>
          <h1>Your orders<span className="brand-dot">.</span></h1>
        </div>
        <button className="button outline" onClick={signOut}>
          <LogOut size={15} /> Sign out
        </button>
      </div>

      {orders.length ? (
        <div className="orders-list">
          {orders.map((order) => (
            <article className="order-card" key={order._id}>
              <div className="order-card-head">
                <div>
                  <span className="eyebrow">{order.orderNumber}</span>
                  <small>
                    {new Date(order.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </small>
                </div>
                <span className="status-pill">{order.status}</span>
              </div>

              <div className="order-card-items">
                {order.items.map((item, index) => (
                  <div key={index}>
                    <img src={resolveProductImage(item.image)} alt="" />
                    <span>{item.name} <small>× {item.quantity}</small></span>
                    <b>{money(item.price * item.quantity)}</b>
                  </div>
                ))}
              </div>

              <div className="order-card-foot">
                <span>Cash on delivery · {order.paymentStatus}</span>
                <b>{money(order.total)}</b>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <PackageCheck />
          <h3>No orders just yet.</h3>
          <p>Your next favourite thing could be right here.</p>
          <button className="button dark" onClick={() => setPage('shop')}>
            Start exploring <ArrowRight size={16} />
          </button>
        </div>
      )}
    </section>
  );

  const adminPage = (
    <section className="page-shell admin-shell">
      <div className="page-title">
        <div>
          <p className="eyebrow">TILDA WORKSPACE</p>
          <h1>Store dashboard<span className="brand-dot">.</span></h1>
        </div>
        <button className="button outline" onClick={signOut}>
          <LogOut size={15} /> Sign out
        </button>
      </div>

      <div className="admin-tabs">
        <button className={adminTab === 'products' ? 'active' : ''} onClick={() => loadAdmin('products')}>
          <Box size={16} /> Products
        </button>
        <button className={adminTab === 'orders' ? 'active' : ''} onClick={() => loadAdmin('orders')}>
          <ClipboardList size={16} /> Orders
        </button>
        <button className={adminTab === 'overview' ? 'active' : ''} onClick={() => loadAdmin('overview')}>
          <LayoutDashboard size={16} /> Overview
        </button>
      </div>

      {adminTab === 'overview' ? (
        <div className="stats-grid">
          {[
            ['Active products', stats?.products ?? '—'],
            ['Orders', stats?.orders ?? '—'],
            ['Customers', stats?.customers ?? '—'],
            ['Order value', money(stats?.orderValue ?? 0)],
          ].map(([label, value]) => (
            <div className="stat-card" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      ) : adminTab === 'products' ? (
        <div className="admin-products-layout">
          <form className="box-card add-product-form" onSubmit={submitProduct}>
            <p className="eyebrow">CATALOGUE MANAGEMENT</p>
            <h2>Add a product</h2>

            <label>
              Product name
              <input
                required
                maxLength="120"
                value={productForm.name}
                onChange={(event) => setProductForm({ ...productForm, name: event.target.value })}
              />
            </label>

            <label>
              Category
              <input
                required
                maxLength="60"
                value={productForm.category}
                onChange={(event) => setProductForm({ ...productForm, category: event.target.value })}
              />
            </label>

            <label>
              Description
              <textarea
                required
                maxLength="2000"
                value={productForm.description}
                onChange={(event) => setProductForm({ ...productForm, description: event.target.value })}
              />
            </label>

            <div className="form-grid">
              <label>
                Price (₹)
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={productForm.price}
                  onChange={(event) => setProductForm({ ...productForm, price: event.target.value })}
                />
              </label>

              <label>
                Compare at (₹)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={productForm.compareAtPrice}
                  onChange={(event) => setProductForm({ ...productForm, compareAtPrice: event.target.value })}
                />
              </label>

              <label>
                Stock
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={productForm.stock}
                  onChange={(event) => setProductForm({ ...productForm, stock: event.target.value })}
                />
              </label>
            </div>

            <label>
              Product image (JPG, PNG, WebP)
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => uploadImage(event.target.files?.[0])}
              />
              <small>
                {uploading ? 'Uploading…' : 'Upload a photo or use a bundled image path below.'}
              </small>
            </label>

            <label>
              Image path
              <input
                value={productForm.image}
                onChange={(event) => setProductForm({ ...productForm, image: event.target.value })}
              />
            </label>

            <button className="button dark full" disabled={busy || uploading}>
              {busy ? 'Saving…' : 'Add product'} <Plus size={16} />
            </button>
          </form>

          <div className="admin-table-wrap">
            <div className="table-heading">
              <h2>All products <span>{adminProducts.length}</span></h2>
              <button onClick={() => loadAdmin('products')}>Refresh ↻</button>
            </div>

            <table>
              <thead>
                <tr><th>Product</th><th>Price</th><th>Stock</th><th>Action</th></tr>
              </thead>
              <tbody>
                {adminProducts.map((product) => (
                  <tr key={product._id}>
                    <td>
                      <div className="table-product">
                        <img src={resolveProductImage(product.image)} alt="" />
                        <div><b>{product.name}</b><small>{product.category}</small></div>
                      </div>
                    </td>
                    <td>{money(product.price)}</td>
                    <td>
                      <input
                        className="stock-input"
                        type="number"
                        min="0"
                        defaultValue={product.stock}
                        onBlur={(event) =>
                          Number(event.target.value) !== product.stock &&
                          updateStock(product, event.target.value)
                        }
                        aria-label={`Stock for ${product.name}`}
                      />
                    </td>
                    <td>
                      <button
                        className="remove-button"
                        onClick={() => deleteProduct(product)}
                        aria-label={`Archive ${product.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <div className="table-heading">
            <h2>Customer orders <span>{adminOrders.length}</span></h2>
            <button onClick={() => loadAdmin('orders')}>Refresh ↻</button>
          </div>

          <table>
  <thead>
    <tr>
      <th>Order</th>
      <th>Customer</th>
      <th>Total</th>
      <th>Status</th>
      <th>Update</th>
    </tr>
  </thead>

  <tbody>
    {adminOrders.map((order) => (
      <tr key={order._id}>
        <td>
          <b>{order.orderNumber}</b>
          <small>
            {new Date(order.createdAt).toLocaleDateString('en-IN')}
          </small>
        </td>

        <td>
          {order.user?.name || 'Customer'}
          <small>{order.user?.email || ''}</small>
        </td>

        <td>{money(order.total)}</td>

        <td>
          <span className="status-pill">
            {order.status}
          </span>
        </td>

        <td>
          <select
            value={order.status}
            disabled={['Delivered', 'Cancelled'].includes(order.status)}
            onChange={(event) =>
              updateOrder(order._id, event.target.value)
            }
          >
            {[
              'Pending confirmation',
              'Confirmed',
              'Packed',
              'Shipped',
              'Delivered',
              'Cancelled',
            ].map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </td>
      </tr>
    ))}
  </tbody>
</table>
        </div>
      )}
    </section>
  );

  

let content =
  page === 'shop' ? shopPage :
  page === 'wishlist' ? (
    <section className="page-shell">
      <button
        className="back-link"
        onClick={() => setPage('shop')}
      >
        ← Shop
      </button>

      <div className="page-title">
        <div>
          <p className="eyebrow">SAVED FOR A GOOD DAY</p>
          <h1>
            Your wishlist<span className="brand-dot">.</span>
          </h1>
        </div>
      </div>

      {shown.length > 0 ? (
        <div className="product-grid">
          {shown.map(productCard)}
        </div>
      ) : (
        <div className="empty-state">
          <Heart />
          <h3>Keep the good things close.</h3>
          <p>Tap the heart on a product to save it here.</p>
          <button
            className="button dark"
            onClick={() => setPage('shop')}
          >
            Explore products <ArrowRight size={16} />
          </button>
        </div>
      )}
    </section>
  ) :
  page === 'detail' ? detailPage :
  page === 'cart' ? cartPage :
  page === 'auth' ? authPage :
  page === 'checkout' ? checkoutPage :
  page === 'success' ? successPage :
  page === 'orders' ? ordersPage :
  page === 'admin' ? adminPage :
  page === 'menu' ? (
    <section className="page-shell mobile-menu-panel">
      <button onClick={() => setPage('shop')}>Shop</button>
      <button onClick={() => setPage('wishlist')}>Wishlist</button>
      <button onClick={() => setPage('cart')}>Bag</button>

      {user && (
        <button
          onClick={() =>
            user.role === 'admin' ? loadAdmin() : openOrders()
          }
        >
          {user.role === 'admin' ? 'Admin dashboard' : 'My orders'}
        </button>
      )}

      <button onClick={() => user ? signOut() : requireLogin()}>
        {user ? 'Sign out' : 'Sign in'}
      </button>
    </section>
  ) : null;

useEffect(() => {
  if (page === 'orders' && user) {
    api('/orders/my')
      .then((data) => setOrders(data.orders))
      .catch((error) => notify(error.message));
  }
}, [page, user, notify]);

useEffect(() => {
  if (page === 'admin' && user?.role === 'admin') {
    loadAdmin(adminTab);
  }
}, [page]);

return (
  <div className="app-shell">
    {header}

    <main key={page} className="main-content">
      {content}
    </main>

    <footer className="footer">
      <div className="footer-top">
        <a className="brand" onClick={() => setPage('shop')}>
          <span className="brand-mark">t</span> tilda
          <span className="brand-dot">.</span>
        </a>

        <p>Little things. Better days.</p>

        <button
          className="back-top"
          onClick={() =>
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }
        >
          Back to the top ↑
        </button>
      </div>

      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Tilda Goods</span>
        <span>Thoughtfully picked for everyday living.</span>
        <span>Cash on delivery available</span>
      </div>
    </footer>

    {toast && (
      <div className="toast" role="status">
        {toast}
      </div>
    )}
  </div>
);
}
