import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reviewsApi } from '../../features/discovery/discovery.api';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { extractApiError } from '../../lib/apiClient';

export function ReviewForm({ productId, slug }: { productId: string; slug: string }) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      reviewsApi.create({ productId, rating, title: title || undefined, comment: comment || undefined }),
    onSuccess: () => {
      setDone(true);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['product', slug] });
    },
    onError: (err) => setError(extractApiError(err)),
  });

  if (!isAuthenticated) return null;

  if (done) {
    return (
      <div className="card p-4 text-sm text-green-700">
        Thanks! Your review was submitted and will appear once approved.
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h3 className="text-base font-bold">Write a review</h3>
      <p className="mt-1 text-xs text-ink-muted">
        You can review products from your delivered orders.
      </p>
      <div className="mt-3 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setRating(n)}
            className={`text-2xl ${n <= rating ? 'opacity-100' : 'opacity-30'}`}
            aria-label={`${n} star`}
          >
            ⭐
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-3">
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div>
          <label className="mb-1.5 block text-sm font-medium">Your review</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-black/10 px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <Button isLoading={mutation.isPending} onClick={() => mutation.mutate()}>
          Submit review
        </Button>
      </div>
    </div>
  );
}
