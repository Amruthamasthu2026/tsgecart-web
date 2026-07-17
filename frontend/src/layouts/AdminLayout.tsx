import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/coupons', label: 'Coupons' },
  { to: '/admin/customers', label: 'Customers' },
  { to: '/admin/delivery', label: 'Delivery' },
  { to: '/admin/reviews', label: 'Reviews' },
  { to: '/admin/banners', label: 'Banners' },
];

export function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 lg:grid lg:grid-cols-[240px_1fr]">
      {/* Sidebar */}
      <aside className="flex flex-col border-r border-black/5 bg-ink text-white lg:min-h-screen">
        <div className="flex items-center gap-2 p-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-ink font-black">
            T
          </span>
          <span className="font-extrabold">TSG Admin</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-brand text-ink' : 'text-white/70 hover:bg-white/10'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4 text-xs text-white/60">
          <p className="truncate">{user?.email}</p>
          <div className="mt-2 flex gap-2">
            <Link to="/" className="hover:text-brand">
              Storefront
            </Link>
            <button onClick={() => logout()} className="hover:text-brand">
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
