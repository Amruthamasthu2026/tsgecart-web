import type { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { cartService } from '../cart/cart.service.js';
import { couponsService } from '../coupons/coupons.service.js';
import { deliveryService } from '../delivery/delivery.service.js';
import { razorpay, isRazorpayConfigured } from '../../config/razorpay.js';
import { generateOrderNumber } from '../../shared/tokens.js';
import { buildPaginationMeta } from '../../shared/apiResponse.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors.js';
import { logger } from '../../config/logger.js';
import type { CreateOrderInput, ListOrdersQuery } from './orders.validators.js';

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// Statuses from which a customer may still cancel.
const CANCELLABLE: OrderStatus[] = ['CONFIRMED', 'PREPARING'];

// Allowed forward transitions for admin status updates.
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['PACKED', 'CANCELLED'],
  PACKED: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export const ordersService = {
  async create(userId: string, input: CreateOrderInput) {
    const cart = await cartService.getCart(userId);
    if (cart.items.length === 0) throw new BadRequestError('Your cart is empty');

    const address = await prisma.address.findFirst({
      where: { id: input.addressId, userId },
    });
    if (!address) throw new NotFoundError('Delivery address not found');

    const service = await deliveryService.checkServiceability(address.pincode);
    if (!service.serviceable || !service.zone) {
      throw new BadRequestError('Sorry, TSG eCart currently delivers only within Hyderabad.');
    }

    // Re-validate stock at order time.
    for (const line of cart.items) {
      if (!line.inStock || line.quantity > line.availableStock) {
        throw new ConflictError(`"${line.name}" is out of stock or has insufficient quantity`);
      }
    }

    // Pricing.
    let discount = 0;
    let couponId: string | null = null;
    if (input.couponCode) {
      const evaluation = await couponsService.evaluate(input.couponCode, userId, cart.subtotal);
      discount = evaluation.discount;
      couponId = evaluation.couponId;
    }
    const deliveryCharge = deliveryService.computeDeliveryCharge(service.zone, cart.subtotal);
    const total = round(Math.max(0, cart.subtotal - discount) + deliveryCharge);
    const orderNumber = generateOrderNumber();

    // Persist everything atomically: order, items, inventory, redemption, cart clear.
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber,
          userId,
          addressId: address.id,
          shipContactName: address.contactName,
          shipContactPhone: address.contactPhone,
          shipLine1: address.line1,
          shipLine2: address.line2,
          shipLandmark: address.landmark,
          shipPincode: address.pincode,
          shipCity: address.city,
          shipState: address.state,
          status: 'CONFIRMED',
          paymentStatus: 'PENDING',
          subtotal: cart.subtotal,
          discount,
          taxTotal: cart.taxTotal,
          deliveryCharge,
          total,
          couponId,
          deliveryZoneId: service.zone!.id,
          etaMinMinutes: service.zone!.minEtaMinutes,
          etaMaxMinutes: service.zone!.maxEtaMinutes,
          items: {
            create: cart.items.map((line) => ({
              variantId: line.variantId,
              productName: line.name,
              variantLabel: line.unitLabel,
              sku: line.sku,
              imageUrl: line.image,
              unitPrice: line.price,
              gstRate: line.gstRate,
              quantity: line.quantity,
              lineTotal: line.lineTotal,
            })),
          },
          statusHistory: {
            create: { status: 'CONFIRMED', note: 'Order placed' },
          },
          payment: {
            create: {
              method: input.paymentMethod,
              status: 'PENDING',
              amount: total,
              currency: 'INR',
            },
          },
        },
        include: { items: true, payment: true },
      });

      // Decrement stock for each variant.
      for (const line of cart.items) {
        await tx.inventory.updateMany({
          where: { variantId: line.variantId },
          data: { stock: { decrement: line.quantity } },
        });
      }

      // Record coupon redemption + usage.
      if (couponId) {
        await tx.couponRedemption.create({
          data: { couponId, userId, orderId: created.id },
        });
        await tx.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
      }

      // Empty the cart.
      const userCart = await tx.cart.findUnique({ where: { userId } });
      if (userCart) await tx.cartItem.deleteMany({ where: { cartId: userCart.id } });

      return created;
    });

    // For online payment, create a Razorpay order and attach its id.
    if (input.paymentMethod === 'RAZORPAY') {
      if (!isRazorpayConfigured) {
        throw new BadRequestError('Online payment is not available right now. Please use Cash on Delivery.');
      }
      const rzpOrder = await razorpay.orders.create({
        amount: Math.round(total * 100), // paise
        currency: 'INR',
        receipt: orderNumber,
        notes: { orderId: order.id },
      });
      await prisma.payment.update({
        where: { orderId: order.id },
        data: { razorpayOrderId: rzpOrder.id },
      });
      return {
        order: await this.getById(userId, order.id),
        razorpay: {
          orderId: rzpOrder.id,
          amount: rzpOrder.amount,
          currency: rzpOrder.currency,
          keyId: process.env.RAZORPAY_KEY_ID,
        },
      };
    }

    return { order: await this.getById(userId, order.id), razorpay: null };
  },

  async list(userId: string, query: ListOrdersQuery) {
    const where: Prisma.OrderWhereInput = { userId };
    if (query.status) where.status = query.status;
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        skip,
        take: query.limit,
        include: { items: true, payment: { select: { method: true, status: true } } },
      }),
      prisma.order.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(query.page, query.limit, total) };
  },

  async getById(userId: string, id: string) {
    const order = await prisma.order.findFirst({
      where: { id, userId },
      include: {
        items: true,
        payment: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        coupon: { select: { code: true } },
      },
    });
    if (!order) throw new NotFoundError('Order not found');
    return order;
  },

  async cancel(userId: string, id: string) {
    const order = await prisma.order.findFirst({ where: { id, userId }, include: { items: true } });
    if (!order) throw new NotFoundError('Order not found');
    if (!CANCELLABLE.includes(order.status)) {
      throw new ConflictError('This order can no longer be cancelled');
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          statusHistory: { create: { status: 'CANCELLED', note: 'Cancelled by customer' } },
        },
      });
      // Restock.
      for (const item of order.items) {
        if (item.variantId) {
          await tx.inventory.updateMany({
            where: { variantId: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }
    });
    return this.getById(userId, id);
  },

  // ── Admin ──────────────────────────────────────────────────
  async adminList(query: ListOrdersQuery & { search?: string }) {
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search } },
        { user: { email: { contains: query.search } } },
      ];
    }
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        skip,
        take: query.limit,
        include: {
          payment: { select: { method: true, status: true } },
          user: { select: { name: true, email: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(query.page, query.limit, total) };
  },

  async updateStatus(id: string, status: OrderStatus, note?: string) {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('Order not found');
    if (!TRANSITIONS[order.status].includes(status)) {
      throw new ConflictError(`Cannot move order from ${order.status} to ${status}`);
    }
    const data: Prisma.OrderUpdateInput = {
      status,
      statusHistory: { create: { status, note } },
    };
    if (status === 'DELIVERED') {
      data.deliveredAt = new Date();
      // COD is settled on delivery.
      if (order.paymentStatus === 'PENDING') {
        data.paymentStatus = 'PAID';
        await prisma.payment.updateMany({
          where: { orderId: id, method: 'COD' },
          data: { status: 'PAID', paidAt: new Date() },
        });
      }
    }
    if (status === 'CANCELLED') {
      data.cancelledAt = new Date();
      const items = await prisma.orderItem.findMany({ where: { orderId: id } });
      for (const item of items) {
        if (item.variantId) {
          await prisma.inventory.updateMany({
            where: { variantId: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }
    }
    await prisma.order.update({ where: { id }, data });
    logger.info({ orderId: id, status }, 'Order status updated');
    return prisma.order.findUniqueOrThrow({
      where: { id },
      include: { statusHistory: { orderBy: { createdAt: 'asc' } }, items: true, payment: true },
    });
  },
};
