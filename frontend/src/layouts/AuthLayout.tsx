import { Link, Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LeafIcon, TruckIcon, ShieldIcon } from '../components/ui/icons';

const PERKS = [
  { Icon: TruckIcon, text: 'Delivery in 10–30 minutes' },
  { Icon: LeafIcon, text: 'Farm-fresh, handpicked quality' },
  { Icon: ShieldIcon, text: 'Easy returns, secure payments' },
];

export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-brand lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-72 w-72 rounded-full bg-black/5 blur-2xl" />

        <Link to="/" className="relative flex items-center gap-2.5">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-2xl font-black text-brand">
            T
          </span>
          <span className="text-2xl font-extrabold text-ink">
            TSG <span className="font-bold">ecart</span>
          </span>
        </Link>

        <div className="relative">
          <h1 className="text-4xl font-black leading-[1.1] text-ink xl:text-5xl">
            Fresh Groceries
            <br />
            Delivered Fast
          </h1>
          <p className="mt-4 max-w-sm text-ink/70">
            Sign in to track orders, save addresses, earn rewards and check out in seconds — across
            Hyderabad.
          </p>
          <ul className="mt-8 space-y-3">
            {PERKS.map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm font-medium text-ink/80">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink/10 text-ink">
                  <Icon width={20} height={20} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-ink/60">© {new Date().getFullYear()} TSG eCart</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand text-xl font-black text-ink">
              T
            </span>
            <span className="text-xl font-extrabold text-ink">
              TSG <span className="font-bold">ecart</span>
            </span>
          </Link>
          <Outlet />
        </motion.div>
      </div>
    </div>
  );
}
