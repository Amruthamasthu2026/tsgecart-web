import { useState } from 'react';
import { motion } from 'framer-motion';
import type { SpinReward } from '../../features/rewards/spin.api';
import { Button } from '../ui/Button';
import { formatCurrency, formatDate } from '../../lib/format';

interface RewardPopupProps {
  reward: SpinReward;
  onClose: () => void;
  onGoToRewards: () => void;
}

export function RewardPopup({ reward, onClose, onGoToRewards }: RewardPopupProps) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(reward.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="w-full max-w-sm overflow-hidden rounded-3xl bg-white text-center shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-brand p-6">
          <p className="text-5xl">🎉</p>
          <h2 className="mt-2 text-2xl font-black text-ink">You won {formatCurrency(reward.cashbackAmount)}!</h2>
          <p className="text-sm text-ink/70">Cashback reward coupon</p>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Your coupon code</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 rounded-xl border border-dashed border-black/20 bg-brand-50 px-4 py-2 text-center text-lg font-extrabold tracking-widest">
                {reward.code}
              </code>
              <Button variant="dark" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-ink-muted">Min order</p>
              <p className="font-bold text-ink">{formatCurrency(reward.minOrder)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-ink-muted">Expires</p>
              <p className="font-bold text-ink">{formatDate(reward.expiresAt)}</p>
            </div>
          </div>

          <p className="text-xs text-ink-muted">
            Single-use, tied to your account, and cannot be shared. Apply it at checkout before it expires.
          </p>

          <div className="flex gap-2">
            <Button fullWidth variant="ghost" onClick={onClose}>Close</Button>
            <Button fullWidth onClick={onGoToRewards}>Go to Rewards</Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
