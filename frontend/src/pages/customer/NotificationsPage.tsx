import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../../features/notifications/notifications.api';
import { formatDate } from '../../lib/format';

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
  });

  const markAll = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markOne = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <div className="container-app py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Notifications</h1>
        {(data?.unread ?? 0) > 0 && (
          <button
            onClick={() => markAll.mutate()}
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-16 w-full" />
          ))}
        </div>
      ) : !data || data.notifications.length === 0 ? (
        <p className="mt-10 text-center text-ink-muted">You have no notifications.</p>
      ) : (
        <div className="mt-6 space-y-2">
          {data.notifications.map((n) => {
            const inner = (
              <div
                className={`card flex items-start justify-between gap-3 p-4 ${
                  n.isRead ? 'opacity-70' : 'ring-1 ring-brand-200'
                }`}
              >
                <div>
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="text-sm text-ink-muted">{n.body}</p>
                  <p className="mt-1 text-xs text-ink-muted">{formatDate(n.createdAt)}</p>
                </div>
                {!n.isRead && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" />}
              </div>
            );
            return n.link ? (
              <Link key={n.id} to={n.link} onClick={() => markOne.mutate(n.id)}>
                {inner}
              </Link>
            ) : (
              <button key={n.id} onClick={() => markOne.mutate(n.id)} className="block w-full text-left">
                {inner}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
