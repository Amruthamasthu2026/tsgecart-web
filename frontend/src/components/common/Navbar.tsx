import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { notificationsApi } from '../../features/notifications/notifications.api';

export function Navbar() {
  const { isAuthenticated, user } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const { data: notif } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/products?search=${encodeURIComponent(q)}` : '/products');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur-md">
      <div className="container-app flex h-16 items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-brand font-black">
            T
          </span>
          <span className="text-lg font-extrabold tracking-tight">
            TSG <span className="text-brand-600">eCart</span>
          </span>
        </Link>

        <form onSubmit={onSearch} className="hidden flex-1 items-center md:flex">
          <div className="relative w-full max-w-xl">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for groceries, fruits, vegetables…"
              className="w-full rounded-full border border-black/10 bg-gray-50 px-5 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
            />
          </div>
        </form>

        <nav className="flex items-center gap-2">
          {isAuthenticated ? (
            <>
              <Link
                to="/notifications"
                className="relative hidden h-10 w-10 place-items-center rounded-full hover:bg-brand-50 sm:grid"
                aria-label="Notifications"
              >
                <span className="text-lg">🔔</span>
                {(notif?.unread ?? 0) > 0 && (
                  <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                )}
              </Link>
              <Link to="/account" className="btn-ghost hidden sm:inline-flex">
                {user?.name?.split(' ')[0] ?? 'Account'}
              </Link>
            </>
          ) : (
            <Link to="/login" className="btn-ghost hidden sm:inline-flex">
              Sign in
            </Link>
          )}
          <Link to="/cart" className="btn-primary relative">
            Cart
            {itemCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-xs font-bold text-brand">
                {itemCount}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}
