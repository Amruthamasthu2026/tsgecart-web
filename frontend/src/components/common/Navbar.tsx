import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export function Navbar() {
  const { isAuthenticated, user } = useAuth();

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

        <div className="hidden flex-1 items-center md:flex">
          <div className="relative w-full max-w-xl">
            <input
              type="search"
              placeholder="Search for groceries, fruits, vegetables…"
              className="w-full rounded-full border border-black/10 bg-gray-50 px-5 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
            />
          </div>
        </div>

        <nav className="flex items-center gap-2">
          {isAuthenticated ? (
            <Link to="/account" className="btn-ghost hidden sm:inline-flex">
              {user?.name?.split(' ')[0] ?? 'Account'}
            </Link>
          ) : (
            <Link to="/login" className="btn-ghost hidden sm:inline-flex">
              Sign in
            </Link>
          )}
          <Link to="/cart" className="btn-primary">
            Cart
          </Link>
        </nav>
      </div>
    </header>
  );
}
