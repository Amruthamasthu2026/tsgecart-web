import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../features/admin/admin.api';
import { firebaseAdminApi, useFirestoreAdmin } from '../../services/firebaseAdmin';
import { Button } from '../../components/ui/Button';
import { formatCurrency } from '../../lib/format';
import { extractApiError } from '../../lib/apiClient';
import { extractFirebaseError } from '../../features/firebaseAuth/firebaseAuth.schemas';

const api = useFirestoreAdmin ? firebaseAdminApi : adminApi;
const extractError = useFirestoreAdmin ? extractFirebaseError : extractApiError;

interface Row {
  cashbackAmount: string;
  probability: string;
  minOrder: string;
  expiryDays: string;
}
const EMPTY: Row = { cashbackAmount: '', probability: '', minOrder: '', expiryDays: '3' };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="mt-1 text-xl font-extrabold text-ink">{value}</p>
    </div>
  );
}

export function AdminRewards() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Row>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ['reward-configs'], queryFn: api.listRewardConfigs });
  const { data: analytics } = useQuery({ queryKey: ['reward-analytics'], queryFn: api.rewardAnalytics });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['reward-configs'] });
    queryClient.invalidateQueries({ queryKey: ['reward-analytics'] });
  };

  const create = useMutation({
    mutationFn: () =>
      api.createRewardConfig({
        cashbackAmount: Number(form.cashbackAmount),
        probability: Number(form.probability),
        minOrder: Number(form.minOrder) || 0,
        expiryDays: Number(form.expiryDays) || 3,
        isActive: true,
        sortOrder: data?.configs.length ?? 0,
      }),
    onSuccess: () => { setForm(EMPTY); setError(null); invalidate(); },
    onError: (e) => setError(extractError(e)),
  });
  const update = useMutation({
    mutationFn: (vars: { id: string; payload: Record<string, unknown> }) => api.updateRewardConfig(vars.id, vars.payload),
    onSuccess: invalidate,
    onError: (e) => setError(extractError(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteRewardConfig(id),
    onSuccess: invalidate,
  });
  const seed = useMutation({ mutationFn: api.seedRewardDefaults, onSuccess: invalidate });

  const total = data?.activeProbabilityTotal ?? 0;
  const spinnable = data?.isSpinnable ?? false;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-ink">Rewards</h1>
        {(data?.configs.length ?? 0) === 0 && (
          <Button variant="dark" isLoading={seed.isPending} onClick={() => seed.mutate()}>
            Load default rewards
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Configure the spin-wheel reward tiers. Active tiers must total exactly 100%.
      </p>

      {/* Analytics */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total spins" value={String(analytics?.totalSpins ?? 0)} />
        <Stat label="Today's spins" value={String(analytics?.todaySpins ?? 0)} />
        <Stat label="Coupons generated" value={String(analytics?.couponsGenerated ?? 0)} />
        <Stat label="Coupons redeemed" value={String(analytics?.couponsRedeemed ?? 0)} />
        <Stat label="Cashback issued" value={formatCurrency(analytics?.totalCashbackIssued ?? 0)} />
        <Stat label="Most won" value={analytics?.mostWonReward ? formatCurrency(analytics.mostWonReward) : '—'} />
      </div>

      {/* Probability status */}
      <div className={`mt-6 rounded-2xl p-4 text-sm font-semibold ${spinnable ? 'bg-badge-organic/10 text-badge-organic' : 'bg-amber-100 text-amber-700'}`}>
        Active probability total: {total}%{' '}
        {spinnable ? '✓ wheel is live' : '— must equal 100% for customers to spin'}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {/* Add tier */}
      <div className="mt-4 grid gap-3 rounded-2xl bg-white p-4 shadow-card sm:grid-cols-5">
        <label className="text-sm">Cashback ₹
          <input type="number" value={form.cashbackAmount} onChange={(e) => setForm((f) => ({ ...f, cashbackAmount: e.target.value }))} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" />
        </label>
        <label className="text-sm">Probability %
          <input type="number" value={form.probability} onChange={(e) => setForm((f) => ({ ...f, probability: e.target.value }))} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" />
        </label>
        <label className="text-sm">Min order ₹
          <input type="number" value={form.minOrder} onChange={(e) => setForm((f) => ({ ...f, minOrder: e.target.value }))} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" />
        </label>
        <label className="text-sm">Expiry days
          <input type="number" value={form.expiryDays} onChange={(e) => setForm((f) => ({ ...f, expiryDays: e.target.value }))} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" />
        </label>
        <div className="flex items-end">
          <Button fullWidth isLoading={create.isPending} disabled={!form.cashbackAmount || !form.probability} onClick={() => create.mutate()}>
            Add tier
          </Button>
        </div>
      </div>

      {/* Tiers table */}
      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-black/5 text-left text-ink-muted">
            <tr>
              <th className="p-3">Cashback</th>
              <th className="p-3">Probability</th>
              <th className="p-3">Min order</th>
              <th className="p-3">Expiry (days)</th>
              <th className="p-3">Active</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(data?.configs ?? []).map((c) => (
              <tr key={c.id} className="border-b border-black/5">
                <td className="p-3 font-semibold text-ink">{formatCurrency(c.cashbackAmount)}</td>
                <td className="p-3">{c.probability}%</td>
                <td className="p-3">{formatCurrency(c.minOrder)}</td>
                <td className="p-3">{c.expiryDays}</td>
                <td className="p-3">
                  <button
                    onClick={() => update.mutate({ id: c.id, payload: { isActive: !c.isActive } })}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${c.isActive ? 'bg-badge-organic/10 text-badge-organic' : 'bg-slate-100 text-ink-muted'}`}
                  >
                    {c.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => remove.mutate(c.id)} className="text-red-600 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(data?.configs.length ?? 0) === 0 && (
          <p className="p-6 text-center text-ink-muted">No reward tiers yet. Click “Load default rewards” to start.</p>
        )}
      </div>
    </div>
  );
}
