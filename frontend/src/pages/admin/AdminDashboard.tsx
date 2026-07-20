import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../features/admin/admin.api';
import { firebaseAdminApi, useFirestoreAdmin } from '../../services/firebaseAdmin';
import { formatCurrency } from '../../lib/format';

const api = useFirestoreAdmin ? firebaseAdminApi : adminApi;

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 shadow-card ${accent ? 'bg-brand text-ink' : 'bg-white'}`}>
      <p className="text-sm font-medium opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
    </div>
  );
}

export function AdminDashboard() {
  const { data: stats } = useQuery({ queryKey: ['admin-dashboard'], queryFn: api.dashboard });
  const { data: sales = [] } = useQuery({
    queryKey: ['admin-sales'],
    queryFn: () => api.salesTrend(14),
  });
  const { data: top = [] } = useQuery({
    queryKey: ['admin-top'],
    queryFn: api.topProducts,
  });
  const { data: lowStock = [] } = useQuery({
    queryKey: ['admin-lowstock'],
    queryFn: api.lowStock,
  });

  const maxRevenue = Math.max(1, ...sales.map((s) => s.revenue));

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Dashboard</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue (paid)" value={formatCurrency(stats?.totalRevenue ?? 0)} accent />
        <StatCard label="Total orders" value={String(stats?.totalOrders ?? 0)} />
        <StatCard label="Customers" value={String(stats?.totalCustomers ?? 0)} />
        <StatCard label="Active products" value={String(stats?.activeProducts ?? 0)} />
        <StatCard label="Pending orders" value={String(stats?.pendingOrders ?? 0)} />
        <StatCard label="Low stock items" value={String(stats?.lowStockItems ?? 0)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Sales trend */}
        <section className="rounded-2xl bg-white p-5 shadow-card">
          <h2 className="text-lg font-bold">Revenue (last 14 days)</h2>
          <div className="mt-4 flex h-40 items-end gap-1">
            {sales.map((s) => (
              <div key={s.date} className="group flex flex-1 flex-col items-center justify-end">
                <div
                  className="w-full rounded-t bg-brand-500 transition group-hover:bg-brand-600"
                  style={{ height: `${(s.revenue / maxRevenue) * 100}%` }}
                  title={`${s.date}: ${formatCurrency(s.revenue)} (${s.orders} orders)`}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">Hover a bar for details.</p>
        </section>

        {/* Order status */}
        <section className="rounded-2xl bg-white p-5 shadow-card">
          <h2 className="text-lg font-bold">Orders by status</h2>
          <div className="mt-4 space-y-2">
            {(stats?.ordersByStatus ?? []).map((s) => (
              <div key={s.status} className="flex items-center justify-between text-sm">
                <span className="font-medium">{s.status.replace(/_/g, ' ')}</span>
                <span className="rounded-full bg-gray-100 px-3 py-0.5 font-semibold">{s.count}</span>
              </div>
            ))}
            {(!stats?.ordersByStatus || stats.ordersByStatus.length === 0) && (
              <p className="text-sm text-ink-muted">No orders yet.</p>
            )}
          </div>
        </section>

        {/* Top products */}
        <section className="rounded-2xl bg-white p-5 shadow-card">
          <h2 className="text-lg font-bold">Top products</h2>
          <div className="mt-4 space-y-2">
            {top.map((p) => (
              <div key={p.productName} className="flex items-center justify-between text-sm">
                <span className="truncate font-medium">{p.productName}</span>
                <span className="text-ink-muted">
                  {p.unitsSold} sold · {formatCurrency(p.revenue)}
                </span>
              </div>
            ))}
            {top.length === 0 && <p className="text-sm text-ink-muted">No sales yet.</p>}
          </div>
        </section>

        {/* Low stock */}
        <section className="rounded-2xl bg-white p-5 shadow-card">
          <h2 className="text-lg font-bold">Low stock alerts</h2>
          <div className="mt-4 space-y-2">
            {lowStock.map((i) => (
              <div key={i.sku} className="flex items-center justify-between text-sm">
                <span className="truncate font-medium">
                  {i.productName} <span className="text-ink-muted">({i.unitLabel})</span>
                </span>
                <span className="font-semibold text-red-600">{i.stock} left</span>
              </div>
            ))}
            {lowStock.length === 0 && <p className="text-sm text-ink-muted">All well stocked. 🎉</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
