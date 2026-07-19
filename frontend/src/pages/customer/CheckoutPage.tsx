import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { accountApi } from '../../features/account/account.api';
import { cartApi, type CheckoutSummary } from '../../features/cart/cart.api';
import { ordersApi } from '../../features/orders/orders.api';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { useFirebaseAuth } from '../../contexts/FirebaseAuthContext';
import { firebaseAddressesApi } from '../../services/firebaseAddresses';
import { firebaseCartApi, toLegacyCartSummary } from '../../services/firebaseCart';
import { firebaseOrdersApi, useFirestoreCheckout, useFirebaseRazorpay } from '../../services/firebaseOrders';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Seo } from '../../components/Seo';
import { formatCurrency } from '../../lib/format';
import { extractApiError } from '../../lib/apiClient';
import { extractFirebaseError } from '../../features/firebaseAuth/firebaseAuth.schemas';
import { loadRazorpay, openRazorpayCheckout } from '../../lib/razorpay';

/**
 * Firestore checkout, migration Phase 5: gated by `VITE_USE_FIRESTORE_CHECKOUT`
 * (requires `VITE_USE_FIRESTORE_CART`/`VITE_USE_FIRESTORE_ADDRESSES` also on,
 * since checkout reads the Firestore cart and addresses — see
 * services/firebaseOrders.ts). When the flag is off, this page is byte-for-
 * byte the same Express flow it always was. The pincode-serviceability +
 * coupon-discount preview shown while choosing an address is DISPLAY ONLY
 * (direct Firestore reads / the validateCoupon Callable) — the real total
 * is only ever established by the `createOrder` Callable's own server-side
 * transaction, exactly mirroring how the existing Express preview
 * (`cartApi.checkoutSummary`) is a separate, non-authoritative code path
 * from `orders.service.ts`'s real re-check.
 */
export function CheckoutPage() {
  const { user, isAuthenticated } = useAuth();
  const { user: firebaseUser, isAuthenticated: isFirebaseAuthenticated } = useFirebaseAuth();
  const { cart: expressCart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const couponFromCart = (location.state as { coupon?: string })?.coupon;

  const [addressId, setAddressId] = useState<string | null>(null);
  const [method, setMethod] = useState<'COD' | 'RAZORPAY'>('COD');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: expressAddresses = [] } = useQuery({
    queryKey: ['addresses'],
    queryFn: accountApi.listAddresses,
    enabled: !useFirestoreCheckout,
  });
  const { data: firestoreAddresses = [] } = useQuery({
    queryKey: ['firebase-addresses', firebaseUser?.uid],
    queryFn: () => firebaseAddressesApi.listAddresses(firebaseUser!.uid),
    enabled: useFirestoreCheckout && isFirebaseAuthenticated && !!firebaseUser,
  });
  const addresses = useFirestoreCheckout ? firestoreAddresses : expressAddresses;

  const { data: firestoreCartRaw } = useQuery({
    queryKey: ['firebase-cart'],
    queryFn: firebaseCartApi.get,
    enabled: useFirestoreCheckout && isFirebaseAuthenticated,
  });
  const cart = useFirestoreCheckout ? (firestoreCartRaw ? toLegacyCartSummary(firestoreCartRaw) : undefined) : expressCart;

  const selectedAddress = useMemo(
    () => addresses.find((a) => a.id === (addressId ?? addresses.find((x) => x.isDefault)?.id)),
    [addresses, addressId],
  );

  const { data: summary } = useQuery({
    queryKey: ['checkout-summary', selectedAddress?.pincode, couponFromCart, useFirestoreCheckout],
    queryFn: (): Promise<CheckoutSummary> =>
      useFirestoreCheckout
        ? firebaseOrdersApi.checkPincodeServiceability(selectedAddress!.pincode, cart!, couponFromCart)
        : cartApi.checkoutSummary(selectedAddress!.pincode, couponFromCart),
    enabled: !!selectedAddress && !!cart,
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
      const result = useFirestoreCheckout
        ? await firebaseOrdersApi.createOrder({
            addressId: selectedAddress.id,
            paymentMethod: method,
            couponCode: summary?.couponCode ?? couponFromCart,
          })
        : await ordersApi.create({
            addressId: selectedAddress.id,
            paymentMethod: method,
            couponCode: summary?.couponCode ?? couponFromCart,
          });

      const invalidateCart = () =>
        useFirestoreCheckout
          ? queryClient.invalidateQueries({ queryKey: ['firebase-cart'] })
          : queryClient.invalidateQueries({ queryKey: ['cart'] });

      if (method === 'COD' || !result.razorpay) {
        invalidateCart();
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
        prefill: useFirestoreCheckout
          ? { name: '', email: firebaseUser?.email ?? '', contact: undefined }
          : { name: user?.name ?? '', email: user?.email ?? '', contact: user?.phone ?? undefined },
        onSuccess: async (response) => {
          try {
            const verifyPayload = {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            };
            if (useFirestoreCheckout) {
              await firebaseOrdersApi.verifyPayment(verifyPayload);
            } else {
              await ordersApi.verifyPayment(verifyPayload);
            }
            invalidateCart();
            navigate(`/orders/${result.order.id}`, { state: { justPlaced: true } });
          } catch (err) {
            setError(useFirestoreCheckout ? extractFirebaseError(err) : extractApiError(err));
            setPlacing(false);
          }
        },
        onDismiss: () => {
          setError('Payment cancelled. Your order is saved as pending — retry from your orders.');
          setPlacing(false);
        },
      });
    } catch (err) {
      setError(useFirestoreCheckout ? extractFirebaseError(err) : extractApiError(err));
      setPlacing(false);
    }
  };

  const signedIn = useFirestoreCheckout ? isFirebaseAuthenticated : isAuthenticated;
  const signInPath = useFirestoreCheckout ? '/firebase-auth/login' : '/login';

  if (!signedIn) {
    return (
      <div className="container-app py-8">
        <EmptyState
          emoji="🛒"
          title="Sign in to check out"
          message="You need to be signed in to place an order."
          action={<Link to={signInPath} className="btn-primary">Sign in</Link>}
        />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-app py-8">
        <EmptyState
          emoji="🛒"
          title="Your cart is empty"
          message="Add items to your cart before checking out."
          action={<Link to="/products" className="btn-primary">Shop now</Link>}
        />
      </div>
    );
  }

  return (
    <div className="container-app py-8">
      <Seo title="Checkout" noindex />
      <PageHeader title="Checkout" subtitle="Confirm your address and payment method" />
      {useFirestoreCheckout && (
        <p className="mt-2 rounded-2xl bg-brand-50 px-4 py-2 text-xs font-medium text-ink">
          Checkout via Firestore (VITE_USE_FIRESTORE_CHECKOUT). Totals are recalculated server-side when you place the order.
        </p>
      )}

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
              {(['COD', 'RAZORPAY'] as const)
                .filter((m) => m !== 'RAZORPAY' || !useFirestoreCheckout || useFirebaseRazorpay)
                .map((m) => (
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
            {useFirestoreCheckout && !useFirebaseRazorpay && (
              <p className="mt-2 text-xs text-ink-muted">
                Online payment is not enabled for Firestore checkout yet (VITE_USE_FIREBASE_RAZORPAY).
              </p>
            )}
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
