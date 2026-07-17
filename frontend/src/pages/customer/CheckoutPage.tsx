import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { accountApi } from '../../features/account/account.api';
import { cartApi } from '../../features/cart/cart.api';
import { ordersApi } from '../../features/orders/orders.api';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { Button } from '../../components/ui/Button';
import { formatCurrency } from '../../lib/format';
import { extractApiError } from '../../lib/apiClient';
import { loadRazorpay, openRazorpayCheckout } from '../../lib/razorpay';

export function CheckoutPage() {
  const { user } = useAuth();
  const { cart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const couponFromCart = (location.state as { coupon?: string })?.coupon;

  const [addressId, setAddressId] = useState<string | null>(null);
  const [method, setMethod] = useState<'COD' | 'RAZORPAY'>('COD');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: addresses = [] } = useQuery({
    queryKey: ['addresses'],
    queryFn: accountApi.listAddresses,
  });

  const selectedAddress = useMemo(
    () => addresses.find((a) => a.id === (addressId ?? addresses.find((x) => x.isDefault)?.id)),
    [addresses, addressId],
  );

  const { data: summary } = useQuery({
    queryKey: ['checkout-summary', selectedAddress?.pincode, couponFromCart],
    queryFn: () => cartApi.checkoutSummary(selectedAddress!.pincode, couponFromCart),
    enabled: !!selectedAddress,
  });

  const placeOrder = async () => {
    if (!selectedAddress) {
      setError('Please select a delivery address');
      return;
    }
    if (summary && !summary.serviceable) {
      setError(summary.message);
      return;
    }
    setPlacing(true);
    setError(null);
    try {
      const result = await ordersApi.create({
        addressId: selectedAddress.id,
        paymentMethod: method,
        couponCode: summary?.couponCode ?? couponFromCart,
      });

      if (method === 'COD' || !result.razorpay) {
        queryClient.invalidateQueries({ queryKey: ['cart'] });
        navigate(`/orders/${result.order.id}`, { state: { justPlaced: true } });
        return;
      }

      // Online payment via Razorpay.
      const loaded = await loadRazorpay();
      if (!loaded) {
        setError('Could not load the payment gateway. Please try Cash on Delivery.');
        setPlacing(false);
        return;
      }
      openRazorpayCheckout({
        key: result.razorpay.keyId,
        amount: result.razorpay.amount,
        currency: result.razorpay.currency,
        orderId: result.razorpay.orderId,
        name: 'TSG eCart',
        description: `Order ${result.order.orderNumber}`,
        prefill: { name: user?.name ?? '', email: user?.email ?? '', contact: user?.phone ?? undefined },
        onSuccess: async (response) => {
          try {
            await ordersApi.verifyPayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            queryClient.invalidateQueries({ queryKey: ['cart'] });
            navigate(`/orders/${result.order.id}`, { state: { justPlaced: true } });
          } catch (err) {
            setError(extractApiError(err));
            setPlacing(false);
          }
        },
        onDismiss: () => {
          setError('Payment cancelled. Your order is saved as pending — retry from your orders.');
          setPlacing(false);
        },
      });
    } catch (err) {
      setError(extractApiError(err));
      setPlacing(false);
    }
  };

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-app grid min-h-[50vh] place-items-center text-center">
        <div>
          <h1 className="text-2xl font-bold">Your cart is empty</h1>
          <Link to="/products" className="btn-primary mt-6 inline-flex">
            Shop now
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-app py-8">
      <h1 className="text-2xl font-extrabold">Checkout</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* Address */}
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Delivery address</h2>
              <Link to="/account" className="text-sm font-medium text-brand-700 hover:underline">
                Manage
              </Link>
            </div>
            {addresses.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No addresses yet.{' '}
                <Link to="/account" className="font-medium text-brand-700 hover:underline">
                  Add one
                </Link>{' '}
                to continue.
              </p>
            ) : (
              <div className="space-y-2">
                {addresses.map((a) => {
                  const active = selectedAddress?.id === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setAddressId(a.id)}
                      className={`w-full rounded-xl border p-3 text-left text-sm transition ${
                        active ? 'border-ink ring-2 ring-brand-200' : 'border-black/10 hover:border-brand-300'
                      }`}
                    >
                      <span className="font-semibold">
                        {a.contactName} · {a.type}
                      </span>
                      <span className="block text-ink-muted">
                        {a.line1}
                        {a.line2 ? `, ${a.line2}` : ''}, {a.city} — {a.pincode}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Payment */}
          <section className="card p-5">
            <h2 className="mb-3 text-lg font-bold">Payment method</h2>
            <div className="space-y-2">
              {(['COD', 'RAZORPAY'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left text-sm transition ${
                    method === m ? 'border-ink ring-2 ring-brand-200' : 'border-black/10 hover:border-brand-300'
                  }`}
                >
                  <span className="font-semibold">
                    {m === 'COD' ? 'Cash on Delivery' : 'Pay online (Razorpay)'}
                  </span>
                  <span className="text-ink-muted">
                    {m === 'COD' ? 'Pay when it arrives' : 'UPI, cards, netbanking'}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Summary */}
        <aside className="h-fit">
          <div className="card p-5">
            <h2 className="text-lg font-bold">Order summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd>{formatCurrency(cart.subtotal)}</dd>
              </div>
              {summary?.serviceable && summary.discount > 0 && (
                <div className="flex justify-between text-green-700">
                  <dt>Discount{summary.couponCode ? ` (${summary.couponCode})` : ''}</dt>
                  <dd>−{formatCurrency(summary.discount)}</dd>
                </div>
              )}
              {summary?.serviceable && (
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Delivery</dt>
                  <dd>{summary.deliveryCharge === 0 ? 'FREE' : formatCurrency(summary.deliveryCharge)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-black/5 pt-2 text-base font-bold">
                <dt>Total</dt>
                <dd>{formatCurrency(summary?.serviceable ? summary.total : cart.subtotal)}</dd>
              </div>
            </dl>

            {summary?.serviceable && summary.eta && (
              <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium">
                Estimated delivery in {summary.eta.min}–{summary.eta.max} min
              </p>
            )}
            {summary && !summary.serviceable && (
              <p className="mt-3 text-xs font-medium text-red-600">{summary.message}</p>
            )}
            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

            <Button
              fullWidth
              className="mt-4"
              isLoading={placing}
              disabled={!selectedAddress || (summary && !summary.serviceable)}
              onClick={placeOrder}
            >
              {method === 'COD' ? 'Place order' : 'Pay & place order'}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
