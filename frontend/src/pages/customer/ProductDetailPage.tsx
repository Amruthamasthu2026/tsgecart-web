import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { catalogApi } from '../../features/catalog/catalog.api';
import { discoveryApi } from '../../features/discovery/discovery.api';
import { formatCurrency, discountPercent, formatDate } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { useAddToCart } from '../../features/cart/useAddToCart';
import { useAuth } from '../../contexts/AuthContext';
import { ReviewForm } from '../../components/product/ReviewForm';
import { ProductCard } from '../../components/product/ProductCard';

export function ProductDetailPage() {
  const { slug = '' } = useParams();
  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => catalogApi.getProduct(slug),
  });

  const { add, pendingId, error: addError } = useAddToCart();
  const { isAuthenticated } = useAuth();
  const [variantId, setVariantId] = useState<string | null>(null);

  const { data: related = [] } = useQuery({
    queryKey: ['related', slug],
    queryFn: () => discoveryApi.related(slug),
    enabled: !!slug,
  });

  // Record the view for recommendations (best-effort, authenticated only).
  useEffect(() => {
    if (isAuthenticated && product?.id) {
      discoveryApi.trackView(product.id).catch(() => undefined);
    }
  }, [isAuthenticated, product?.id]);

  if (isLoading) {
    return (
      <div className="container-app py-8">
        <div className="grid gap-8 md:grid-cols-2">
          <div className="skeleton aspect-square w-full" />
          <div className="space-y-4">
            <div className="skeleton h-8 w-3/4" />
            <div className="skeleton h-6 w-1/2" />
            <div className="skeleton h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="container-app grid min-h-[50vh] place-items-center text-center">
        <div>
          <h1 className="text-2xl font-bold">Product not found</h1>
          <Link to="/products" className="btn-primary mt-4 inline-flex">
            Browse products
          </Link>
        </div>
      </div>
    );
  }

  const selected =
    product.variants.find((v) => v.id === variantId) ??
    product.variants.find((v) => v.isDefault) ??
    product.variants[0];
  const discount = selected ? discountPercent(selected.mrp, selected.price) : 0;
  const stock = selected?.inventory?.stock ?? 0;

  return (
    <div className="container-app py-8">
      <nav className="mb-4 text-sm text-ink-muted">
        <Link to="/" className="hover:underline">Home</Link>
        {product.category && (
          <>
            {' / '}
            <Link to={`/products?category=${product.category.slug}`} className="hover:underline">
              {product.category.name}
            </Link>
          </>
        )}
        {' / '}
        <span className="text-ink">{product.name}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Gallery */}
        <div className="card overflow-hidden">
          <div className="aspect-square bg-gray-50">
            {product.images[0] ? (
              <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-6xl text-gray-200">🛒</div>
            )}
          </div>
        </div>

        {/* Details */}
        <div>
          {product.brand && <p className="text-sm font-medium text-brand-700">{product.brand.name}</p>}
          <h1 className="mt-1 text-2xl font-extrabold">{product.name}</h1>

          {product.ratingCount > 0 && (
            <p className="mt-2 text-sm text-ink-muted">
              ⭐ {product.ratingAvg} ({product.ratingCount} reviews)
            </p>
          )}

          {selected && (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-3xl font-extrabold">{formatCurrency(selected.price)}</span>
              {discount > 0 && (
                <>
                  <span className="text-lg text-ink-muted line-through">
                    {formatCurrency(selected.mrp)}
                  </span>
                  <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-brand">
                    {discount}% OFF
                  </span>
                </>
              )}
            </div>
          )}
          <p className="mt-1 text-xs text-ink-muted">Inclusive of all taxes</p>

          {/* Variant selector */}
          {product.variants.length > 1 && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold">Select size</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setVariantId(v.id)}
                    className={`rounded-xl border px-4 py-2 text-sm transition ${
                      selected?.id === v.id
                        ? 'border-ink bg-ink text-brand'
                        : 'border-black/10 hover:border-brand-400'
                    }`}
                  >
                    <span className="block font-semibold">{v.unitLabel}</span>
                    <span className="block text-xs opacity-80">{formatCurrency(v.price)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <Button
              disabled={stock <= 0 || !selected}
              isLoading={!!selected && pendingId === selected.id}
              onClick={() => selected && add(selected.id)}
            >
              {stock > 0 ? 'Add to cart' : 'Out of stock'}
            </Button>
            {stock > 0 && stock <= 10 && (
              <span className="text-sm font-medium text-red-600">Only {stock} left!</span>
            )}
          </div>
          {addError && <p className="mt-2 text-sm text-red-600">{addError}</p>}

          {product.description && (
            <div className="mt-8">
              <h2 className="mb-2 text-lg font-bold">About this product</h2>
              <p className="text-sm leading-relaxed text-ink-muted">{product.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Reviews */}
      <section className="mt-12 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <h2 className="mb-4 text-xl font-bold">Customer reviews</h2>
          {product.reviews.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {product.reviews.map((r) => (
                <div key={r.id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{r.user.name}</span>
                    <span className="text-sm">{'⭐'.repeat(r.rating)}</span>
                  </div>
                  {r.title && <p className="mt-1 font-medium">{r.title}</p>}
                  {r.comment && <p className="mt-1 text-sm text-ink-muted">{r.comment}</p>}
                  <p className="mt-2 text-xs text-ink-muted">{formatDate(r.createdAt)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">No reviews yet. Be the first to review!</p>
          )}
        </div>
        <ReviewForm productId={product.id} slug={product.slug} />
      </section>

      {/* Related products */}
      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-bold">You might also like</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {related.slice(0, 5).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
