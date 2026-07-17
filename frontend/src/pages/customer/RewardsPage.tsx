import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useAnimation } from 'framer-motion';
import { rewardsApi, type SpinResult } from '../../features/rewards/rewards.api';
import { Button } from '../../components/ui/Button';
import { formatCurrency, formatDate } from '../../lib/format';
import { extractApiError } from '../../lib/apiClient';

export function RewardsPage() {
  const queryClient = useQueryClient();
  const controls = useAnimation();
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [spinError, setSpinError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: wallet } = useQuery({ queryKey: ['wallet'], queryFn: rewardsApi.wallet });
  const { data: referral } = useQuery({ queryKey: ['referral'], queryFn: rewardsApi.referral });
  const { data: spin } = useQuery({ queryKey: ['spin'], queryFn: rewardsApi.spinConfig });

  const segments = spin?.config?.segments ?? [];
  const segAngle = segments.length ? 360 / segments.length : 0;

  const doSpin = async () => {
    if (spinning || !spin?.config) return;
    setSpinning(true);
    setSpinError(null);
    setResult(null);
    try {
      const res = await rewardsApi.spin();
      const index = segments.findIndex((s) => s.id === res.segmentId);
      const target = 360 * 5 + (360 - (index * segAngle + segAngle / 2));
      await controls.start({
        rotate: target,
        transition: { duration: 3.4, ease: [0.16, 1, 0.3, 1] },
      });
      setResult(res);
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['spin'] });
    } catch (err) {
      setSpinError(extractApiError(err));
    } finally {
      setSpinning(false);
    }
  };

  const copyCode = () => {
    if (referral?.referralCode) {
      navigator.clipboard.writeText(referral.referralCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div className="container-app py-8">
      <h1 className="text-2xl font-extrabold">Rewards</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Wallet */}
        <section className="card p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">Wallet balance</h2>
          <p className="mt-2 text-4xl font-extrabold text-brand-600">
            {formatCurrency(wallet?.balance ?? 0)}
          </p>
          <div className="mt-4 max-h-56 space-y-2 overflow-auto">
            {wallet?.transactions.length ? (
              wallet.transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{t.note ?? t.source}</p>
                    <p className="text-xs text-ink-muted">{formatDate(t.createdAt)}</p>
                  </div>
                  <span
                    className={`font-semibold ${Number(t.amount) >= 0 ? 'text-green-700' : 'text-red-600'}`}
                  >
                    {Number(t.amount) >= 0 ? '+' : ''}
                    {formatCurrency(t.amount)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-ink-muted">No transactions yet. Spin or refer to earn!</p>
            )}
          </div>
        </section>

        {/* Spin wheel */}
        <section className="card flex flex-col items-center p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">Spin & win</h2>
          {segments.length > 0 ? (
            <>
              <div className="relative mt-4 h-56 w-56">
                <div className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 text-2xl">▼</div>
                <motion.div
                  animate={controls}
                  className="h-full w-full rounded-full border-4 border-ink"
                  style={{
                    background: `conic-gradient(${segments
                      .map((_, i) => {
                        const color = i % 2 === 0 ? '#FFE60D' : '#111827';
                        return `${color} ${i * segAngle}deg ${(i + 1) * segAngle}deg`;
                      })
                      .join(', ')})`,
                  }}
                />
                <div className="absolute inset-0 grid place-items-center">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-white text-xs font-bold shadow-card">
                    SPIN
                  </div>
                </div>
              </div>
              {result && (
                <p className="mt-4 text-center text-sm font-bold text-brand-700">
                  {result.rewardAmount > 0
                    ? `🎉 You won ${formatCurrency(result.rewardAmount)}!`
                    : `${result.label}`}
                </p>
              )}
              {spinError && <p className="mt-3 text-center text-xs text-red-600">{spinError}</p>}
              <Button
                className="mt-4"
                variant="dark"
                isLoading={spinning}
                disabled={!spin?.canSpin || spinning}
                onClick={doSpin}
              >
                {spin?.canSpin ? 'Spin now' : 'Come back later'}
              </Button>
              {!spin?.canSpin && spin?.nextSpinAt && (
                <p className="mt-2 text-xs text-ink-muted">
                  Next spin: {formatDate(spin.nextSpinAt)}
                </p>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-ink-muted">The spin wheel is unavailable right now.</p>
          )}
        </section>

        {/* Referral */}
        <section className="card p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">Refer & earn</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Share your code. You get {formatCurrency(referral?.referrerReward ?? 50)}, your friend
            gets {formatCurrency(referral?.refereeReward ?? 25)} on their first order.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <code className="flex-1 rounded-xl border border-dashed border-black/20 bg-brand-50 px-4 py-2 text-center text-lg font-extrabold tracking-widest">
              {referral?.referralCode ?? '—'}
            </code>
            <Button variant="dark" onClick={copyCode}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <p className="mt-4 text-sm font-semibold">
            Total earned: {formatCurrency(referral?.totalEarned ?? 0)}
          </p>
          <div className="mt-2 space-y-1">
            {referral?.referrals.slice(0, 5).map((r, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span>{r.name}</span>
                <span
                  className={r.status === 'COMPLETED' ? 'text-green-700' : 'text-ink-muted'}
                >
                  {r.status.toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
