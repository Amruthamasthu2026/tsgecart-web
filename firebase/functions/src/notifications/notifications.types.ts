import type { Timestamp } from 'firebase-admin/firestore';

/**
 * `notifications/{uid}/items/{notificationId}` — per-user subcollection,
 * auto-ID. Matches the Phase 1 draft placeholder in firestore.rules
 * exactly: owner-only read, owner may update ONLY `isRead` directly
 * (no cross-document invariant to protect, so a client write is safe for
 * that one field), create/delete are Function-only (see
 * notifications.function.ts's `sendNotification`, migration Phase 6).
 *
 * Unlike the existing Express `Notification` model, this migration does
 * NOT wire automatic notification creation into the existing order
 * Functions (`createOrder`/`adminUpdateOrderStatus` from Phase 5) — doing
 * so would mean modifying previously-completed phases, which Phase 6's
 * own instructions explicitly rule out ("Do NOT restart or redesign
 * anything from previous phases"). `sendNotification` is a standalone
 * admin-composed capability instead; see the Phase 6 completion report.
 */
export type NotificationType = 'SYSTEM' | 'ORDER' | 'PROMO';

export interface FirestoreNotificationDoc {
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: Timestamp;
}

export interface NotificationResponse extends Omit<FirestoreNotificationDoc, 'createdAt'> {
  id: string;
  createdAt: string;
}
