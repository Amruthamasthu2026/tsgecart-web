import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { catalogApi } from '../../features/catalog/catalog.api';
import { ProductCard } from '../../components/product/ProductCard';

const ETAS = [
  { label: '10–20 min', desc: 'Nearby essentials' },
  { label: '20–30 min', desc: 'Full grocery run' },
  { label: '30–45 min', desc: 'Bulk & fresh produce' },
];

export function HomePage() {
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => catalogApi.listCategories(),
  });

  const { data: featured } = useQuery({
    queryKey: ['products', 'featured'],
    queryFn: () => catalogApi.listProducts({ featured: true, limit: 12 }),
  });

  return (
    <div className="container-app py-8">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl bg-brand p-8 sm:p-12"
      >
        <div className="max-w-xl">
          <span className="inline-block rounded-full bg-ink px-3 py-1 text-xs font-semibold text-brand">
            Delivering in Hyderabad
          </span>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight text-ink sm:text-5xl">
            Fresh Groceries
            <br />
            Delivered Fast
          </h1>
          <p className="mt-4 text-ink/80">
            Fruits, vegetables, dairy and daily essentials at your door in minutes.
          </p>
          <Link to="/products" className="btn-dark mt-6 inline-flex">
            Start shopping
          </Link>
        </div>
      </motion.section>

      {/* Delivery ETAs */}
      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {ETAS.map((eta) => (
          <div key={eta.label} className="card p-5">
            <p className="text-2xl font-extrabold text-brand-600">{eta.label}</p>
            <p className="mt-1 text-sm text-ink-muted">{eta.desc}</p>
          </div>
        ))}
      </section>

      {/* Category grid */}
      {categories.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">Shop by category</h2>
            <Link to="/products" className="text-sm font-medium text-brand-700 hover:underline">
              View all
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                to={`/products?category=${cat.slug}`}
                className="card flex h-28 flex-col items-start justify-end p-4 transition-transform hover:-translate-y-1"
              >
                <span className="text-sm font-semibold">{cat.name}</span>
                {cat._count && (
                  <span className="text-xs text-ink-muted">{cat._count.products} items</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured products */}
      {featured && featured.products.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-bold">Featured today</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {featured.products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
