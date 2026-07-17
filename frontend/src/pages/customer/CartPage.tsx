import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { cartApi, type CheckoutSummary } from '../../features/cart/cart.api';
import { Button } from '../../components/ui/Button';
import { formatCurrency } from '../../lib/format';
import { extractApiError } from '../../lib/apiClient';

export function CartPage() {
  const { isAuthenticated } = useAuth();
  const { cart, updateItem, removeItem } = useCart();
  const navigate = useNavigate();

  const [pincode, setPincode] = useState('');
  const [coupon, setCoupon] = useState('');
  const [checkout, setCheckout] = useState<CheckoutSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summaryMutation = useMutation({
    mutationFn: () => cartApi.checkoutSummary(pincode, coupon || undefined),
    onSuccess: (data) => {
      setCheckout(data);
      setError(null);
    },
    onError: (err) => {
      setCheckout(null);
      setError(extractApiError(err));
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="container-app grid min-h-[50vh] place-items-center text-center">
        <div>
          <h1 className="text-2xl font-bold">Your cart is waiting</h1>
          <p className="mt-2 text-ink-muted">Sign in to view your cart and check out.</p>
          <Link to="/login" className="btn-primary mt-6 inline-flex">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-app grid min-h-[50vh] place-items-center text-center">
        <div>
          <p className="text-5xl">🛒</p>
          <h1 className="mt-4 text-2xl font-bold">Your cart is empty</h1>
          <Link to="/products" className="btn-primary mt-6 inline-flex">
            Start shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-app py-8">
      <h1 className="text-2xl font-extrabold">Your cart</h1>

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
            <p className="mt-1 text-xs text-ink-muted">We deliver within Hyderabad only.</p>
            <div className="mt-3 flex gap-2">
              <input
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter pincode"
                className="w-full rounded-xl border border-black/10 px-4 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
              />
            </div>
            <input
              value={coupon}
              onChange={(e) => setCoupon(e.target.value.toUpperCase())}
              placeholder="Coupon code (optional)"
              className="mt-2 w-full rounded-xl border border-black/10 px-4 py-2 text-sm uppercase outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
            />
            <Button
              fullWidth
              className="mt-3"
              variant="dark"
              isLoading={summaryMutation.isPending}
              disabled={pincode.length !== 6}
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
              disabled={!checkout?.serviceable}
              onClick={() =>
                navigate('/checkout', {
                  state: { pincode, coupon: checkout?.couponCode },
                })
              }
            >
              Proceed to checkout
            </Button>
            {!checkout?.serviceable && (
              <p className="mt-2 text-center text-xs text-ink-muted">
                Enter a serviceable pincode to continue
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
