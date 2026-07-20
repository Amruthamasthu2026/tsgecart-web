import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { useFirebaseAuth } from '../../contexts/FirebaseAuthContext';
import { cartApi, type CheckoutSummary } from '../../features/cart/cart.api';
import { firebaseCartApi, useFirestoreCart, toLegacyCartSummary } from '../../services/firebaseCart';
import { firebaseOrdersApi, useFirestoreCheckout } from '../../services/firebaseOrders';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Seo } from '../../components/Seo';
import { formatCurrency } from '../../lib/format';
import { extractApiError } from '../../lib/apiClient';
import { extractFirebaseError } from '../../features/firebaseAuth/firebaseAuth.schemas';

export function CartPage() {
  const { isAuthenticated } = useAuth();
  const { isAuthenticated: isFirebaseAuthenticated } = useFirebaseAuth();
  const { cart: expressCart, updateItem: expressUpdateItem, removeItem: expressRemoveItem } = useCart();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [pincode, setPincode] = useState('');
  const [coupon, setCoupon] = useState('');
  const [checkout, setCheckout] = useState<CheckoutSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Checkout (Phase 5) needs BOTH the cart and the pincode/coupon preview on
  // Firestore — `useFirestoreCart` alone (Phase 4) only means the cart
  // itself is Firestore-backed, not that checkout has been migrated yet.
  const firestoreCheckoutReady = useFirestoreCart && useFirestoreCheckout;

  const summaryMutation = useMutation({
    mutationFn: () => {
      if (firestoreCheckoutReady) {
        const legacyCart = firestoreCartRaw ? toLegacyCartSummary(firestoreCartRaw) : undefined;
        if (!legacyCart) throw new Error('Cart not loaded yet');
        return firebaseOrdersApi.checkPincodeServiceability(pincode, legacyCart, coupon || undefined);
      }
      return cartApi.checkoutSummary(pincode, coupon || undefined);
    },
    onSuccess: (data) => {
      setCheckout(data);
      setError(null);
    },
    onError: (err) => {
      setCheckout(null);
      setError(firestoreCheckoutReady ? extractFirebaseError(err) : extractApiError(err));
    },
  });

  // Firestore branch (Phase 4) — only queried/mutated when the flag is on
  // and the caller is signed in via Firebase (the existing JWT session
  // cannot satisfy Firestore's Callable Functions).
  const { data: firestoreCartRaw } = useQuery({
    queryKey: ['firebase-cart'],
    queryFn: firebaseCartApi.get,
    enabled: useFirestoreCart && isFirebaseAuthenticated,
  });
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const updateMutation = useMutation({
    mutationFn: ({ variantId, quantity }: { variantId: string; quantity: number }) =>
      firebaseCartApi.updateItem(variantId, quantity),
    onSuccess: (data) => {
      queryClient.setQueryData(['firebase-cart'], data);
      setFirestoreError(null);
    },
    onError: (err) => setFirestoreError(extractFirebaseError(err)),
  });
  const removeMutation = useMutation({
    mutationFn: (variantId: string) => firebaseCartApi.removeItem(variantId),
    onSuccess: (data) => {
      queryClient.setQueryData(['firebase-cart'], data);
      setFirestoreError(null);
    },
    onError: (err) => setFirestoreError(extractFirebaseError(err)),
  });

  const cart = useFirestoreCart ? (firestoreCartRaw ? toLegacyCartSummary(firestoreCartRaw) : undefined) : expressCart;
  const updateItem = useFirestoreCart
    ? async (itemId: string, quantity: number) => {
        await updateMutation.mutateAsync({ variantId: itemId, quantity });
      }
    : expressUpdateItem;
  const removeItem = useFirestoreCart
    ? async (itemId: string) => {
        await removeMutation.mutateAsync(itemId);
      }
    : expressRemoveItem;

  const signedIn = useFirestoreCart ? isFirebaseAuthenticated : isAuthenticated;
  const signInPath = useFirestoreCart ? '/firebase-auth/login' : '/login';

  if (!signedIn) {
    return (
      <div className="container-app py-8">
        <EmptyState
          emoji="🛒"
          title="Your cart is waiting"
          message="Sign in to view your cart and check out."
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
          message="Add fresh groceries and daily essentials to get started."
          action={<Link to="/products" className="btn-primary">Start shopping</Link>}
        />
      </div>
    );
  }

  return (
    <div className="container-app py-8">
      <Seo title="Your Cart" noindex />
      <PageHeader title="Your cart" subtitle={`${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'}`} />
      {firestoreCheckoutReady && (
        <p className="mt-2 rounded-2xl bg-brand-50 px-4 py-2 text-xs font-medium text-ink">
          Cart, delivery, coupons, and checkout are powered by Firestore.
        </p>
      )}
      {useFirestoreCart && !firestoreCheckoutReady && (
        <p className="mt-2 rounded-2xl bg-brand-50 px-4 py-2 text-xs font-medium text-ink">
          Loaded from Firestore (VITE_USE_FIRESTORE_CART) — preview only. Checkout is not migrated yet
          (VITE_USE_FIRESTORE_CHECKOUT).
        </p>
      )}
      {firestoreError && (
        <p className="mt-2 rounded-2xl bg-red-50 px-4 py-2 text-xs font-medium text-red-700">{firestoreError}</p>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* Items */}
        <div className="space-y-3">
          {cart.items.map((item) => (
            <div key={item.itemId} className="card flex gap-4 p-4">
              <Link to={`/products/${item.slug}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-50">
                {item.image ? (
                  <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-2xl text-gray-200">🛒</div>
                )}
              </Link>
              <div className="flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link to={`/products/${item.slug}`} className="text-sm font-semibold">
                      {item.name}
                    </Link>
                    <p className="text-xs text-ink-muted">{item.unitLabel}</p>
                  </div>
                  <button
                    onClick={() => removeItem(item.itemId)}
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <div className="flex items-center rounded-full border border-black/10">
                    <button
                      onClick={() => updateItem(item.itemId, item.quantity - 1)}
                      className="px-3 py-1 text-lg leading-none"
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                    <button
                      onClick={() => updateItem(item.itemId, item.quantity + 1)}
                      disabled={item.quantity >= item.availableStock}
                      className="px-3 py-1 text-lg leading-none disabled:opacity-30"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-sm font-bold">{formatCurrency(item.lineTotal)}</span>
                </div>
                {!item.inStock && (
                  <p className="mt-1 text-xs text-red-600">Out of stock — remove to check out</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <aside className="h-fit space-y-4">
          <div className="card p-5">
            <h2 className="text-lg font-bold">Delivery</h2>
            <p className="mt-1 text-xs text-ink-muted">
              {useFirestoreCart && !firestoreCheckoutReady
                ? 'Delivery/coupon checking is not migrated to Firestore yet.'
                : 'We deliver within Hyderabad only.'}
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter pincode"
                disabled={useFirestoreCart && !firestoreCheckoutReady}
                className="w-full rounded-xl border border-black/10 px-4 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200 disabled:bg-slate-50 disabled:text-ink-muted"
              />
            </div>
            <input
              value={coupon}
              onChange={(e) => setCoupon(e.target.value.toUpperCase())}
              placeholder="Coupon code (optional)"
              disabled={useFirestoreCart && !firestoreCheckoutReady}
              className="mt-2 w-full rounded-xl border border-black/10 px-4 py-2 text-sm uppercase outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200 disabled:bg-slate-50 disabled:text-ink-muted"
            />
            <Button
              fullWidth
              className="mt-3"
              variant="dark"
              isLoading={summaryMutation.isPending}
              disabled={(useFirestoreCart && !firestoreCheckoutReady) || pincode.length !== 6}
              onClick={() => summaryMutation.mutate()}
            >
              Check & apply
            </Button>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            {checkout && !checkout.serviceable && (
              <p className="mt-2 text-xs font-medium text-red-600">{checkout.message}</p>
            )}
            {checkout?.serviceable && checkout.eta && (
              <p className="mt-2 text-xs font-medium text-green-700">
                Delivery in {checkout.eta.min}–{checkout.eta.max} min
              </p>
            )}
          </div>

          <div className="card p-5">
            <h2 className="text-lg font-bold">Order summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd>{formatCurrency(cart.subtotal)}</dd>
              </div>
              {checkout?.serviceable && (
                <>
                  {checkout.discount > 0 && (
                    <div className="flex justify-between text-green-700">
                      <dt>Discount{checkout.couponCode ? ` (${checkout.couponCode})` : ''}</dt>
                      <dd>−{formatCurrency(checkout.discount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">Delivery</dt>
                    <dd>
                      {checkout.deliveryCharge === 0 ? 'FREE' : formatCurrency(checkout.deliveryCharge)}
                    </dd>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t border-black/5 pt-2 text-base font-bold">
                <dt>Total</dt>
                <dd>{formatCurrency(checkout?.serviceable ? checkout.total : cart.subtotal)}</dd>
              </div>
              <p className="text-xs text-ink-muted">Inclusive of {formatCurrency(cart.taxTotal)} tax</p>
            </dl>
            <Button
              fullWidth
              className="mt-4"
              disabled={(useFirestoreCart && !firestoreCheckoutReady) || !checkout?.serviceable}
              onClick={() =>
                navigate('/checkout', {
                  state: { pincode, coupon: checkout?.couponCode },
                })
              }
            >
              Proceed to checkout
            </Button>
            {useFirestoreCart && !firestoreCheckoutReady ? (
              <p className="mt-2 text-center text-xs text-ink-muted">
                Checkout for Firestore carts requires VITE_USE_FIRESTORE_CHECKOUT
              </p>
            ) : (
              !checkout?.serviceable && (
                <p className="mt-2 text-center text-xs text-ink-muted">
                  Enter a serviceable pincode to continue
                </p>
              )
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
