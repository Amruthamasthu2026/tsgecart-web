import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Product } from '../../features/catalog/catalog.types';
import { formatCurrency, discountPercent } from '../../lib/format';
import { useAddToCart } from '../../features/cart/useAddToCart';
import { useFirebaseAddToCart } from '../../features/cart/useFirebaseAddToCart';
import { wishlistApi } from '../../features/wishlist/wishlist.api';
import { firebaseWishlistApi, useFirestoreWishlist } from '../../services/firebaseWishlist';
import { useFirestoreProducts } from '../../services/firebaseProducts';
import { useFirestoreCart } from '../../services/firebaseCart';
import { useAuth } from '../../contexts/AuthContext';
import { useFirebaseAuth } from '../../contexts/FirebaseAuthContext';
import { HeartIcon, StarIcon } from '../ui/icons';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  // A product rendered here may have come from either data source (this
  // component has no way to know which) — the *global* flags decide which
  // backend "Add to cart"/wishlist actually go to, exactly mirroring
  // ProductDetailPage's canAddToFirestoreCart logic.
  const canUseFirestoreCart = useFirestoreProducts && useFirestoreCart;
  const previewOnly = useFirestoreProducts && !canUseFirestoreCart;
  const legacyAddToCart = useAddToCart();
  const firebaseAddToCart = useFirebaseAddToCart();
  const { add, pendingId } = canUseFirestoreCart ? firebaseAddToCart : legacyAddToCart;
  const { isAuthenticated } = useAuth();
  const { isAuthenticated: isFirebaseAuthenticated, user: firebaseUser } = useFirebaseAuth();
  const queryClient = useQueryClient();

  const variant = product.variants.find((v) => v.isDefault) ?? product.variants[0];
  const discount = variant ? discountPercent(variant.mrp, variant.price) : 0;
  const outOfStock = variant?.inventory ? variant.inventory.stock <= 0 : false;
  const image = product.images[0];

  const wishMutation = useMutation({
    mutationFn: () =>
      useFirestoreWishlist ? firebaseWishlistApi.add(firebaseUser!.uid, product.slug) : wishlistApi.add(product.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wishlist'] }),
  });
  const canWishlist = useFirestoreWishlist ? isFirebaseAuthenticated : isAuthenticated;

  return (
    <div className="card card-hover group flex flex-col overflow-hidden">
      <div className="relative">
        <Link to={`/products/${product.slug}`} className="block">
          <div className="aspect-square bg-gradient-to-b from-slate-50 to-white p-4">
            {image ? (
              <img
                src={image}
                alt={product.name}
                loading="lazy"
                className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-5xl text-slate-200">🛒</div>
            )}
          </div>
        </Link>

        {/* Wishlist */}
        <button
          onClick={() => canWishlist && wishMutation.mutate()}
          className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white text-ink-muted shadow-soft transition hover:text-badge-trending"
          aria-label="Add to wishlist"
        >
          <HeartIcon width={18} height={18} />
        </button>

        {/* Discount badge */}
        {discount > 0 && (
          <span className="absolute right-3 top-3 rounded-lg bg-badge-trending px-2 py-1 text-xs font-bold text-white shadow-sm">
            -{discount}%
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <Link
          to={`/products/${product.slug}`}
          className="line-clamp-2 text-sm font-semibold text-ink hover:text-ink-soft"
        >
          {product.name}
        </Link>
        {variant && <p className="mt-0.5 text-xs text-ink-muted">{variant.unitLabel}</p>}

        {product.ratingCount > 0 && (
          <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-md bg-badge-organic px-1.5 py-0.5 text-xs font-bold text-white">
            {Number(product.ratingAvg).toFixed(1)} <StarIcon width={11} height={11} />
          </span>
        )}

        <div className="mt-auto flex items-end justify-between pt-3">
          <div className="leading-tight">
            {variant && (
              <>
                <span className="text-base font-extrabold text-ink">
                  {formatCurrency(variant.price)}
                </span>
                {discount > 0 && (
                  <span className="ml-1 text-xs text-ink-muted line-through">
                    {formatCurrency(variant.mrp)}
                  </span>
                )}
              </>
            )}
          </div>
          <button
            onClick={() => variant && add(variant.id)}
            disabled={outOfStock || !variant || pendingId === variant?.id || previewOnly}
            title={previewOnly ? 'Enable VITE_USE_FIRESTORE_CART to add Firestore-sourced products' : undefined}
            className="rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-ink transition hover:bg-brand-400 hover:shadow-blob disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            {previewOnly ? '—' : outOfStock ? 'Out' : pendingId === variant?.id ? '···' : 'ADD'}
          </button>
        </div>
      </div>
    </div>
  );
}
