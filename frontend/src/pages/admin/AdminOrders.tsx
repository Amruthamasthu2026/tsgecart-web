import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../features/admin/admin.api';
import { firebaseAdminApi, useFirestoreAdmin } from '../../services/firebaseAdmin';
import { formatCurrency, formatDate } from '../../lib/format';

const api = useFirestoreAdmin ? firebaseAdminApi : adminApi;
const STATUSES = ['CONFIRMED', 'PREPARING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];

export function AdminOrders() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data } = useQuery({
    queryKey: ['admin-orders', statusFilter, search],
    queryFn: () =>
      api.listOrders({
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(search ? { search } : {}),
      }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.updateOrderStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-orders'] }),
  });

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Orders</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order # or email"
          className="rounded-full border border-black/10 px-4 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-full border border-black/10 px-4 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-black/5 text-left text-ink-muted">
            <tr>
              <th className="p-3">Order</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Total</th>
              <th className="p-3">Payment</th>
              <th className="p-3">Placed</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.orders ?? []).map((o: Record<string, unknown> & { id: string }) => (
              <tr key={o.id} className="border-b border-black/5">
                <td className="p-3 font-semibold">{String(o.orderNumber)}</td>
                <td className="p-3">{(o.user as { email?: string })?.email ?? '—'}</td>
                <td className="p-3">{formatCurrency(o.total as string)}</td>
                <td className="p-3">
                  {(o.payment as { method?: string })?.method} ·{' '}
                  {(o.payment as { status?: string })?.status}
                </td>
                <td className="p-3">{formatDate(o.placedAt as string)}</td>
                <td className="p-3">
                  <select
                    value={o.status as string}
                    onChange={(e) => statusMutation.mutate({ id: o.id, status: e.target.value })}
                    className="rounded-lg border border-black/10 px-2 py-1 text-xs"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!data || data.orders.length === 0) && (
          <p className="p-6 text-center text-ink-muted">No orders found.</p>
        )}
      </div>
    </div>
  );
}
