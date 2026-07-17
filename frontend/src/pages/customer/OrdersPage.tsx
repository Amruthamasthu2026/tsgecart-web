import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '../../features/orders/orders.api';
import { formatCurrency, formatDate } from '../../lib/format';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Seo } from '../../components/Seo';

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: 'bg-blue-50 text-blue-700',
  PREPARING: 'bg-amber-50 text-amber-700',
  PACKED: 'bg-purple-50 text-purple-700',
  OUT_FOR_DELIVERY: 'bg-indigo-50 text-indigo-700',
  DELIVERED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-red-50 text-red-700',
};

export function OrdersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.list(1),
  });

  return (
    <div className="container-app py-8">
      <Seo title="Your Orders" noindex />
      <PageHeader title="Your orders" subtitle="Track and manage your recent orders" />

      {isLoading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-24 w-full" />
          ))}
        </div>
      ) : !data || data.orders.length === 0 ? (
        <EmptyState
          emoji="📦"
          title="No orders yet"
          message="When you place an order, it'll show up here with live tracking."
          action={<Link to="/products" className="btn-primary">Start shopping</Link>}
        />
      ) : (
        <div className="mt-6 space-y-3">
          {data.orders.map((order) => (
            <Link
              key={order.id}
              to={`/orders/${order.id}`}
              className="card card-hover flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-100 text-xl">📦</span>
                <div>
                  <p className="text-sm font-bold text-ink">{order.orderNumber}</p>
                  <p className="text-xs text-ink-muted">
                    {formatDate(order.placedAt)} · {order.items.length} item{order.items.length > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLES[order.status]}`}>
                  {order.status.replace(/_/g, ' ')}
                </span>
                <span className="text-base font-extrabold text-ink">{formatCurrency(order.total)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
