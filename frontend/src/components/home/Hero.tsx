import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Product } from '../../features/catalog/catalog.types';
import { DealCard } from '../product/DealCard';
import { ArrowRightIcon } from '../ui/icons';

interface HeroProps {
  deals: Product[];
  heroImage?: string;
  heroLink?: string;
  badge?: string;
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaTo?: string;
}

export function Hero({
  deals,
  heroImage,
  heroLink,
  badge = 'PREMIUM QUALITY',
  title = 'Premium Dry Fruits\n& Healthy Oils',
  description = 'Fresh, carefully selected products delivered across Hyderabad.',
  ctaLabel = 'Shop Now',
  ctaTo = '/products',
}: HeroProps) {
  // When deals exist, the banner carries extra bottom space so the Trending
  // Deals card can overlap ~30–35% of the hero without a white gap.
  const bannerPadBottom = deals.length > 0 ? 'pb-28 sm:pb-40 lg:pb-48' : 'pb-14';

  const banner = (
    <div className="relative overflow-hidden rounded-b-[2.5rem] bg-ink">
      {heroImage ? (
        <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#2a2118] via-ink to-black" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-transparent" />

      <div className={`container-app relative flex min-h-[320px] flex-col justify-center pt-14 sm:min-h-[360px] ${bannerPadBottom}`}>
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-fit rounded-full bg-black/60 px-4 py-1.5 text-sm font-extrabold text-brand ring-1 ring-brand/40"
        >
          {badge}
        </motion.span>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="mt-4 whitespace-pre-line text-4xl font-black leading-[1.05] text-white sm:text-6xl"
        >
          {title}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-4 max-w-md text-sm text-white/80 sm:text-base"
        >
          {description}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <Link to={ctaTo} className="btn-primary mt-6 w-fit">
            {ctaLabel}
            <ArrowRightIcon />
          </Link>
        </motion.div>
      </div>
    </div>
  );

  return (
    <section className="relative">
      {heroLink ? <Link to={heroLink}>{banner}</Link> : banner}

      {/* Trending Deals — overlaps ~30–35% of the hero bottom */}
      {deals.length > 0 && (
        <div className="container-app relative z-10 -mt-24 sm:-mt-36 lg:-mt-44">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-[2rem] bg-white p-5 shadow-card ring-1 ring-black/[0.04] sm:p-7"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-2xl font-extrabold text-ink sm:text-3xl">Trending Deals</h2>
              <Link to="/products" className="btn-primary px-5 py-2.5 text-sm">
                Explore More
                <ArrowRightIcon />
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {deals.slice(0, 4).map((p, i) => (
                <DealCard key={p.id} product={p} index={i} />
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </section>
  );
}
