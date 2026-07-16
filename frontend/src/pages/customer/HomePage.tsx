import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';

interface HealthResponse {
  status: string;
  services: { database: string; redis: string };
}

const CATEGORIES = [
  'Fruits & Vegetables',
  'Dairy & Eggs',
  'Snacks',
  'Beverages',
  'Bakery',
  'Household',
  'Personal Care',
  'Baby Care',
];

const ETAS = [
  { label: '10–20 min', desc: 'Nearby essentials' },
  { label: '20–30 min', desc: 'Full grocery run' },
  { label: '30–45 min', desc: 'Bulk & fresh produce' },
];

export function HomePage() {
  // Phase 0 smoke check — confirms the SPA can reach the API.
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: HealthResponse }>('/health');
      return res.data.data;
    },
    retry: false,
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
          <button className="btn-dark mt-6">Start shopping</button>
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
      <section className="mt-10">
        <h2 className="mb-4 text-xl font-bold">Shop by category</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {CATEGORIES.map((cat) => (
            <div
              key={cat}
              className="card flex h-28 items-end p-4 transition-transform hover:-translate-y-1"
            >
              <span className="text-sm font-semibold">{cat}</span>
            </div>
          ))}
        </div>
      </section>

      {health && (
        <p className="mt-10 text-center text-xs text-ink-muted">
          API status: {health.status} · DB: {health.services.database} · Cache:{' '}
          {health.services.redis}
        </p>
      )}
    </div>
  );
}
