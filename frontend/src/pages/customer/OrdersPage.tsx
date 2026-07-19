import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '../../features/orders/orders.api';
import { useAuth } from '../../contexts/AuthContext';
import { useFirebaseAuth } from '../../contexts/FirebaseAuthContext';
import { firebaseOrdersApi, useFirestoreOrders } from '../../services/firebaseOrders';
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
  const { isAuthenticated } = useAuth();
  const { user: firebaseUser, isAuthenticated: isFirebaseAuthenticated } = useFirebaseAuth();
  const signedIn = useFirestoreOrders ? isFirebaseAuthenticated : isAuthenticated;

  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.list(1),
    enabled: !useFirestoreOrders && isAuthenticated,
  });
  const { data: firestoreOrders, isLoading: firestoreLoading } = useQuery({
    queryKey: ['firebase-orders', firebaseUser?.uid],
    queryFn: () => firebaseOrdersApi.listOrders(firebaseUser!.uid),
    enabled: useFirestoreOrders && isFirebaseAuthenticated && !!firebaseUser,
  });

  const orders = useFirestoreOrders ? (firestoreOrders ?? []) : (data?.orders ?? []);
  const loading = useFirestoreOrders ? firestoreLoading : isLoading;
  const signInPath = useFirestoreOrders ? '/firebase-auth/login' : '/login';

  if (!signedIn) {
    return (
      <div className="container-app py-8">
        <EmptyState
          emoji="📦"
          title="Sign in to view your orders"
          message="You need to be signed in to see your order history."
          action={<Link to={signInPath} className="btn-primary">Sign in</Link>}
        />
      </div>
    );
  }

  return (
    <div className="container-app py-8">
      <Seo title="Your Orders" noindex />
      <PageHeader title="Your orders" subtitle="Track and manage your recent orders" />
      {useFirestoreOrders && (
        <p className="mt-2 rounded-2xl bg-brand-50 px-4 py-2 text-xs font-medium text-ink">
          Loaded from Firestore (VITE_USE_FIRESTORE_ORDERS).
        </p>
      )}

      {loading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-24 w-full" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          emoji="📦"
          title="No orders yet"
          message="When you place an order, it'll show up here with live tracking."
          action={<Link to="/products" className="btn-primary">Start shopping</Link>}
        />
      ) : (
        <div className="mt-6 space-y-3">
          {orders.map((order) => (
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
