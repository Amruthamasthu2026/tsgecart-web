import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../features/admin/admin.api';
import { formatDate } from '../../lib/format';

export function AdminCustomers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data } = useQuery({
    queryKey: ['admin-customers', search],
    queryFn: () => adminApi.listCustomers(search ? { search } : {}),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminApi.setCustomerActive(id, isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-customers'] }),
  });

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Customers</h1>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name or email"
        className="mt-4 rounded-full border border-black/10 px-4 py-2 text-sm"
      />

      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-black/5 text-left text-ink-muted">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Orders</th>
              <th className="p-3">Joined</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.customers ?? []).map(
              (c: Record<string, unknown> & { id: string; isActive: boolean }) => (
                <tr key={c.id} className="border-b border-black/5">
                  <td className="p-3 font-semibold">{String(c.name)}</td>
                  <td className="p-3">{String(c.email)}</td>
                  <td className="p-3">{(c.phone as string) ?? '—'}</td>
                  <td className="p-3">{(c._count as { orders?: number })?.orders ?? 0}</td>
                  <td className="p-3">{formatDate(c.createdAt as string)}</td>
                  <td className="p-3">
                    <button
                      onClick={() => toggleMutation.mutate({ id: c.id, isActive: !c.isActive })}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        c.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {c.isActive ? 'Active' : 'Blocked'}
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        {(!data || data.customers.length === 0) && (
          <p className="p-6 text-center text-ink-muted">No customers found.</p>
        )}
      </div>
    </div>
  );
}
