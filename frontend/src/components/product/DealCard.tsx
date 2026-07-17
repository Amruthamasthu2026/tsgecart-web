import { Link } from 'react-router-dom';
import type { Product } from '../../features/catalog/catalog.types';
import { formatCurrency, discountPercent } from '../../lib/format';
import { useAddToCart } from '../../features/cart/useAddToCart';
import { StarIcon } from '../ui/icons';

const BADGES = {
  TRENDING: { label: '🔥 TRENDING', cls: 'bg-badge-trending/10 text-badge-trending' },
  POPULAR: { label: '⭐ POPULAR', cls: 'bg-badge-popular/10 text-badge-popular' },
  PREMIUM: { label: '💎 PREMIUM', cls: 'bg-badge-premium/10 text-badge-premium' },
  ORGANIC: { label: '🌱 ORGANIC', cls: 'bg-badge-organic/10 text-badge-organic' },
} as const;

function pickBadge(product: Product, index: number): keyof typeof BADGES {
  if (product.isBestSeller) return 'POPULAR';
  if (product.isFeatured) return 'TRENDING';
  return (['TRENDING', 'POPULAR', 'PREMIUM', 'ORGANIC'] as const)[index % 4];
}

export function DealCard({ product, index = 0 }: { product: Product; index?: number }) {
  const { add, pendingId } = useAddToCart();
  const variant = product.variants.find((v) => v.isDefault) ?? product.variants[0];
  const discount = variant ? discountPercent(variant.mrp, variant.price) : 0;
  const inStock = variant?.inventory ? variant.inventory.stock > 0 : true;
  const badge = BADGES[pickBadge(product, index)];

  return (
    <div className="card card-hover relative flex flex-col p-4">
      {/* Image */}
      <Link to={`/products/${product.slug}`} className="mb-4 block">
        <div className="aspect-[4/3] rounded-2xl bg-gradient-to-b from-slate-50 to-white p-3">
          {product.images[0] ? (
            <img
              src={product.images[0]}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-4xl text-slate-200">🛒</div>
          )}
        </div>
      </Link>

      {/* Badge row */}
      <div className="mb-2 flex items-center justify-between">
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold ${inStock ? 'text-badge-stock' : 'text-badge-trending'}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${inStock ? 'bg-badge-stock' : 'bg-badge-trending'}`} />
          {inStock ? 'In Stock' : 'Sold out'}
        </span>
      </div>

      <Link to={`/products/${product.slug}`} className="text-lg font-bold text-ink hover:text-ink-soft">
        {product.name}
      </Link>
      {product.description && (
        <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{product.description}</p>
      )}

      {/* Rating */}
      <div className="mt-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-badge-organic px-2 py-0.5 text-xs font-bold text-white">
          {Number(product.ratingAvg || 4.7).toFixed(1)} <StarIcon width={11} height={11} />
        </span>
        <span className="text-xs text-ink-muted">
          {product.ratingCount > 0 ? `${product.ratingCount} reviews` : 'New'}
        </span>
      </div>

      {/* Price */}
      <div className="mt-3 flex items-end justify-between">
        <div>
          {variant && (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-ink">{formatCurrency(variant.price)}</span>
              {discount > 0 && (
                <span className="text-sm text-ink-muted line-through">{formatCurrency(variant.mrp)}</span>
              )}
            </div>
          )}
          <p className="mt-1 text-xs font-semibold text-badge-organic">Free Delivery</p>
        </div>
        {discount > 0 && <span className="discount-blob">{discount}% OFF</span>}
      </div>

      <button
        onClick={() => variant && add(variant.id)}
        disabled={!inStock || pendingId === variant?.id}
        className="btn-dark mt-4 w-full py-2.5 text-xs disabled:opacity-50"
      >
        {inStock ? (pendingId === variant?.id ? 'Adding…' : 'Add to cart') : 'Sold out'}
      </button>
    </div>
  );
}
