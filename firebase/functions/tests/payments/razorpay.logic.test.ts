import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  computeHmacHex,
  timingSafeEqualHex,
  verifyPaymentSignature,
  verifyWebhookSignature,
  buildRazorpayOrderRequestBody,
  deriveWebhookEventId,
} from '../../src/payments/razorpay.logic';

describe('timingSafeEqualHex', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeEqualHex('abc123', 'abc123')).toBe(true);
  });

  it('returns false for different strings of the same length', () => {
    expect(timingSafeEqualHex('abc123', 'abc124')).toBe(false);
  });

  it('returns false for different-length strings without throwing', () => {
    expect(timingSafeEqualHex('abc', 'abcd')).toBe(false);
  });
});

describe('verifyPaymentSignature', () => {
  const secret = 'test_key_secret';
  const orderId = 'order_ABC123';
  const paymentId = 'pay_XYZ789';

  it('accepts a correctly-computed signature', () => {
    const validSignature = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
    expect(verifyPaymentSignature(secret, orderId, paymentId, validSignature)).toBe(true);
  });

  it('rejects a tampered signature', () => {
    expect(verifyPaymentSignature(secret, orderId, paymentId, 'not-a-real-signature')).toBe(false);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const wrongSecretSignature = createHmac('sha256', 'wrong_secret').update(`${orderId}|${paymentId}`).digest('hex');
    expect(verifyPaymentSignature(secret, orderId, paymentId, wrongSecretSignature)).toBe(false);
  });

  it('rejects a signature for a different payment id (replay across payments)', () => {
    const validSignature = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
    expect(verifyPaymentSignature(secret, orderId, 'pay_DIFFERENT', validSignature)).toBe(false);
  });
});

describe('verifyWebhookSignature', () => {
  const secret = 'webhook_secret';
  const rawBody = JSON.stringify({ event: 'payment.captured', payload: {} });

  it('accepts a signature computed over the exact raw body bytes', () => {
    const validSignature = createHmac('sha256', secret).update(rawBody).digest('hex');
    expect(verifyWebhookSignature(secret, rawBody, validSignature)).toBe(true);
  });

  it('rejects a signature if the body was altered by even one byte', () => {
    const validSignature = createHmac('sha256', secret).update(rawBody).digest('hex');
    expect(verifyWebhookSignature(secret, rawBody + ' ', validSignature)).toBe(false);
  });

  it('works identically against a Buffer as against the equivalent string', () => {
    const validSignature = createHmac('sha256', secret).update(Buffer.from(rawBody)).digest('hex');
    expect(verifyWebhookSignature(secret, Buffer.from(rawBody), validSignature)).toBe(true);
  });
});

describe('computeHmacHex', () => {
  it('is deterministic for the same secret + payload', () => {
    expect(computeHmacHex('s', 'p')).toBe(computeHmacHex('s', 'p'));
  });
});

describe('buildRazorpayOrderRequestBody', () => {
  it('passes amountPaise through unchanged (already Razorpay-native minor units)', () => {
    const body = buildRazorpayOrderRequestBody({ amountPaise: 12_345, receipt: 'TSG-260719-00000001' });
    expect(body.amount).toBe(12_345);
    expect(body.currency).toBe('INR');
    expect(body.receipt).toBe('TSG-260719-00000001');
    expect(body.notes).toEqual({});
  });

  it('rounds a fractional amount defensively', () => {
    const body = buildRazorpayOrderRequestBody({ amountPaise: 100.6, receipt: 'r' });
    expect(body.amount).toBe(101);
  });

  it('passes through custom notes and currency', () => {
    const body = buildRazorpayOrderRequestBody({ amountPaise: 100, receipt: 'r', currency: 'USD', notes: { orderId: 'o1' } });
    expect(body.currency).toBe('USD');
    expect(body.notes).toEqual({ orderId: 'o1' });
  });
});

describe('deriveWebhookEventId', () => {
  it('derives a stable id from the event type + payment entity id', () => {
    const id = deriveWebhookEventId({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 100 } } } });
    expect(id).toBe('payment.captured:pay_1');
  });

  it('derives a stable id from the event type + refund entity id (not the payment id)', () => {
    const id = deriveWebhookEventId({
      event: 'refund.processed',
      payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1', amount: 100 } } },
    });
    expect(id).toBe('refund.processed:rfnd_1');
  });

  it('produces distinct ids for two different partial refunds on the same payment', () => {
    const first = deriveWebhookEventId({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1', amount: 50 } } } });
    const second = deriveWebhookEventId({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_2', payment_id: 'pay_1', amount: 50 } } } });
    expect(first).not.toBe(second);
  });

  it('falls back to "unknown" when neither payment nor refund entity is present', () => {
    expect(deriveWebhookEventId({ event: 'some.other.event', payload: {} })).toBe('some.other.event:unknown');
  });
});
