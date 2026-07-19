import { describe, it, expect } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { verifyRazorpayPayment, refundRazorpayPayment } from '../../src/payments/razorpay.function';

function fakeRequest(auth: { uid: string; token: Record<string, unknown> } | undefined, data?: unknown): CallableRequest {
  return { data, auth } as unknown as CallableRequest;
}

function fakeReqRes(headers: Record<string, string>, rawBody: Buffer) {
  const status = { code: 0, body: undefined as unknown };
  const req = {
    header: (name: string) => headers[name.toLowerCase()],
    rawBody,
  };
  const res = {
    status(code: number) {
      status.code = code;
      return this;
    },
    json(body: unknown) {
      status.body = body;
      return this;
    },
  };
  return { req, res, status };
}

describe('verifyRazorpayPayment', () => {
  it('rejects an unauthenticated caller', async () => {
    await expect(
      verifyRazorpayPayment.run(
        fakeRequest(undefined, { razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', razorpaySignature: 'sig' }),
      ),
    ).rejects.toBeInstanceOf(HttpsError);
  });

  it('rejects a missing razorpaySignature with invalid-argument', async () => {
    try {
      await verifyRazorpayPayment.run(
        fakeRequest({ uid: 'u1', token: {} }, { razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1' }),
      );
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });
});

describe('refundRazorpayPayment', () => {
  it('rejects an unauthenticated caller with unauthenticated', async () => {
    try {
      await refundRazorpayPayment.run(fakeRequest(undefined, { orderId: 'TSG-260719-00000001' }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('unauthenticated');
    }
  });

  it('rejects a signed-in customer without orders.manage with permission-denied', async () => {
    try {
      await refundRazorpayPayment.run(
        fakeRequest({ uid: 'u1', token: { role: 'CUSTOMER' } }, { orderId: 'TSG-260719-00000001' }),
      );
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('permission-denied');
    }
  });

  it('rejects a non-positive amountPaise with invalid-argument (even for an authorized admin)', async () => {
    try {
      await refundRazorpayPayment.run(
        fakeRequest({ uid: 'admin-1', token: { role: 'ADMIN' } }, { orderId: 'TSG-260719-00000001', amountPaise: 0 }),
      );
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });
});

describe('razorpayWebhook — signature guard (short-circuits before any Firestore read)', () => {
  it('returns 400 when the x-razorpay-signature header is missing', async () => {
    const { razorpayWebhook } = await import('../../src/payments/razorpay.function');
    const { req, res, status } = fakeReqRes({}, Buffer.from('{}'));
    await razorpayWebhook(req as never, res as never);
    expect(status.code).toBe(400);
  });

  it('returns 400 when the signature does not match the raw body', async () => {
    const { razorpayWebhook } = await import('../../src/payments/razorpay.function');
    const { req, res, status } = fakeReqRes(
      { 'x-razorpay-signature': 'not-a-real-signature' },
      Buffer.from(JSON.stringify({ event: 'payment.captured', payload: {} })),
    );
    await razorpayWebhook(req as never, res as never);
    expect(status.code).toBe(400);
  });
});
