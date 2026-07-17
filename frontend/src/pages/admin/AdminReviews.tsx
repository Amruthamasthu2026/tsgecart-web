import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../features/admin/admin.api';
import { formatDate } from '../../lib/format';

export function AdminReviews() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const { data: reviews = [] } = useQuery({
    queryKey: ['admin-reviews', filter],
    queryFn: () => adminApi.listReviews(filter === 'pending' ? false : undefined),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, isApproved }: { id: string; isApproved: boolean }) =>
      adminApi.setReviewApproval(id, isApproved),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-reviews'] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteReview(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-reviews'] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Reviews</h1>
        <div className="flex gap-1 rounded-full bg-gray-100 p-1 text-sm">
          {(['pending', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 font-medium ${filter === f ? 'bg-white shadow-sm' : ''}`}
            >
              {f === 'pending' ? 'Pending' : 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {reviews.map((r: Record<string, unknown> & { id: string; isApproved: boolean }) => (
          <div key={r.id} className="rounded-2xl bg-white p-4 shadow-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold">
                  {(r.product as { name?: string })?.name} · {'⭐'.repeat(Number(r.rating))}
                </p>
                <p className="text-xs text-ink-muted">
                  {(r.user as { name?: string })?.name} · {formatDate(r.createdAt as string)}
                </p>
                {r.title ? <p className="mt-2 font-medium">{String(r.title)}</p> : null}
                {r.comment ? <p className="text-sm text-ink-muted">{String(r.comment)}</p> : null}
              </div>
              <div className="flex shrink-0 gap-2 text-sm">
                {!r.isApproved && (
                  <button
                    onClick={() => approveMutation.mutate({ id: r.id, isApproved: true })}
                    className="font-medium text-green-700 hover:underline"
                  >
                    Approve
                  </button>
                )}
                {r.isApproved && (
                  <button
                    onClick={() => approveMutation.mutate({ id: r.id, isApproved: false })}
                    className="font-medium text-amber-700 hover:underline"
                  >
                    Unapprove
                  </button>
                )}
                <button
                  onClick={() => deleteMutation.mutate(r.id)}
                  className="font-medium text-red-600 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {reviews.length === 0 && (
          <p className="rounded-2xl bg-white p-6 text-center text-ink-muted shadow-card">
            No reviews to show.
          </p>
        )}
      </div>
    </div>
  );
}
