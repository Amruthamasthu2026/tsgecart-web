import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useAnimation } from 'framer-motion';
import { rewardsApi } from '../../features/rewards/rewards.api';
import { spinApi, type SpinReward } from '../../features/rewards/spin.api';
import { useAuth } from '../../contexts/AuthContext';
import { useFirebaseAuth } from '../../contexts/FirebaseAuthContext';
import { firebaseRewardsApi, useFirestoreRewards } from '../../services/firebaseRewards';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Seo } from '../../components/Seo';
import { RewardPopup } from '../../components/rewards/RewardPopup';
import { formatCurrency, formatDate } from '../../lib/format';
import { extractApiError } from '../../lib/apiClient';
import { extractFirebaseError } from '../../features/firebaseAuth/firebaseAuth.schemas';

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-badge-organic/10 text-badge-organic',
  REDEEMED: 'bg-slate-100 text-ink-muted',
  EXPIRED: 'bg-red-50 text-red-600',
};

export function RewardsPage() {
  const queryClient = useQueryClient();
  const controls = useAnimation();
  const [spinning, setSpinning] = useState(false);
  const [popup, setPopup] = useState<SpinReward | null>(null);
  const [spinError, setSpinError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);
  const myRewardsRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated } = useAuth();
  const { user: firebaseUser, isAuthenticated: isFirebaseAuthenticated } = useFirebaseAuth();
  const signedIn = useFirestoreRewards ? isFirebaseAuthenticated : isAuthenticated;

  // Wallet/referral are a separate module (System A / Referral) not part of
  // this migration phase — always Express, gated on the JWT session
  // specifically regardless of VITE_USE_FIRESTORE_REWARDS.
  const { data: wallet } = useQuery({ queryKey: ['wallet'], queryFn: rewardsApi.wallet, enabled: isAuthenticated });
  const { data: referral } = useQuery({ queryKey: ['referral'], queryFn: rewardsApi.referral, enabled: isAuthenticated });

  const { data: expressWheel } = useQuery({
    queryKey: ['spin-wheel'],
    queryFn: spinApi.wheel,
    enabled: !useFirestoreRewards && isAuthenticated,
  });
  const { data: expressRewards = [] } = useQuery({
    queryKey: ['my-rewards'],
    queryFn: spinApi.myRewards,
    enabled: !useFirestoreRewards && isAuthenticated,
  });
  const { data: firestoreWheel } = useQuery({
    queryKey: ['firebase-reward-wheel'],
    queryFn: firebaseRewardsApi.wheel,
    enabled: useFirestoreRewards && isFirebaseAuthenticated,
  });
  const { data: firestoreRewards = [] } = useQuery({
    queryKey: ['firebase-my-rewards', firebaseUser?.uid],
    queryFn: () => firebaseRewardsApi.myRewards(firebaseUser!.uid),
    enabled: useFirestoreRewards && isFirebaseAuthenticated && !!firebaseUser,
  });

  const wheel = useFirestoreRewards ? firestoreWheel : expressWheel;
  const myRewards = useFirestoreRewards ? firestoreRewards : expressRewards;

  const tiers = wheel?.tiers ?? [];
  const segAngle = tiers.length ? 360 / tiers.length : 0;

  const doSpin = async () => {
    if (spinning || !wheel?.canSpin) return;
    setSpinning(true);
    setSpinError(null);
    try {
      const reward = useFirestoreRewards ? await firebaseRewardsApi.spin() : await spinApi.spin();
      const index = Math.max(0, tiers.findIndex((t) => t.cashbackAmount === reward.cashbackAmount));
      const target = 360 * 5 + (360 - (index * segAngle + segAngle / 2));
      await controls.start({ rotate: target, transition: { duration: 3.4, ease: [0.16, 1, 0.3, 1] } });
      setPopup(reward);
      queryClient.invalidateQueries({ queryKey: useFirestoreRewards ? ['firebase-my-rewards'] : ['my-rewards'] });
      queryClient.invalidateQueries({ queryKey: useFirestoreRewards ? ['firebase-reward-wheel'] : ['spin-wheel'] });
    } catch (err) {
      setSpinError(useFirestoreRewards ? extractFirebaseError(err) : extractApiError(err));
    } finally {
      setSpinning(false);
    }
  };

  const copyReferral = () => {
    if (referral?.referralCode) {
      navigator.clipboard.writeText(referral.referralCode).then(() => {
        setReferralCopied(true);
        setTimeout(() => setReferralCopied(false), 2000);
      });
    }
  };

  const copyCoupon = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  if (!signedIn) {
    return (
      <div className="container-app py-8">
        <EmptyState
          emoji="🎁"
          title="Sign in to view rewards"
          message="You need to be signed in to spin the wheel and see your reward coupons."
          action={
            <Link to={useFirestoreRewards ? '/firebase-auth/login' : '/login'} className="btn-primary">
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-app py-8">
      <Seo title="Rewards & Referrals" noindex />
      <PageHeader title="Rewards" subtitle="Spin to win cashback coupons, refer friends and track your wallet" />
      {useFirestoreRewards && (
        <p className="mt-2 rounded-2xl bg-brand-50 px-4 py-2 text-xs font-medium text-ink">
          Spin wheel loaded from Firestore (VITE_USE_FIRESTORE_REWARDS). Wallet &amp; referrals remain on the existing account.
        </p>
      )}

      {popup && (
        <RewardPopup
          reward={popup}
          onClose={() => setPopup(null)}
          onGoToRewards={() => {
            setPopup(null);
            myRewardsRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
        />
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Spin wheel */}
        <section className="card flex flex-col items-center p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">Spin &amp; win</h2>
          {tiers.length > 0 ? (
            <>
              <div className="relative mt-4 h-56 w-56">
                <div className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 text-2xl">▼</div>
                <motion.div
                  animate={controls}
                  className="h-full w-full rounded-full border-4 border-ink"
                  style={{
                    background: `conic-gradient(${tiers
                      .map((_, i) => `${i % 2 === 0 ? '#FFE60D' : '#111827'} ${i * segAngle}deg ${(i + 1) * segAngle}deg`)
                      .join(', ')})`,
                  }}
                />
                <div className="absolute inset-0 grid place-items-center">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-white text-xs font-bold shadow-card">SPIN</div>
                </div>
              </div>
              {spinError && <p className="mt-3 text-center text-xs text-red-600">{spinError}</p>}
              <Button className="mt-4" variant="dark" isLoading={spinning} disabled={!wheel?.canSpin || spinning} onClick={doSpin}>
                {wheel?.canSpin ? 'Spin now' : 'Come back later'}
              </Button>
              {!wheel?.canSpin && wheel?.nextSpinAt && (
                <p className="mt-2 text-xs text-ink-muted">Next spin: {formatDate(wheel.nextSpinAt)}</p>
              )}
              <p className="mt-1 text-xs text-ink-muted">One spin every 24 hours</p>
            </>
          ) : (
            <p className="mt-4 text-sm text-ink-muted">The spin wheel is unavailable right now.</p>
          )}
        </section>

        {/* Wallet */}
        <section className="card p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">Wallet balance</h2>
          <p className="mt-2 text-4xl font-extrabold text-brand-600">{formatCurrency(wallet?.balance ?? 0)}</p>
          <div className="mt-4 max-h-56 space-y-2 overflow-auto">
            {wallet?.transactions.length ? (
              wallet.transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{t.note ?? t.source}</p>
                    <p className="text-xs text-ink-muted">{formatDate(t.createdAt)}</p>
                  </div>
                  <span className={`font-semibold ${Number(t.amount) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {Number(t.amount) >= 0 ? '+' : ''}{formatCurrency(t.amount)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-ink-muted">No transactions yet. Spin or refer to earn!</p>
            )}
          </div>
        </section>

        {/* Referral */}
        <section className="card p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">Refer &amp; earn</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Share your code. You get {formatCurrency(referral?.referrerReward ?? 50)}, your friend gets{' '}
            {formatCurrency(referral?.refereeReward ?? 25)} on their first order.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <code className="flex-1 rounded-xl border border-dashed border-black/20 bg-brand-50 px-4 py-2 text-center text-lg font-extrabold tracking-widest">
              {referral?.referralCode ?? '—'}
            </code>
            <Button variant="dark" onClick={copyReferral}>{referralCopied ? 'Copied!' : 'Copy'}</Button>
          </div>
          <p className="mt-4 text-sm font-semibold">Total earned: {formatCurrency(referral?.totalEarned ?? 0)}</p>
        </section>
      </div>

      {/* My Rewards */}
      <section ref={myRewardsRef} className="mt-8">
        <h2 className="mb-4 text-lg font-bold text-ink">My reward coupons</h2>
        {myRewards.length === 0 ? (
          <p className="text-sm text-ink-muted">No reward coupons yet. Spin the wheel to win cashback!</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myRewards.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-extrabold text-ink">{formatCurrency(r.cashbackAmount)}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 rounded-lg border border-dashed border-black/20 bg-brand-50 px-3 py-1.5 text-center text-sm font-bold tracking-wider">
                    {r.code}
                  </code>
                  <button
                    onClick={() => copyCoupon(r.code)}
                    disabled={r.status !== 'ACTIVE'}
                    className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-brand disabled:opacity-40"
                  >
                    {copiedCode === r.code ? '✓' : 'Copy'}
                  </button>
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  Min order {formatCurrency(r.minOrder)} · Expires {formatDate(r.expiresAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
