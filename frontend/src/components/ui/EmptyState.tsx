import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  emoji?: string;
  title: string;
  message?: string;
  action?: ReactNode;
}

/** Branded empty state — used for empty cart, wishlist, orders, etc. */
export function EmptyState({ emoji = '🛒', title, message, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto grid min-h-[40vh] max-w-md place-items-center text-center"
    >
      <div>
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-brand-100 text-4xl">
          {emoji}
        </div>
        <h2 className="mt-5 text-xl font-bold text-ink">{title}</h2>
        {message && <p className="mt-2 text-sm text-ink-muted">{message}</p>}
        {action && <div className="mt-6">{action}</div>}
      </div>
    </motion.div>
  );
}
