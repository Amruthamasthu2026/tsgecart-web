import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { couponsApi, type AppliedCoupon } from '../../features/coupons/coupons.api';
import { useCart } from '../../contexts/CartContext';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { Seo } from '../../components/Seo';
import { formatCurrency } from '../../lib/format';
import { extractApiError } from '../../lib/apiClient';

const PERKS = [
  { emoji: '🎟️', title: 'Apply at checkout', text: 'Enter your code in the cart to instantly see the discount.' },
  { emoji: '💛', title: 'One per order', text: 'A single coupon applies per order, on top of running deals.' },
  { emoji: '🚚', title: 'Free delivery', text: 'Orders above the free-delivery limit ship at no extra cost.' },
];

export function CouponsPage() {
  const { cart } = useCart();
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<AppliedCoupon | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => couponsApi.apply(code.trim()),
    onSuccess: (data) => {
      setApplied(data);
      setError(null);
    },
    onError: (err) => {
      setApplied(null);
      setError(extractApiError(err));
    },
  });

  const hasCart = (cart?.itemCount ?? 0) > 0;

  return (
    <div className="container-app py-8">
      <Seo title="Coupons & Offers" description="Check and apply TSG eCart coupons on your order." />
      <PageHeader title="Coupons & offers" subtitle="Validate a coupon against your current cart" />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Validator */}
        <div className="card p-6">
          <h2 className="text-lg font-bold text-ink">Have a coupon code?</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {hasCart
              ? 'Enter your code to check the discount on your current cart.'
              : 'Add items to your cart first, then validate your coupon here or at checkout.'}
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ENTER CODE"
              className="w-full rounded-full border border-black/10 px-5 py-3 text-sm font-semibold uppercase tracking-widest outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
            />
            <Button
              className="sm:w-auto"
              isLoading={mutation.isPending}
              disabled={!code.trim() || !hasCart}
              onClick={() => mutation.mutate()}
            >
              Apply
            </Button>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
          )}
          {applied && (
            <div className="mt-4 rounded-2xl bg-brand-50 p-4">
              <p className="font-bold text-ink">
                🎉 {applied.coupon.code} applied — you save {formatCurrency(applied.coupon.discount)}!
              </p>
              <p className="mt-1 text-sm text-ink-muted">New total: {formatCurrency(applied.newTotal)}</p>
              <Link to="/cart" className="btn-primary mt-3 inline-flex">
                Go to cart
              </Link>
            </div>
          )}

          {!hasCart && (
            <Link to="/products" className="btn-dark mt-4 inline-flex">
              Start shopping
            </Link>
          )}
        </div>

        {/* How it works */}
        <aside className="space-y-3">
          {PERKS.map((p) => (
            <div key={p.title} className="card flex items-start gap-3 p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-100 text-xl">
                {p.emoji}
              </span>
              <div>
                <p className="text-sm font-bold text-ink">{p.title}</p>
                <p className="text-sm text-ink-muted">{p.text}</p>
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
