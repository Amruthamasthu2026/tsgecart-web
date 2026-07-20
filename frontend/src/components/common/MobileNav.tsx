import { NavLink } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { useNavigationAuth } from '../../hooks/useNavigationAuth';
import { HomeIcon, GridIcon, CartIcon, HeartIcon, UserIcon } from '../ui/icons';

export function MobileNav() {
  const { itemCount } = useCart();
  const { isNavigationAuthenticated, accountPath, loginPath } = useNavigationAuth();

  const items = [
    { to: '/', label: 'Home', Icon: HomeIcon, end: true },
    { to: '/products', label: 'Shop', Icon: GridIcon, end: false },
    { to: '/cart', label: 'Cart', Icon: CartIcon, end: false, badge: itemCount },
    { to: '/wishlist', label: 'Wishlist', Icon: HeartIcon, end: false },
    { to: isNavigationAuthenticated ? accountPath : loginPath, label: 'You', Icon: UserIcon, end: false },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-black/5 bg-white/95 backdrop-blur-md md:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1.5">
        {items.map(({ to, label, Icon, end, badge }) => (
          <NavLink
            key={label}
            to={to}
            end={end}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[11px] font-medium transition-colors ${
                isActive ? 'text-ink' : 'text-ink-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`grid place-items-center ${isActive ? 'text-ink' : ''}`}>
                  <Icon width={22} height={22} />
                </span>
                {badge ? (
                  <span className="absolute right-2 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-ink">
                    {badge}
                  </span>
                ) : null}
                {label}
                {isActive && <span className="absolute -top-px h-0.5 w-6 rounded-full bg-brand" />}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
