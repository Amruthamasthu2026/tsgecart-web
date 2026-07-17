import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../features/admin/admin.api';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { extractApiError } from '../../lib/apiClient';

export function AdminBanners() {
  const queryClient = useQueryClient();
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [position, setPosition] = useState('HOME_HERO');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: banners = [] } = useQuery({ queryKey: ['admin-banners'], queryFn: adminApi.listBanners });

  const createMutation = useMutation({
    mutationFn: () => adminApi.createBanner({ imageUrl, linkUrl: linkUrl || undefined, position }),
    onSuccess: () => {
      setImageUrl('');
      setLinkUrl('');
      queryClient.invalidateQueries({ queryKey: ['admin-banners'] });
    },
    onError: (err) => setError(extractApiError(err)),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteBanner(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-banners'] }),
  });

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await adminApi.uploadImage(file, 'banners');
      setImageUrl(url);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Banners</h1>

      <div className="mt-4 grid gap-3 rounded-2xl bg-white p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Image</label>
          <input type="file" accept="image/*" onChange={onUpload} className="text-sm" />
          {uploading && <p className="text-xs text-ink-muted">Uploading…</p>}
          {imageUrl && <img src={imageUrl} alt="" className="mt-2 h-16 rounded-lg object-cover" />}
        </div>
        <TextField label="Link URL" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
        <div>
          <label className="mb-1.5 block text-sm font-medium">Position</label>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="w-full rounded-xl border border-black/10 px-4 py-2.5 text-sm"
          >
            <option value="HOME_HERO">Home hero</option>
            <option value="HOME_STRIP">Home strip</option>
            <option value="CATEGORY">Category</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button
            fullWidth
            isLoading={createMutation.isPending}
            disabled={!imageUrl}
            onClick={() => createMutation.mutate()}
          >
            Add banner
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {banners.map((b: Record<string, unknown> & { id: string }) => (
          <div key={b.id} className="overflow-hidden rounded-2xl bg-white shadow-card">
            <img src={b.imageUrl as string} alt="" className="h-32 w-full object-cover" />
            <div className="flex items-center justify-between p-3 text-sm">
              <span className="text-ink-muted">{String(b.position)}</span>
              <button
                onClick={() => deleteMutation.mutate(b.id)}
                className="font-medium text-red-600 hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {banners.length === 0 && <p className="text-ink-muted">No banners yet.</p>}
      </div>
    </div>
  );
}
