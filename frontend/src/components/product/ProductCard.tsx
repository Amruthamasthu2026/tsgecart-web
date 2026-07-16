import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Product } from '../../features/catalog/catalog.types';
import { formatCurrency, discountPercent } from '../../lib/format';

interface ProductCardProps {
  product: Product;
  onAdd?: (product: Product) => void;
}

export function ProductCard({ product, onAdd }: ProductCardProps) {
  const variant = product.variants.find((v) => v.isDefault) ?? product.variants[0];
  const discount = variant ? discountPercent(variant.mrp, variant.price) : 0;
  const outOfStock = variant?.inventory ? variant.inventory.stock <= 0 : false;
  const image = product.images[0];

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="card flex flex-col overflow-hidden"
    >
      <Link to={`/products/${product.slug}`} className="relative block">
        <div className="aspect-square bg-gray-50">
          {image ? (
            <img
              src={image}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-4xl text-gray-200">🛒</div>
          )}
        </div>
        {discount > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-brand">
            {discount}% OFF
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-3">
        <Link to={`/products/${product.slug}`} className="line-clamp-2 text-sm font-semibold">
          {product.name}
        </Link>
        {variant && <p className="mt-0.5 text-xs text-ink-muted">{variant.unitLabel}</p>}

        <div className="mt-auto flex items-end justify-between pt-3">
          <div>
            {variant && (
              <>
                <span className="text-sm font-bold">{formatCurrency(variant.price)}</span>
                {discount > 0 && (
                  <span className="ml-1 text-xs text-ink-muted line-through">
                    {formatCurrency(variant.mrp)}
                  </span>
                )}
              </>
            )}
          </div>
          {onAdd ? (
            <button
              onClick={() => onAdd(product)}
              disabled={outOfStock}
              className="rounded-full border border-brand-500 bg-brand px-3 py-1 text-xs font-bold text-ink transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {outOfStock ? 'Out' : 'Add'}
            </button>
          ) : (
            <Link
              to={`/products/${product.slug}`}
              className="rounded-full border border-brand-500 bg-brand px-3 py-1 text-xs font-bold text-ink transition hover:bg-brand-600"
            >
              View
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  );
}
