import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { wishlistApi } from '../../features/wishlist/wishlist.api';
import { ProductCard } from '../../components/product/ProductCard';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Seo } from '../../components/Seo';

export function WishlistPage() {
  const queryClient = useQueryClient();
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['wishlist'],
    queryFn: wishlistApi.list,
  });

  const removeMutation = useMutation({
    mutationFn: (productId: string) => wishlistApi.remove(productId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wishlist'] }),
  });

  return (
    <div className="container-app py-8">
      <Seo title="Your Wishlist" noindex />
      <PageHeader title="Your wishlist" subtitle={products.length ? `${products.length} saved item${products.length === 1 ? '' : 's'}` : undefined} />

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
                onClick={() => removeMutation.mutate(p.id)}
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
