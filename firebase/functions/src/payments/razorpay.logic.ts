import { createHmac } from 'node:crypto';

/**
 * Pure Razorpay signature crypto, mirroring
 * `backend/src/config/razorpay.ts` exactly (same HMAC-SHA256 algorithms,
 * same field concatenation for the checkout signature, same raw-body
 * signing for the webhook signature, same manual constant-time compare).
 * Kept side-effect-free and dependency-free (no `razorpay` SDK import
 * here) so it's unit-testable with fixed vectors, independent of network
 * access or secrets.
 */

export function computeHmacHex(secret: string, payload: string | Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Verifies the checkout-popup signature returned to the client after a successful payment. */
export function verifyPaymentSignature(
  keySecret: string,
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string,
): boolean {
  const expected = computeHmacHex(keySecret, `${razorpayOrderId}|${razorpayPaymentId}`);
  return timingSafeEqualHex(expected, signature);
}

/** Verifies a webhook payload signature against the exact raw request body bytes. */
export function verifyWebhookSignature(webhookSecret: string, rawBody: string | Buffer, signature: string): boolean {
  const expected = computeHmacHex(webhookSecret, rawBody);
  return timingSafeEqualHex(expected, signature);
}

export interface RazorpayOrderRequest {
  amountPaise: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrderRequestBody {
  amount: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}

/** Firestore amounts are already integer paise (Razorpay's native minor unit) — no rupee conversion needed. */
export function buildRazorpayOrderRequestBody(req: RazorpayOrderRequest): RazorpayOrderRequestBody {
  return {
    amount: Math.round(req.amountPaise),
    currency: req.currency ?? 'INR',
    receipt: req.receipt,
    notes: req.notes ?? {},
  };
}

export interface RazorpayWebhookEnvelope {
  event: string;
  payload: {
    payment?: { entity: { id: string; order_id: string; amount: number } };
    refund?: { entity: { id: string; payment_id: string; amount: number } };
  };
}

/**
 * A stable dedup key per distinct webhook delivery, derived from the body
 * itself (Razorpay does not guarantee an `x-razorpay-event-id` header
 * across all account/API versions). `${event}:${entityId}` — using the
 * refund's OWN id (not the payment id) for `refund.processed` is
 * deliberate: it lets multiple distinct partial refunds on the same
 * payment each process exactly once, while still blocking an exact
 * redelivery of the same refund event.
 */
export function deriveWebhookEventId(payload: RazorpayWebhookEnvelope): string {
  const entityId = payload.payload.payment?.entity.id ?? payload.payload.refund?.entity.id ?? 'unknown';
  return `${payload.event}:${entityId}`;
}
