import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { wishlistApi } from '../../features/wishlist/wishlist.api';
import { ProductCard } from '../../components/product/ProductCard';

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
      <h1 className="text-2xl font-extrabold">Your wishlist</h1>

      {isLoading ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[3/4] w-full" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-5xl">💛</p>
          <p className="mt-4 text-ink-muted">Your wishlist is empty.</p>
          <Link to="/products" className="btn-primary mt-6 inline-flex">
            Discover products
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <div key={p.id} className="relative">
              <button
                onClick={() => removeMutation.mutate(p.id)}
                className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-sm shadow-card"
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
