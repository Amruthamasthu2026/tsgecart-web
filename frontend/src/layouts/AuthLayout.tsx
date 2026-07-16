import { Link, Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';

export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-brand lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-brand font-black">
            T
          </span>
          <span className="text-xl font-extrabold text-ink">TSG eCart</span>
        </Link>
        <div>
          <h1 className="text-4xl font-extrabold leading-tight text-ink">
            Fresh Groceries
            <br />
            Delivered Fast
          </h1>
          <p className="mt-4 max-w-sm text-ink/70">
            Sign in to track orders, save addresses, and earn rewards across Hyderabad.
          </p>
        </div>
        <p className="text-sm text-ink/60">© {new Date().getFullYear()} TSG eCart</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md"
        >
          <Link to="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-brand font-black">
              T
            </span>
            <span className="text-lg font-extrabold">TSG eCart</span>
          </Link>
          <Outlet />
        </motion.div>
      </div>
    </div>
  );
}
