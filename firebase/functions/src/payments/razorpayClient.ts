import Razorpay from 'razorpay';

/**
 * Thin, injectable wrapper around the `razorpay` SDK (same package/version
 * family already used by `backend/src/config/razorpay.ts`). Kept behind an
 * interface so `orders.function.ts`/`razorpay.function.ts` can be unit
 * tested against a fake client with no network access — only the real
 * implementation (`createRealRazorpayClient`) touches the actual Razorpay
 * REST API, and it is only ever constructed inside a Function handler
 * (after secrets have resolved), never at module load time.
 */
export interface RazorpayOrderResult {
  id: string;
  amount: number;
  currency: string;
}

export interface RazorpayRefundResult {
  id: string;
}

export interface RazorpayClient {
  createOrder(input: {
    amountPaise: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<RazorpayOrderResult>;
  refund(razorpayPaymentId: string, amountPaise?: number): Promise<RazorpayRefundResult>;
}

export function createRealRazorpayClient(keyId: string, keySecret: string): RazorpayClient {
  const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return {
    async createOrder({ amountPaise, currency, receipt, notes }) {
      const order = await instance.orders.create({ amount: Math.round(amountPaise), currency, receipt, notes });
      return { id: order.id, amount: Number(order.amount), currency: order.currency };
    },
    async refund(razorpayPaymentId, amountPaise) {
      const params = amountPaise !== undefined ? { amount: Math.round(amountPaise) } : {};
      const refund = await instance.payments.refund(razorpayPaymentId, params);
      return { id: refund.id };
    },
  };
}
