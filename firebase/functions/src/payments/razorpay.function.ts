import { onCall, onRequest, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin';
import { razorpayKeyIdSecret, razorpayKeySecretSecret, razorpayWebhookSecretSecret } from '../config/environment';
import { requireAuthenticatedCaller, requirePermission } from '../shared/auth';
import { parseInput } from '../shared/validation';
import { AppError, NotFoundError, BadRequestError } from '../shared/errors';
import { logger } from '../shared/logger';
import { verifyPaymentSignature, verifyWebhookSignature, deriveWebhookEventId, type RazorpayWebhookEnvelope } from './razorpay.logic';
import { createRealRazorpayClient, type RazorpayClient } from './razorpayClient';
import type { FirestorePaymentRecordDoc } from '../orders/orders.types';

/**
 * Razorpay verify/webhook/refund Functions, migration Phase 5. `createOrder`
 * and `createRazorpayOrder` (the order-creation-time and retry-payment
 * paths) live in `orders/orders.function.ts` since they're inseparable
 * from an existing, owned order — see that file's header comment for why
 * there is no bare "create a Razorpay order for an arbitrary amount"
 * endpoint (that would be an unauthenticated-amount injection point).
 *
 * The webhook is deliberately an `onRequest` HTTPS Function, not a
 * Callable — Callable Functions wrap every request in Firebase's own
 * envelope and cannot receive Razorpay's raw signed POST body, which the
 * signature verification requires byte-for-byte (audit §14). No
 * `request.auth` exists for a webhook call; authenticity comes entirely
 * from the HMAC signature over the raw body.
 */

function paymentRecordsCollection() {
  return db.collection('paymentRecords');
}
function ordersCollection() {
  return db.collection('orders');
}

let razorpayClientOverride: RazorpayClient | null = null;
/** Test-only seam — never called from production code. */
export function __setRazorpayClientForTests(client: RazorpayClient | null): void {
  razorpayClientOverride = client;
}

function getRazorpayClient(keyId: string, keySecret: string): RazorpayClient {
  if (razorpayClientOverride) return razorpayClientOverride;
  return createRealRazorpayClient(keyId, keySecret);
}

const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const verifyRazorpayPayment = onCall({ secrets: [razorpayKeySecretSecret] }, async (request: CallableRequest) => {
  try {
    const caller = requireAuthenticatedCaller(request);
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = parseInput(verifyPaymentSchema, request.data);

    const querySnap = await paymentRecordsCollection().where('razorpayOrderId', '==', razorpayOrderId).limit(1).get();
    if (querySnap.empty) throw new NotFoundError('Payment not found');
    const paymentDoc = querySnap.docs[0];
    const payment = paymentDoc.data() as FirestorePaymentRecordDoc;
    if (payment.userId !== caller.uid) throw new NotFoundError('Payment not found');

    const valid = verifyPaymentSignature(razorpayKeySecretSecret.value(), razorpayOrderId, razorpayPaymentId, razorpaySignature);
    const now = FieldValue.serverTimestamp();
    if (!valid) {
      await paymentDoc.ref.update({ status: 'FAILED', updatedAt: now });
      throw new BadRequestError('Payment verification failed');
    }

    await db.runTransaction(async (tx) => {
      tx.update(paymentDoc.ref, { status: 'PAID', razorpayPaymentId, razorpaySignature, paidAt: now, updatedAt: now });
      tx.update(ordersCollection().doc(payment.orderId), { paymentStatus: 'PAID', updatedAt: now });
    });

    return { verified: true };
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

/**
 * Marks a webhook delivery as processed exactly once. `.create()` throws
 * if the doc already exists, so a redelivered event (Razorpay retries on
 * timeout/non-200) is detected atomically without a separate
 * read-then-write race window, and the handler returns early — this is
 * the idempotency guard the existing Express webhook is missing on its
 * `refund.processed` branch (a known gap flagged in the Phase 5 research;
 * fixed here for all three event types, not just the ones Express already
 * guards).
 */
async function handleWebhookEventIdempotently(eventId: string, fn: () => Promise<void>): Promise<boolean> {
  const ref = db.collection('webhookEvents').doc(eventId);
  try {
    await ref.create({ processedAt: FieldValue.serverTimestamp() });
  } catch {
    return false; // already processed
  }
  await fn();
  return true;
}

export async function processRazorpayWebhookEvent(payload: RazorpayWebhookEnvelope): Promise<void> {
  const now = FieldValue.serverTimestamp();

  if (payload.event === 'payment.captured') {
    const entity = payload.payload.payment?.entity;
    if (!entity) return;
    const querySnap = await paymentRecordsCollection().where('razorpayOrderId', '==', entity.order_id).limit(1).get();
    if (querySnap.empty) return;
    const paymentDoc = querySnap.docs[0];
    const payment = paymentDoc.data() as FirestorePaymentRecordDoc;
    if (payment.status === 'PAID') return; // already settled via the client-side verify call
    await db.runTransaction(async (tx) => {
      tx.update(paymentDoc.ref, { status: 'PAID', razorpayPaymentId: entity.id, paidAt: now, updatedAt: now });
      tx.update(ordersCollection().doc(payment.orderId), { paymentStatus: 'PAID', updatedAt: now });
    });
    return;
  }

  if (payload.event === 'payment.failed') {
    const entity = payload.payload.payment?.entity;
    if (!entity) return;
    const querySnap = await paymentRecordsCollection().where('razorpayOrderId', '==', entity.order_id).limit(1).get();
    if (querySnap.empty) return;
    await querySnap.docs[0].ref.update({ status: 'FAILED', updatedAt: now });
    return;
  }

  if (payload.event === 'refund.processed') {
    const entity = payload.payload.refund?.entity;
    if (!entity) return;
    const querySnap = await paymentRecordsCollection().where('razorpayPaymentId', '==', entity.payment_id).limit(1).get();
    if (querySnap.empty) return;
    const paymentDoc = querySnap.docs[0];
    const payment = paymentDoc.data() as FirestorePaymentRecordDoc;
    const refundedAmountPaise = payment.refundedAmountPaise + entity.amount;
    const fullyRefunded = refundedAmountPaise >= payment.amountPaise;
    const status = fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await db.runTransaction(async (tx) => {
      tx.update(paymentDoc.ref, { status, refundedAmountPaise, refundId: entity.id, updatedAt: now });
      tx.update(ordersCollection().doc(payment.orderId), { paymentStatus: status, updatedAt: now });
    });
    return;
  }

  logger.debug('razorpayWebhook: ignoring unhandled event', { event: String(payload.event) });
}

export const razorpayWebhook = onRequest({ secrets: [razorpayWebhookSecretSecret] }, async (req, res) => {
  try {
    const signature = req.header('x-razorpay-signature');
    if (!signature) {
      res.status(400).json({ error: 'Missing signature' });
      return;
    }
    const rawBody = req.rawBody;
    if (!rawBody || !verifyWebhookSignature(razorpayWebhookSecretSecret.value(), rawBody, signature)) {
      res.status(400).json({ error: 'Invalid webhook signature' });
      return;
    }

    const payload = JSON.parse(rawBody.toString('utf8')) as RazorpayWebhookEnvelope;
    const eventId = deriveWebhookEventId(payload);
    await handleWebhookEventIdempotently(eventId, () => processRazorpayWebhookEvent(payload));

    res.status(200).json({ received: true });
  } catch (err) {
    logger.error('razorpayWebhook failed', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

const refundSchema = z.object({
  orderId: z.string().min(1),
  amountPaise: z.number().int().positive().nullish().transform((v) => v ?? null),
});

export const refundRazorpayPayment = onCall({ secrets: [razorpayKeyIdSecret, razorpayKeySecretSecret] }, async (request: CallableRequest) => {
  try {
    requirePermission(request, 'orders.manage');
    const { orderId, amountPaise } = parseInput(refundSchema, request.data);

    const paymentRef = paymentRecordsCollection().doc(orderId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) throw new NotFoundError('Payment not found');
    const payment = paymentSnap.data() as FirestorePaymentRecordDoc;
    if (payment.method !== 'RAZORPAY' || payment.status === 'PENDING' || !payment.razorpayPaymentId) {
      throw new BadRequestError('This payment cannot be refunded');
    }

    const refundAmountPaise = amountPaise ?? payment.amountPaise - payment.refundedAmountPaise;
    const client = getRazorpayClient(razorpayKeyIdSecret.value(), razorpayKeySecretSecret.value());
    const refund = await client.refund(payment.razorpayPaymentId, refundAmountPaise);

    const newRefundedAmountPaise = payment.refundedAmountPaise + refundAmountPaise;
    const fullyRefunded = newRefundedAmountPaise >= payment.amountPaise;
    const status = fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    const now = FieldValue.serverTimestamp();
    await db.runTransaction(async (tx) => {
      tx.update(paymentRef, { status, refundedAmountPaise: newRefundedAmountPaise, refundId: refund.id, updatedAt: now });
      tx.update(ordersCollection().doc(orderId), { paymentStatus: status, updatedAt: now });
    });

    return { refunded: true, refundId: refund.id };
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});
