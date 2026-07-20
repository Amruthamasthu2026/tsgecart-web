import { collection, doc, getDocs, orderBy, query, updateDoc, writeBatch } from 'firebase/firestore';
import { firebaseFirestore } from '../lib/firebase';
import type { Notification } from '../features/notifications/notifications.api';

/**
 * Firestore-backed notifications service — added ALONGSIDE
 * `features/notifications/notifications.api.ts` (untouched). List and
 * mark-read are DIRECT client Firestore operations (owner-only Security
 * Rule, mark-read scoped to only the `isRead` field) — there is no
 * Callable for either, matching `firebaseWishlist.ts`'s pattern (no
 * authoritative computation involved). Creating a notification is
 * Function-only (`sendNotification`, admin-gated) — this service has no
 * "create" method, matching how a customer never composes their own
 * notifications in the existing Express app either.
 *
 * See `VITE_USE_FIRESTORE_NOTIFICATIONS` (frontend/.env.example).
 */

interface FirestoreNotificationDoc {
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: { toDate(): Date };
}

function toLegacyNotification(id: string, data: FirestoreNotificationDoc): Notification {
  return {
    id,
    type: data.type,
    title: data.title,
    body: data.body,
    link: data.link,
    isRead: data.isRead,
    createdAt: data.createdAt.toDate().toISOString(),
  };
}

export const firebaseNotificationsApi = {
  async list(uid: string): Promise<{ notifications: Notification[]; unread: number }> {
    const snap = await getDocs(
      query(collection(firebaseFirestore, 'notifications', uid, 'items'), orderBy('createdAt', 'desc')),
    );
    const notifications = snap.docs.map((d) => toLegacyNotification(d.id, d.data() as FirestoreNotificationDoc));
    return { notifications, unread: notifications.filter((n) => !n.isRead).length };
  },

  async markRead(uid: string, id: string): Promise<void> {
    await updateDoc(doc(firebaseFirestore, 'notifications', uid, 'items', id), { isRead: true });
  },

  async markAllRead(uid: string): Promise<void> {
    const snap = await getDocs(
      query(collection(firebaseFirestore, 'notifications', uid, 'items')),
    );
    const unread = snap.docs.filter((d) => !(d.data() as FirestoreNotificationDoc).isRead);
    if (unread.length === 0) return;
    const batch = writeBatch(firebaseFirestore);
    for (const d of unread) batch.update(d.ref, { isRead: true });
    await batch.commit();
  },
};

/** True when notifications should read/write Firestore instead of the Express API. */
export const useFirestoreNotifications = import.meta.env.VITE_USE_FIRESTORE_NOTIFICATIONS === 'true';
