import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../features/admin/admin.api';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { formatCurrency } from '../../lib/format';
import { extractApiError } from '../../lib/apiClient';

export function AdminCoupons() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ code: '', type: 'FLAT', value: '', minOrder: '', perUserLimit: '1' });
  const [error, setError] = useState<string | null>(null);

  const { data: coupons = [] } = useQuery({ queryKey: ['admin-coupons'], queryFn: adminApi.listCoupons });

  const createMutation = useMutation({
    mutationFn: () =>
      adminApi.createCoupon({
        code: form.code,
        type: form.type,
        value: Number(form.value),
        minOrder: Number(form.minOrder) || 0,
        perUserLimit: Number(form.perUserLimit) || 1,
      }),
    onSuccess: () => {
      setForm({ code: '', type: 'FLAT', value: '', minOrder: '', perUserLimit: '1' });
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
    },
    onError: (err) => setError(extractApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteCoupon(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-coupons'] }),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Coupons</h1>

      <div className="mt-4 grid gap-3 rounded-2xl bg-white p-4 shadow-card sm:grid-cols-2 lg:grid-cols-5">
        <TextField label="Code" value={form.code} onChange={set('code')} />
        <div>
          <label className="mb-1.5 block text-sm font-medium">Type</label>
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            className="w-full rounded-xl border border-black/10 px-4 py-2.5 text-sm"
          >
            <option value="FLAT">Flat ₹</option>
            <option value="PERCENTAGE">Percentage %</option>
          </select>
        </div>
        <TextField label="Value" type="number" value={form.value} onChange={set('value')} />
        <TextField label="Min order" type="number" value={form.minOrder} onChange={set('minOrder')} />
        <div className="flex items-end">
          <Button
            fullWidth
            isLoading={createMutation.isPending}
            disabled={!form.code || !form.value}
            onClick={() => createMutation.mutate()}
          >
            Create
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-card">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="border-b border-black/5 text-left text-ink-muted">
            <tr>
              <th className="p-3">Code</th>
              <th className="p-3">Discount</th>
              <th className="p-3">Min order</th>
              <th className="p-3">Used</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c: Record<string, unknown> & { id: string }) => (
              <tr key={c.id} className="border-b border-black/5">
                <td className="p-3 font-bold">{String(c.code)}</td>
                <td className="p-3">
                  {c.type === 'FLAT'
                    ? formatCurrency(c.value as string)
                    : `${Number(c.value)}%`}
                </td>
                <td className="p-3">{formatCurrency(c.minOrder as string)}</td>
                <td className="p-3">{String(c.usedCount)}</td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => deleteMutation.mutate(c.id)}
                    className="text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {coupons.length === 0 && <p className="p-6 text-center text-ink-muted">No coupons yet.</p>}
      </div>
    </div>
  );
}
