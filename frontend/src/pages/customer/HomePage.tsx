import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { catalogApi } from '../../features/catalog/catalog.api';
import { discoveryApi, bannersApi } from '../../features/discovery/discovery.api';
import {
  firebaseProductsApi,
  useFirestoreProducts,
  toLegacyProduct,
  toLegacyCategory,
} from '../../services/firebaseProducts';
import { ProductCard } from '../../components/product/ProductCard';
import { Hero } from '../../components/home/Hero';
import { FeatureStrip } from '../../components/home/FeatureStrip';
import { Seo } from '../../components/Seo';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowRightIcon } from '../../components/ui/icons';
import type { Product } from '../../features/catalog/catalog.types';

function CardSkeletons({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton aspect-[3/4] w-full" />
      ))}
    </div>
  );
}

function ProductSection({
  title,
  subtitle,
  products,
  centered,
}: {
  title: string;
  subtitle?: string;
  products: Product[];
  centered?: boolean;
}) {
  if (products.length === 0) return null;
  return (
    <section className="container-app py-10">
      <div className={centered ? 'text-center' : 'flex items-center justify-between'}>
        <div>
          <h2 className="section-title">{title}</h2>
          {subtitle && <p className="mt-2 text-ink-muted">{subtitle}</p>}
        </div>
        {!centered && (
          <Link to="/products" className="hidden items-center gap-1 text-sm font-semibold text-ink hover:text-brand-700 sm:inline-flex">
            View all <ArrowRightIcon width={16} height={16} />
          </Link>
        )}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {products.slice(0, 10).map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}

export function HomePage() {
  const { isAuthenticated } = useAuth();

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', useFirestoreProducts],
    queryFn: async () =>
      useFirestoreProducts
        ? (await firebaseProductsApi.getCategories()).map(toLegacyCategory)
        : catalogApi.listCategories(),
  });
  const { data: featured, isLoading: featuredLoading } = useQuery({
    queryKey: ['products', 'featured', useFirestoreProducts],
    queryFn: async () =>
      useFirestoreProducts
        ? { products: (await firebaseProductsApi.getFeaturedProducts(12)).map(toLegacyProduct) }
        : catalogApi.listProducts({ featured: true, limit: 12 }),
  });
  const { data: bestsellers } = useQuery({
    queryKey: ['products', 'bestseller', useFirestoreProducts],
    queryFn: async () =>
      useFirestoreProducts
        ? {
            products: (await firebaseProductsApi.getProducts({ bestSeller: true, limit: 8 })).products.map(
              toLegacyProduct,
            ),
          }
        : catalogApi.listProducts({ bestSeller: true, limit: 8 }),
  });
  const { data: banners = [] } = useQuery({
    queryKey: ['banners', 'HOME_HERO'],
    queryFn: () => bannersApi.list('HOME_HERO'),
  });
  const { data: recommendations = [] } = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => discoveryApi.recommendations(),
  });
  const { data: recentlyViewed = [] } = useQuery({
    queryKey: ['recently-viewed'],
    queryFn: () => discoveryApi.recentlyViewed(),
    enabled: isAuthenticated,
  });
  // Fallback source so Trending Deals always populates from existing products,
  // even if none are flagged featured/bestseller. Read-only — never writes.
  const { data: latest } = useQuery({
    queryKey: ['products', 'latest-deals', useFirestoreProducts],
    queryFn: async () =>
      useFirestoreProducts
        ? {
            products: (
              await firebaseProductsApi.getProducts({ limit: 8, sort: 'createdAt', order: 'desc' })
            ).products.map(toLegacyProduct),
          }
        : catalogApi.listProducts({ limit: 8, sort: 'createdAt', order: 'desc' }),
  });

  const featuredProducts = featured?.products ?? [];
  // Trending Deals selection priority: bestSeller flag → featured flag →
  // safe selection of the newest active products returned by the API.
  const dealProducts = (
    bestsellers?.products?.length
      ? bestsellers.products
      : featuredProducts.length
        ? featuredProducts
        : (latest?.products ?? [])
  ).slice(0, 4);
  const heroBanner = banners[0];

  return (
    <div>
      <Seo
        title="Fresh Groceries Delivered Fast in Hyderabad"
        canonicalPath="/"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'TSG eCart',
          url: typeof window !== 'undefined' ? window.location.origin : '',
        }}
      />

      <Hero
        deals={dealProducts}
        heroImage={heroBanner?.imageUrl}
        heroLink={heroBanner?.linkUrl ?? undefined}
        badge="PREMIUM QUALITY"
        title={'Premium Dry Fruits\n& Healthy Oils'}
        description="Fresh, carefully selected products delivered across Hyderabad."
        ctaLabel="Shop Now"
        ctaTo="/products"
      />

      <FeatureStrip />

      {/* Featured products — light section */}
      <div className="bg-slate-50/70 py-2">
        {featuredLoading ? (
          <section className="container-app py-10 text-center">
            <h2 className="section-title">Featured products</h2>
            <p className="mt-2 text-ink-muted">Handpicked favorites from our collection</p>
            <div className="mt-6">
              <CardSkeletons />
            </div>
          </section>
        ) : (
          <ProductSection
            title="Featured products"
            subtitle="Handpicked favorites from our collection"
            products={featuredProducts}
            centered
          />
        )}
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="container-app py-10">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Shop by category</h2>
            <Link to="/products" className="hidden items-center gap-1 text-sm font-semibold text-ink hover:text-brand-700 sm:inline-flex">
              View all <ArrowRightIcon width={16} height={16} />
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                to={`/products?category=${cat.slug}`}
                className="card card-hover flex h-32 flex-col items-center justify-center gap-2 p-4 text-center"
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-100 text-2xl">
                  🛒
                </span>
                <span className="text-sm font-semibold text-ink">{cat.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <ProductSection title="Recently viewed" products={recentlyViewed} />
      <ProductSection title="Recommended for you" products={recommendations} />
    </div>
  );
}
