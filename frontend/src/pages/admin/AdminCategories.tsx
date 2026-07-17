import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { catalogApi } from '../../features/catalog/catalog.api';
import { adminApi } from '../../features/admin/admin.api';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { extractApiError } from '../../lib/apiClient';

export function AdminCategories() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => catalogApi.listCategories(),
  });

  const createMutation = useMutation({
    mutationFn: () => adminApi.createCategory({ name }),
    onSuccess: () => {
      setName('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err) => setError(extractApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteCategory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-categories'] }),
    onError: (err) => setError(extractApiError(err)),
  });

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Categories</h1>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="w-64">
          <TextField label="New category" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button
          isLoading={createMutation.isPending}
          disabled={name.trim().length < 2}
          onClick={() => createMutation.mutate()}
        >
          Add
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-card">
            <div>
              <p className="font-semibold">{c.name}</p>
              <p className="text-xs text-ink-muted">{c._count?.products ?? 0} products</p>
            </div>
            <button
              onClick={() => deleteMutation.mutate(c.id)}
              className="text-sm font-medium text-red-600 hover:underline"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
