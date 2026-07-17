import { prisma } from '../../config/prisma.js';
import {
  razorpay,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '../../config/razorpay.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';
import { logger } from '../../config/logger.js';

export const paymentsService = {
  /** Client-side verification after Razorpay checkout completes. */
  async verify(
    userId: string,
    input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  ) {
    const payment = await prisma.payment.findUnique({
      where: { razorpayOrderId: input.razorpayOrderId },
      include: { order: true },
    });
    if (!payment || payment.order.userId !== userId) throw new NotFoundError('Payment not found');

    const valid = verifyPaymentSignature(
      input.razorpayOrderId,
      input.razorpayPaymentId,
      input.razorpaySignature,
    );
    if (!valid) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      throw new BadRequestError('Payment verification failed');
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        razorpayPaymentId: input.razorpayPaymentId,
        razorpaySignature: input.razorpaySignature,
        paidAt: new Date(),
      },
    });
    await prisma.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: 'PAID' },
    });
    logger.info({ orderId: payment.orderId }, 'Razorpay payment verified');
    return { verified: true, orderId: payment.orderId };
  },

  /** Handles Razorpay webhook events (raw body + signature already available). */
  async handleWebhook(rawBody: Buffer, signature: string) {
    if (!verifyWebhookSignature(rawBody, signature)) {
      throw new BadRequestError('Invalid webhook signature');
    }
    const event = JSON.parse(rawBody.toString()) as {
      event: string;
      payload: {
        payment?: { entity: { id: string; order_id: string; amount: number } };
        refund?: { entity: { id: string; payment_id: string; amount: number } };
      };
    };

    switch (event.event) {
      case 'payment.captured': {
        const entity = event.payload.payment?.entity;
        if (entity) {
          await prisma.payment.updateMany({
            where: { razorpayOrderId: entity.order_id, status: { not: 'PAID' } },
            data: { status: 'PAID', razorpayPaymentId: entity.id, paidAt: new Date() },
          });
          const payment = await prisma.payment.findUnique({
            where: { razorpayOrderId: entity.order_id },
          });
          if (payment) {
            await prisma.order.update({
              where: { id: payment.orderId },
              data: { paymentStatus: 'PAID' },
            });
          }
        }
        break;
      }
      case 'payment.failed': {
        const entity = event.payload.payment?.entity;
        if (entity) {
          await prisma.payment.updateMany({
            where: { razorpayOrderId: entity.order_id },
            data: { status: 'FAILED' },
          });
        }
        break;
      }
      case 'refund.processed': {
        const entity = event.payload.refund?.entity;
        if (entity) {
          const payment = await prisma.payment.findFirst({
            where: { razorpayPaymentId: entity.payment_id },
          });
          if (payment) {
            const refunded = Number(payment.refundedAmount) + entity.amount / 100;
            const fullyRefunded = refunded >= Number(payment.amount);
            await prisma.payment.update({
              where: { id: payment.id },
              data: {
                status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
                refundedAmount: refunded,
                refundId: entity.id,
              },
            });
            await prisma.order.update({
              where: { id: payment.orderId },
              data: { paymentStatus: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
            });
          }
        }
        break;
      }
      default:
        logger.debug({ event: event.event }, 'Unhandled Razorpay webhook event');
    }
    return { received: true };
  },

  /** Admin-initiated refund for a paid Razorpay order. */
  async refund(orderId: string, amount?: number) {
    const payment = await prisma.payment.findUnique({ where: { orderId } });
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.method !== 'RAZORPAY' || payment.status === 'PENDING') {
      throw new BadRequestError('Only captured online payments can be refunded');
    }
    if (!payment.razorpayPaymentId) throw new BadRequestError('No captured payment to refund');

    const refundAmount = amount ?? Number(payment.amount) - Number(payment.refundedAmount);
    if (refundAmount <= 0) throw new BadRequestError('Nothing left to refund');

    const refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
      amount: Math.round(refundAmount * 100),
    });

    const totalRefunded = Number(payment.refundedAmount) + refundAmount;
    const fullyRefunded = totalRefunded >= Number(payment.amount);
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        refundedAmount: totalRefunded,
        refundId: refund.id,
      },
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
    });
    logger.info({ orderId, refundAmount }, 'Refund processed');
    return { refunded: true, amount: refundAmount };
  },
};
