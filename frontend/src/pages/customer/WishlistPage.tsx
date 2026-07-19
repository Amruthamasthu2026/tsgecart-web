import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { wishlistApi } from '../../features/wishlist/wishlist.api';
import { firebaseWishlistApi, useFirestoreWishlist } from '../../services/firebaseWishlist';
import { useAuth } from '../../contexts/AuthContext';
import { useFirebaseAuth } from '../../contexts/FirebaseAuthContext';
import { ProductCard } from '../../components/product/ProductCard';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Seo } from '../../components/Seo';

export function WishlistPage() {
  const queryClient = useQueryClient();
  // No longer router-gated (Phase 4 moved this route out of the JWT-only
  // ProtectedRoute — see app/router.tsx) — this page now enforces whichever
  // auth system is relevant itself, exactly replacing what the router used
  // to guarantee.
  const { isAuthenticated } = useAuth();
  const { isAuthenticated: isFirebaseAuthenticated, user: firebaseUser } = useFirebaseAuth();
  const signedIn = useFirestoreWishlist ? isFirebaseAuthenticated : isAuthenticated;

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['wishlist', useFirestoreWishlist],
    queryFn: () =>
      useFirestoreWishlist ? firebaseWishlistApi.list(firebaseUser!.uid) : wishlistApi.list(),
    enabled: useFirestoreWishlist ? isFirebaseAuthenticated && !!firebaseUser : isAuthenticated,
  });

  const removeMutation = useMutation({
    mutationFn: (productId: string) =>
      useFirestoreWishlist ? firebaseWishlistApi.remove(firebaseUser!.uid, productId) : wishlistApi.remove(productId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wishlist'] }),
  });

  if (!signedIn) {
    return (
      <div className="container-app py-8">
        <EmptyState
          emoji="💛"
          title="Your wishlist is waiting"
          message={
            useFirestoreWishlist
              ? 'Sign in with Firebase to view your wishlist (VITE_USE_FIRESTORE_WISHLIST is on).'
              : 'Sign in to view your wishlist.'
          }
          action={
            <Link to={useFirestoreWishlist ? '/firebase-auth/login' : '/login'} className="btn-primary">
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-app py-8">
      <Seo title="Your Wishlist" noindex />
      <PageHeader title="Your wishlist" subtitle={products.length ? `${products.length} saved item${products.length === 1 ? '' : 's'}` : undefined} />
      {useFirestoreWishlist && (
        <p className="mt-2 rounded-2xl bg-brand-50 px-4 py-2 text-xs font-medium text-ink">
          Loaded from Firestore (VITE_USE_FIRESTORE_WISHLIST).
        </p>
      )}

      {isLoading ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[3/4] w-full" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          emoji="💛"
          title="Your wishlist is empty"
          message="Tap the heart on any product to save it here for later."
          action={<Link to="/products" className="btn-primary">Discover products</Link>}
        />
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <div key={p.id} className="relative">
              <button
                onClick={() => removeMutation.mutate(useFirestoreWishlist ? p.slug : p.id)}
                className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white text-sm text-ink-muted shadow-soft transition hover:text-badge-trending"
                aria-label="Remove from wishlist"
              >
                ✕
              </button>
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
