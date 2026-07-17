import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '../../features/orders/orders.api';
import { formatCurrency, formatDate } from '../../lib/format';

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
      <h1 className="text-2xl font-extrabold">Your orders</h1>

      {isLoading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-24 w-full" />
          ))}
        </div>
      ) : !data || data.orders.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-5xl">📦</p>
          <p className="mt-4 text-ink-muted">You haven't placed any orders yet.</p>
          <Link to="/products" className="btn-primary mt-6 inline-flex">
            Start shopping
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {data.orders.map((order) => (
            <Link
              key={order.id}
              to={`/orders/${order.id}`}
              className="card flex flex-wrap items-center justify-between gap-3 p-4 transition hover:-translate-y-0.5"
            >
              <div>
                <p className="text-sm font-bold">{order.orderNumber}</p>
                <p className="text-xs text-ink-muted">
                  {formatDate(order.placedAt)} · {order.items.length} item
                  {order.items.length > 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[order.status]}`}
                >
                  {order.status.replace(/_/g, ' ')}
                </span>
                <span className="text-sm font-bold">{formatCurrency(order.total)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
