import { useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { catalogApi, type ProductFilters } from '../../features/catalog/catalog.api';
import { ProductCard } from '../../components/product/ProductCard';
import { Seo } from '../../components/Seo';

const SORTS: Array<{ label: string; sort: ProductFilters['sort']; order: ProductFilters['order'] }> = [
  { label: 'Newest', sort: 'createdAt', order: 'desc' },
  { label: 'Name: A–Z', sort: 'name', order: 'asc' },
  { label: 'Top rated', sort: 'ratingAvg', order: 'desc' },
];

export function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? undefined;
  const search = params.get('search') ?? undefined;
  const sortKey = params.get('sort') ?? 'createdAt';
  const order = (params.get('order') as 'asc' | 'desc') ?? 'desc';
  const page = Number(params.get('page') ?? '1');

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => catalogApi.listCategories(),
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['products', { category, search, sortKey, order, page }],
    queryFn: () =>
      catalogApi.listProducts({
        category,
        search,
        sort: sortKey as ProductFilters['sort'],
        order,
        page,
        limit: 24,
      }),
    placeholderData: keepPreviousData,
  });

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    });
    next.delete('page');
    setParams(next);
  };

  const pageTitle = search
    ? `Search: ${search}`
    : category
      ? `${category.replace(/-/g, ' ')} · Groceries`
      : 'All products';

  return (
    <div className="container-app py-8">
      <Seo
        title={pageTitle}
        description="Browse fresh groceries, fruits, vegetables, dairy and daily essentials on TSG eCart."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">
          {search ? `Results for "${search}"` : category ? category.replace(/-/g, ' ') : 'All products'}
        </h1>
        <select
          value={`${sortKey}:${order}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split(':');
            update({ sort: s, order: o });
          }}
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm"
        >
          {SORTS.map((s) => (
            <option key={s.label} value={`${s.sort}:${s.order}`}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[220px_1fr]">
        {/* Category sidebar */}
        <aside className="hidden lg:block">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-muted">
            Categories
          </h2>
          <ul className="space-y-1">
            <li>
              <button
                onClick={() => update({ category: undefined })}
                className={`w-full rounded-lg px-3 py-1.5 text-left text-sm ${!category ? 'bg-brand-50 font-semibold' : 'hover:bg-gray-50'}`}
              >
                All
              </button>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => update({ category: c.slug })}
                  className={`w-full rounded-lg px-3 py-1.5 text-left text-sm ${category === c.slug ? 'bg-brand-50 font-semibold' : 'hover:bg-gray-50'}`}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Product grid */}
        <div>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton aspect-[3/4] w-full" />
              ))}
            </div>
          ) : isError ? (
            <p className="text-ink-muted">Couldn't load products. Please try again.</p>
          ) : data && data.products.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {data.products.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              {data.meta.totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  <button
                    disabled={!data.meta.hasPrev}
                    onClick={() => setParams((p) => {
                      p.set('page', String(page - 1));
                      return p;
                    })}
                    className="btn-ghost disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-ink-muted">
                    Page {data.meta.page} of {data.meta.totalPages}
                  </span>
                  <button
                    disabled={!data.meta.hasNext}
                    onClick={() => setParams((p) => {
                      p.set('page', String(page + 1));
                      return p;
                    })}
                    className="btn-ghost disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-ink-muted">No products found.</p>
          )}
        </div>
      </div>
    </div>
  );
}
