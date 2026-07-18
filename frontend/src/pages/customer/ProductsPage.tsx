import { useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { catalogApi, type ProductFilters } from '../../features/catalog/catalog.api';
import { ProductCard } from '../../components/product/ProductCard';
import { Seo } from '../../components/Seo';
import { EmptyState } from '../../components/ui/EmptyState';
import { Link } from 'react-router-dom';
import {
  firebaseProductsApi,
  useFirestoreProducts,
  toLegacyProduct,
  toLegacyCategory,
  toLegacyPagination,
  type FirestoreProductFilters,
} from '../../services/firebaseProducts';

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
    queryKey: ['categories', useFirestoreProducts],
    queryFn: async () =>
      useFirestoreProducts
        ? (await firebaseProductsApi.getCategories()).map(toLegacyCategory)
        : catalogApi.listCategories(),
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['products', { category, search, sortKey, order, page }, useFirestoreProducts],
    queryFn: async () => {
      if (useFirestoreProducts) {
        const result = await firebaseProductsApi.getProducts({
          categorySlug: category,
          search,
          sort: sortKey as FirestoreProductFilters['sort'],
          order,
          page,
          limit: 24,
        });
        return { products: result.products.map(toLegacyProduct), meta: toLegacyPagination(result.meta) };
      }
      return catalogApi.listProducts({
        category,
        search,
        sort: sortKey as ProductFilters['sort'],
        order,
        page,
        limit: 24,
      });
    },
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

  const heading = search
    ? `Results for “${search}”`
    : category
      ? category.replace(/-/g, ' ')
      : 'All products';
  const total = data?.meta.total ?? 0;

  return (
    <div className="container-app py-8">
      <Seo
        title={search ? `Search: ${search}` : category ? `${category.replace(/-/g, ' ')} · Groceries` : 'All products'}
        description="Browse fresh groceries, fruits, vegetables, dairy and daily essentials on TSG eCart."
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold capitalize text-ink sm:text-3xl">{heading}</h1>
          {!isLoading && <p className="mt-1 text-sm text-ink-muted">{total} product{total === 1 ? '' : 's'} found</p>}
        </div>
        <select
          value={`${sortKey}:${order}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split(':');
            update({ sort: s, order: o });
          }}
          className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
        >
          {SORTS.map((s) => (
            <option key={s.label} value={`${s.sort}:${s.order}`}>
              Sort: {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Category chips (mobile + as quick filters) */}
      <div className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        <button
          onClick={() => update({ category: undefined })}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${!category ? 'bg-brand text-ink' : 'bg-slate-100 text-ink-muted'}`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => update({ category: c.slug })}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${category === c.slug ? 'bg-brand text-ink' : 'bg-slate-100 text-ink-muted'}`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[220px_1fr]">
        {/* Category sidebar (desktop) */}
        <aside className="hidden lg:block">
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-muted">Categories</h2>
            <ul className="space-y-1">
              <li>
                <button
                  onClick={() => update({ category: undefined })}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${!category ? 'bg-brand-100 font-semibold text-ink' : 'text-ink-muted hover:bg-slate-50'}`}
                >
                  All products
                </button>
              </li>
              {categories.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => update({ category: c.slug })}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${category === c.slug ? 'bg-brand-100 font-semibold text-ink' : 'text-ink-muted hover:bg-slate-50'}`}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
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
            <EmptyState
              emoji="⚠️"
              title="Couldn't load products"
              message="Something went wrong. Please refresh and try again."
            />
          ) : data && data.products.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {data.products.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              {data.meta.totalPages > 1 && (
                <div className="mt-10 flex items-center justify-center gap-3">
                  <button
                    disabled={!data.meta.hasPrev}
                    onClick={() => setParams((p) => { p.set('page', String(page - 1)); return p; })}
                    className="btn-ghost px-5 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-sm font-medium text-ink-muted">
                    Page {data.meta.page} of {data.meta.totalPages}
                  </span>
                  <button
                    disabled={!data.meta.hasNext}
                    onClick={() => setParams((p) => { p.set('page', String(page + 1)); return p; })}
                    className="btn-ghost px-5 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              emoji="🔍"
              title="No products found"
              message={search ? `We couldn't find anything for “${search}”.` : 'Try a different category.'}
              action={<Link to="/products" className="btn-primary">Browse all products</Link>}
            />
          )}
        </div>
      </div>
    </div>
  );
}
