import { useState, type FormEvent } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import {
  SearchIcon,
  HeartIcon,
  CartIcon,
  UserIcon,
  GiftIcon,
  SparkleIcon,
} from '../ui/icons';
import { Logo } from './Logo';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/products', label: 'Products', end: false },
  { to: '/about', label: 'About', end: false },
  { to: '/contact', label: 'Contact', end: false },
];

export function Navbar() {
  const { isAuthenticated, user } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/products?search=${encodeURIComponent(q)}` : '/products');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur-md">
      <div className="container-app flex h-[76px] items-center gap-4">
        <Logo />

        {/* Primary nav */}
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-pill ${isActive ? 'nav-pill-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Search */}
        <form onSubmit={onSearch} className="hidden flex-1 justify-center md:flex">
          <div className="relative w-full max-w-md">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full rounded-full border border-transparent bg-slate-100 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </div>
        </form>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link to="/rewards" className="btn-earn hidden sm:inline-flex">
            <GiftIcon />
            Earn with Fun
            <SparkleIcon className="animate-sparkle text-orange-500" />
          </Link>

          <Link to="/wishlist" className="icon-btn" aria-label="Wishlist">
            <HeartIcon />
          </Link>

          <Link to="/cart" className="icon-btn relative" aria-label="Cart">
            <CartIcon />
            {itemCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] font-bold text-brand">
                {itemCount}
              </span>
            )}
          </Link>

          <Link
            to={isAuthenticated ? '/account' : '/login'}
            className="icon-btn"
            aria-label={isAuthenticated ? user?.name ?? 'Account' : 'Sign in'}
          >
            <UserIcon />
          </Link>
        </div>
      </div>

      {/* Mobile search */}
      <div className="container-app pb-3 md:hidden">
        <form onSubmit={onSearch}>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full rounded-full bg-slate-100 py-2.5 pl-11 pr-4 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </div>
        </form>
      </div>
    </header>
  );
}
