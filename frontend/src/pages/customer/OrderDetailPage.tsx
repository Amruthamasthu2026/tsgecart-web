import { useParams, useLocation, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ordersApi } from '../../features/orders/orders.api';
import { useAuth } from '../../contexts/AuthContext';
import { useFirebaseAuth } from '../../contexts/FirebaseAuthContext';
import { firebaseOrdersApi, useFirestoreOrders } from '../../services/firebaseOrders';
import { OrderTimeline } from '../../components/order/OrderTimeline';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Seo } from '../../components/Seo';
import { formatCurrency, formatDate } from '../../lib/format';

const CANCELLABLE = ['CONFIRMED', 'PREPARING'];

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const justPlaced = (location.state as { justPlaced?: boolean })?.justPlaced;
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { isAuthenticated: isFirebaseAuthenticated } = useFirebaseAuth();
  const signedIn = useFirestoreOrders ? isFirebaseAuthenticated : isAuthenticated;

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => (useFirestoreOrders ? firebaseOrdersApi.getOrder(id) : ordersApi.get(id)),
    enabled: signedIn,
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (useFirestoreOrders) {
        await firebaseOrdersApi.cancelOrder(id);
        return firebaseOrdersApi.getOrder(id);
      }
      return ordersApi.cancel(id);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['order', id], updated);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['firebase-orders'] });
    },
  });

  const downloadInvoice = async () => {
    const invoice = await ordersApi.invoice(id);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(renderInvoiceHtml(invoice));
    win.document.close();
    win.focus();
    win.print();
  };

  if (!signedIn) {
    return (
      <div className="container-app py-8">
        <EmptyState
          emoji="📦"
          title="Sign in to view this order"
          message="You need to be signed in to see order details."
          action={
            <Link to={useFirestoreOrders ? '/firebase-auth/login' : '/login'} className="btn-primary">
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container-app py-8">
        <Spinner />
      </div>
    );
  }
  if (!order) {
    return (
      <div className="container-app py-8">
        <EmptyState
          emoji="📦"
          title="Order not found"
          message="We couldn't find this order. It may have been removed."
          action={<Link to="/orders" className="btn-primary">Your orders</Link>}
        />
      </div>
    );
  }

  return (
    <div className="container-app py-8">
      <Seo title={`Order ${order.orderNumber}`} noindex />
      {justPlaced && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-3 rounded-2xl bg-brand p-4"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-ink text-xl text-brand">
            ✓
          </span>
          <div>
            <p className="font-bold text-ink">Order placed successfully!</p>
            <p className="text-sm text-ink/70">
              {order.etaMinMinutes && order.etaMaxMinutes
                ? `Arriving in ${order.etaMinMinutes}–${order.etaMaxMinutes} minutes.`
                : 'We’ll get it to you shortly.'}
            </p>
          </div>
        </motion.div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{order.orderNumber}</h1>
          <p className="text-sm text-ink-muted">
            Placed {formatDate(order.placedAt)} · Payment: {order.payment?.method} ·{' '}
            {order.paymentStatus}
          </p>
        </div>
        <div className="flex gap-2">
          {!useFirestoreOrders && (
            <Button variant="ghost" onClick={downloadInvoice}>
              Invoice
            </Button>
          )}
          {CANCELLABLE.includes(order.status) && (
            <Button
              variant="ghost"
              isLoading={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
              className="text-red-600"
            >
              Cancel order
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-4 text-lg font-bold">Tracking</h2>
            <OrderTimeline status={order.status} />
          </section>

          <section className="card p-5">
            <h2 className="mb-4 text-lg font-bold">Items</h2>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-50">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.productName} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-xl text-gray-200">🛒</div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{item.productName}</p>
                    <p className="text-xs text-ink-muted">
                      {item.variantLabel} × {item.quantity}
                    </p>
                  </div>
                  <span className="text-sm font-semibold">{formatCurrency(item.lineTotal)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <h2 className="text-lg font-bold">Delivery address</h2>
            <p className="mt-2 text-sm font-medium">{order.shipContactName}</p>
            <p className="text-sm text-ink-muted">
              {order.shipLine1}
              {order.shipLine2 ? `, ${order.shipLine2}` : ''}, {order.shipCity} — {order.shipPincode}
            </p>
            <p className="text-sm text-ink-muted">{order.shipContactPhone}</p>
          </div>

          <div className="card p-5">
            <h2 className="text-lg font-bold">Bill details</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd>{formatCurrency(order.subtotal)}</dd>
              </div>
              {Number(order.discount) > 0 && (
                <div className="flex justify-between text-green-700">
                  <dt>Discount</dt>
                  <dd>−{formatCurrency(order.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-muted">Delivery</dt>
                <dd>
                  {Number(order.deliveryCharge) === 0 ? 'FREE' : formatCurrency(order.deliveryCharge)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-black/5 pt-2 text-base font-bold">
                <dt>Total</dt>
                <dd>{formatCurrency(order.total)}</dd>
              </div>
              <p className="text-xs text-ink-muted">Incl. {formatCurrency(order.taxTotal)} tax</p>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}

interface InvoiceData {
  orderNumber: string;
  placedAt: string;
  shipping: { name: string; line1: string; line2: string | null; city: string; pincode: string };
  lines: Array<{
    productName: string;
    variantLabel: string;
    quantity: number;
    unitPrice: number;
    gstRate: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discount: number;
  taxTotal: number;
  deliveryCharge: number;
  total: number;
}

function renderInvoiceHtml(inv: InvoiceData): string {
  const rows = inv.lines
    .map(
      (l) => `<tr>
        <td>${l.productName} (${l.variantLabel})</td>
        <td style="text-align:center">${l.quantity}</td>
        <td style="text-align:right">₹${l.unitPrice.toFixed(2)}</td>
        <td style="text-align:right">${l.gstRate}%</td>
        <td style="text-align:right">₹${l.lineTotal.toFixed(2)}</td>
      </tr>`,
    )
    .join('');
  return `<!doctype html><html><head><title>Invoice ${inv.orderNumber}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#111;padding:32px;max-width:720px;margin:auto}
    h1{color:#111}.brand{background:#FFE60D;padding:12px 16px;border-radius:8px;font-weight:800;display:inline-block}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border-bottom:1px solid #eee;padding:8px;font-size:14px;text-align:left}
    .totals{margin-top:16px;float:right;text-align:right;font-size:14px}
  </style></head><body>
    <div class="brand">TSG eCart</div>
    <h1>Tax Invoice</h1>
    <p><strong>Order:</strong> ${inv.orderNumber}<br/>
    <strong>Date:</strong> ${new Date(inv.placedAt).toLocaleString('en-IN')}</p>
    <p><strong>Deliver to:</strong><br/>${inv.shipping.name}<br/>
    ${inv.shipping.line1}${inv.shipping.line2 ? ', ' + inv.shipping.line2 : ''}<br/>
    ${inv.shipping.city} — ${inv.shipping.pincode}</p>
    <table><thead><tr><th>Item</th><th style="text-align:center">Qty</th>
    <th style="text-align:right">Price</th><th style="text-align:right">GST</th>
    <th style="text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals">
      <div>Subtotal: ₹${inv.subtotal.toFixed(2)}</div>
      ${inv.discount > 0 ? `<div>Discount: −₹${inv.discount.toFixed(2)}</div>` : ''}
      <div>Delivery: ₹${inv.deliveryCharge.toFixed(2)}</div>
      <div>Tax (incl.): ₹${inv.taxTotal.toFixed(2)}</div>
      <div style="font-weight:800;font-size:16px">Total: ₹${inv.total.toFixed(2)}</div>
    </div>
  </body></html>`;
}
