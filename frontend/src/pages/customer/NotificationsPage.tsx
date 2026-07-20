import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../../features/notifications/notifications.api';
import { useAuth } from '../../contexts/AuthContext';
import { useFirebaseAuth } from '../../contexts/FirebaseAuthContext';
import { firebaseNotificationsApi, useFirestoreNotifications } from '../../services/firebaseNotifications';
import { EmptyState } from '../../components/ui/EmptyState';
import { Seo } from '../../components/Seo';
import { formatDate } from '../../lib/format';

/**
 * Firestore notifications support, migration Phase 6: this page previously
 * relied entirely on the router's JWT-only `ProtectedRoute` — a
 * Firebase-only-authenticated visitor was redirected to `/login` before
 * ever reaching it. Fixed the same way as every other customer page in
 * this migration: moved out of `ProtectedRoute` in `app/router.tsx`, and
 * an internal sign-in guard now supports either auth system.
 */
export function NotificationsPage() {
  const { isAuthenticated } = useAuth();
  const { user: firebaseUser, isAuthenticated: isFirebaseAuthenticated } = useFirebaseAuth();
  const queryClient = useQueryClient();
  const signedIn = useFirestoreNotifications ? isFirebaseAuthenticated : isAuthenticated;
  const signInPath = useFirestoreNotifications ? '/firebase-auth/login' : '/login';

  const { data, isLoading } = useQuery({
    queryKey: useFirestoreNotifications ? ['firebase-notifications', firebaseUser?.uid] : ['notifications'],
    queryFn: () => (useFirestoreNotifications ? firebaseNotificationsApi.list(firebaseUser!.uid) : notificationsApi.list()),
    enabled: useFirestoreNotifications ? isFirebaseAuthenticated && !!firebaseUser : isAuthenticated,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: useFirestoreNotifications ? ['firebase-notifications'] : ['notifications'] });

  const markAll = useMutation({
    mutationFn: () => (useFirestoreNotifications ? firebaseNotificationsApi.markAllRead(firebaseUser!.uid) : notificationsApi.markAllRead()),
    onSuccess: invalidate,
  });
  const markOne = useMutation({
    mutationFn: (id: string) => (useFirestoreNotifications ? firebaseNotificationsApi.markRead(firebaseUser!.uid, id) : notificationsApi.markRead(id)),
    onSuccess: invalidate,
  });

  if (!signedIn) {
    return (
      <div className="container-app py-8">
        <EmptyState
          emoji="🔔"
          title="Sign in to view notifications"
          message="You need to be signed in to see your notifications."
          action={<Link to={signInPath} className="btn-primary">Sign in</Link>}
        />
      </div>
    );
  }

  return (
    <div className="container-app py-8">
      <Seo title="Notifications" noindex />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">Notifications</h1>
        {(data?.unread ?? 0) > 0 && (
          <button
            onClick={() => markAll.mutate()}
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>
      {useFirestoreNotifications && (
        <p className="mt-2 rounded-2xl bg-brand-50 px-4 py-2 text-xs font-medium text-ink">
          Loaded from Firestore (VITE_USE_FIRESTORE_NOTIFICATIONS).
        </p>
      )}

      {isLoading ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-16 w-full" />
          ))}
        </div>
      ) : !data || data.notifications.length === 0 ? (
        <EmptyState emoji="🔔" title="No notifications yet" message="Order updates and offers will appear here." />
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
