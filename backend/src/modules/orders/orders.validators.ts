import { z } from 'zod';

export const createOrderSchema = z.object({
  addressId: z.string().cuid(),
  paymentMethod: z.enum(['COD', 'RAZORPAY']),
  couponCode: z.string().trim().min(1).max(40).optional(),
});

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const orderIdParam = z.object({ id: z.string().cuid() });

export const listOrdersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z
    .enum(['CONFIRMED', 'PREPARING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'])
    .optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'PREPARING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']),
  note: z.string().trim().max(300).optional(),
});

export const refundSchema = z.object({
  amount: z.number().positive().optional(), // partial refund; omit for full
  reason: z.string().trim().max(300).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuery>;
