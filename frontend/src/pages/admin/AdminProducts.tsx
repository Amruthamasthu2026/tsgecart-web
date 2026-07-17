import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../features/admin/admin.api';
import { catalogApi } from '../../features/catalog/catalog.api';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { formatCurrency } from '../../lib/format';
import { extractApiError } from '../../lib/apiClient';

interface VariantDraft {
  sku: string;
  unitLabel: string;
  mrp: string;
  price: string;
  stock: string;
}

const emptyVariant: VariantDraft = { sku: '', unitLabel: '', mrp: '', price: '', stock: '0' };

export function AdminProducts() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [gstRate, setGstRate] = useState('0');
  const [images, setImages] = useState<string[]>([]);
  const [variants, setVariants] = useState<VariantDraft[]>([{ ...emptyVariant }]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: productData } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => adminApi.listProducts(),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => catalogApi.listCategories(),
  });

  const resetForm = () => {
    setName('');
    setCategoryId('');
    setDescription('');
    setGstRate('0');
    setImages([]);
    setVariants([{ ...emptyVariant }]);
    setError(null);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      adminApi.createProduct({
        name,
        categoryId,
        description: description || undefined,
        gstRate: Number(gstRate) || 0,
        images,
        variants: variants.map((v, i) => ({
          sku: v.sku,
          unitLabel: v.unitLabel,
          mrp: Number(v.mrp),
          price: Number(v.price),
          stock: Number(v.stock) || 0,
          isDefault: i === 0,
        })),
      }),
    onSuccess: () => {
      resetForm();
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    },
    onError: (err) => setError(extractApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteProduct(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-products'] }),
  });

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await adminApi.uploadImage(file, 'products');
      setImages((imgs) => [...imgs, url]);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setUploading(false);
    }
  };

  const setVariant = (i: number, key: keyof VariantDraft, value: string) =>
    setVariants((vs) => vs.map((v, idx) => (idx === i ? { ...v, [key]: value } : v)));

  const products = productData?.products ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Products</h1>
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Close' : 'New product'}</Button>
      </div>

      {showForm && (
        <div className="mt-4 space-y-3 rounded-2xl bg-white p-5 shadow-card">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <div>
              <label className="mb-1.5 block text-sm font-medium">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-xl border border-black/10 px-4 py-2.5 text-sm"
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-black/10 px-4 py-2.5 text-sm"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="GST %" type="number" value={gstRate} onChange={(e) => setGstRate(e.target.value)} />
            <div>
              <label className="mb-1.5 block text-sm font-medium">Images</label>
              <input type="file" accept="image/*" onChange={onUpload} className="text-sm" />
              {uploading && <span className="text-xs text-ink-muted">Uploading…</span>}
              <div className="mt-2 flex gap-2">
                {images.map((img) => (
                  <img key={img} src={img} alt="" className="h-12 w-12 rounded-lg object-cover" />
                ))}
              </div>
            </div>
          </div>

          {/* Variants */}
          <div>
            <p className="mb-2 text-sm font-semibold">Variants</p>
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <input placeholder="SKU" value={v.sku} onChange={(e) => setVariant(i, 'sku', e.target.value)} className="rounded-lg border border-black/10 px-3 py-2 text-sm" />
                  <input placeholder="Unit (500 g)" value={v.unitLabel} onChange={(e) => setVariant(i, 'unitLabel', e.target.value)} className="rounded-lg border border-black/10 px-3 py-2 text-sm" />
                  <input placeholder="MRP" type="number" value={v.mrp} onChange={(e) => setVariant(i, 'mrp', e.target.value)} className="rounded-lg border border-black/10 px-3 py-2 text-sm" />
                  <input placeholder="Price" type="number" value={v.price} onChange={(e) => setVariant(i, 'price', e.target.value)} className="rounded-lg border border-black/10 px-3 py-2 text-sm" />
                  <input placeholder="Stock" type="number" value={v.stock} onChange={(e) => setVariant(i, 'stock', e.target.value)} className="rounded-lg border border-black/10 px-3 py-2 text-sm" />
                </div>
              ))}
            </div>
            <button
              onClick={() => setVariants((vs) => [...vs, { ...emptyVariant }])}
              className="mt-2 text-sm font-medium text-brand-700 hover:underline"
            >
              + Add variant
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            isLoading={createMutation.isPending}
            disabled={!name || !categoryId || variants.some((v) => !v.sku || !v.price)}
            onClick={() => createMutation.mutate()}
          >
            Create product
          </Button>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-black/5 text-left text-ink-muted">
            <tr>
              <th className="p-3">Product</th>
              <th className="p-3">Category</th>
              <th className="p-3">Variants</th>
              <th className="p-3">From</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p: Record<string, unknown> & { id: string }) => {
              const vs = (p.variants as Array<{ price: string }>) ?? [];
              const min = vs.length ? Math.min(...vs.map((v) => Number(v.price))) : 0;
              return (
                <tr key={p.id} className="border-b border-black/5">
                  <td className="p-3 font-semibold">{String(p.name)}</td>
                  <td className="p-3">{(p.category as { name?: string })?.name ?? '—'}</td>
                  <td className="p-3">{vs.length}</td>
                  <td className="p-3">{formatCurrency(min)}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => deleteMutation.mutate(p.id)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {products.length === 0 && <p className="p-6 text-center text-ink-muted">No products yet.</p>}
      </div>
    </div>
  );
}
