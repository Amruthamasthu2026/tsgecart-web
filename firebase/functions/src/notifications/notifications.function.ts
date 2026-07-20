import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { db, auth } from '../config/firebaseAdmin';
import { requirePermission } from '../shared/auth';
import { parseInput } from '../shared/validation';
import { AppError, NotFoundError } from '../shared/errors';
import type { FirestoreNotificationDoc } from './notifications.types';

/**
 * Admin-composed notification send, migration Phase 6. Reading a user's
 * own notifications and marking them read is a DIRECT client Firestore
 * operation (owner-only Security Rule, see notifications.types.ts) — no
 * Callable needed for that half. Creating one is Function-only, gated by
 * the `notifications.manage` permission (a new key, since Express has no
 * admin "send notification" endpoint to inherit a permission string
 * from — see the Phase 6 completion report).
 */

const sendNotificationSchema = z.object({
  targetUid: z.string().min(1),
  type: z.enum(['SYSTEM', 'ORDER', 'PROMO']).default('SYSTEM'),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  link: z.string().max(300).nullish().transform((v) => v ?? null),
});

export const sendNotification = onCall(async (request: CallableRequest) => {
  try {
    requirePermission(request, 'notifications.manage');
    const { targetUid, type, title, body, link } = parseInput(sendNotificationSchema, request.data);

    // Confirms the target uid actually exists before writing — a plain
    // typo'd uid would otherwise silently create an orphaned doc no one
    // can ever read (Rules scope reads to `request.auth.uid == uid`).
    try {
      await auth.getUser(targetUid);
    } catch {
      throw new NotFoundError('Target user not found');
    }

    const doc: FirestoreNotificationDoc = { type, title, body, link, isRead: false, createdAt: FieldValue.serverTimestamp() as never };
    const ref = await db.collection('notifications').doc(targetUid).collection('items').add(doc);
    return { id: ref.id };
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});
