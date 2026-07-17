import { cartRepository } from './cart.repository.js';
import { deliveryService } from '../delivery/delivery.service.js';
import { couponsService } from '../coupons/coupons.service.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';

const MAX_QTY_PER_ITEM = 20;

export interface CartLine {
  itemId: string;
  variantId: string;
  productId: string;
  name: string;
  slug: string;
  image: string | null;
  unitLabel: string;
  sku: string;
  price: number;
  mrp: number;
  gstRate: number;
  quantity: number;
  lineTotal: number;
  inStock: boolean;
  availableStock: number;
}

export interface CartSummary {
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  taxTotal: number;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function toLines(cart: Awaited<ReturnType<typeof cartRepository.getOrCreateCart>>): CartLine[] {
  return cart.items.map((item) => {
    const v = item.variant;
    const images = (v.product.images as string[]) ?? [];
    const available = v.inventory ? v.inventory.stock - v.inventory.reserved : 0;
    const price = Number(v.price);
    return {
      itemId: item.id,
      variantId: v.id,
      productId: v.product.id,
      name: v.product.name,
      slug: v.product.slug,
      image: images[0] ?? null,
      unitLabel: v.unitLabel,
      sku: v.sku,
      price,
      mrp: Number(v.mrp),
      gstRate: Number(v.product.gstRate),
      quantity: item.quantity,
      lineTotal: round(price * item.quantity),
      inStock: v.isActive && v.product.isActive && available > 0,
      availableStock: Math.max(0, available),
    };
  });
}

function summarize(lines: CartLine[]): CartSummary {
  const subtotal = round(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  // GST is embedded in the tax-inclusive price; expose the embedded portion.
  const taxTotal = round(
    lines.reduce((sum, l) => {
      const rate = l.gstRate / 100;
      return sum + (rate > 0 ? l.lineTotal - l.lineTotal / (1 + rate) : 0);
    }, 0),
  );
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  return { items: lines, itemCount, subtotal, taxTotal };
}

export const cartService = {
  async getCart(userId: string): Promise<CartSummary> {
    const cart = await cartRepository.getOrCreateCart(userId);
    return summarize(toLines(cart));
  },

  async getCartSummary(userId: string): Promise<CartSummary> {
    return this.getCart(userId);
  },

  async addItem(userId: string, variantId: string, quantity: number): Promise<CartSummary> {
    const variant = await cartRepository.findVariant(variantId);
    if (!variant || !variant.isActive || !variant.product.isActive) {
      throw new NotFoundError('Product is unavailable');
    }
    const cart = await cartRepository.getOrCreateCart(userId);
    const existing = await cartRepository.findItem(cart.id, variantId);
    const nextQty = (existing?.quantity ?? 0) + quantity;
    if (nextQty > MAX_QTY_PER_ITEM) {
      throw new BadRequestError(`You can add at most ${MAX_QTY_PER_ITEM} of an item`);
    }
    const available = variant.inventory ? variant.inventory.stock - variant.inventory.reserved : 0;
    if (nextQty > available) throw new BadRequestError(`Only ${available} in stock`);

    await cartRepository.upsertItem(cart.id, variantId, nextQty);
    return this.getCart(userId);
  },

  async updateItem(userId: string, itemId: string, quantity: number): Promise<CartSummary> {
    const item = await cartRepository.findItemById(itemId);
    const cart = await cartRepository.findCartByUser(userId);
    if (!item || !cart || item.cartId !== cart.id) throw new NotFoundError('Cart item not found');

    if (quantity <= 0) {
      await cartRepository.deleteItem(itemId);
      return this.getCart(userId);
    }
    if (quantity > MAX_QTY_PER_ITEM) {
      throw new BadRequestError(`You can add at most ${MAX_QTY_PER_ITEM} of an item`);
    }
    const variant = await cartRepository.findVariant(item.variantId);
    const available = variant?.inventory ? variant.inventory.stock - variant.inventory.reserved : 0;
    if (quantity > available) throw new BadRequestError(`Only ${available} in stock`);

    await cartRepository.updateItemQuantity(itemId, quantity);
    return this.getCart(userId);
  },

  async removeItem(userId: string, itemId: string): Promise<CartSummary> {
    const item = await cartRepository.findItemById(itemId);
    const cart = await cartRepository.findCartByUser(userId);
    if (!item || !cart || item.cartId !== cart.id) throw new NotFoundError('Cart item not found');
    await cartRepository.deleteItem(itemId);
    return this.getCart(userId);
  },

  async clear(userId: string): Promise<CartSummary> {
    const cart = await cartRepository.findCartByUser(userId);
    if (cart) await cartRepository.clearCart(cart.id);
    return this.getCart(userId);
  },

  /**
   * Full checkout breakdown for a pincode (and optional coupon): validates
   * serviceability, computes delivery charge and discount, returns the total.
   */
  async checkout(
    userId: string,
    pincode: string,
    couponCode?: string,
  ): Promise<{
    summary: CartSummary;
    serviceable: boolean;
    message: string;
    deliveryCharge: number;
    discount: number;
    couponCode?: string;
    eta?: { min: number; max: number };
    total: number;
    zoneId?: string;
  }> {
    const summary = await this.getCart(userId);
    if (summary.items.length === 0) throw new BadRequestError('Your cart is empty');

    const service = await deliveryService.checkServiceability(pincode);
    if (!service.serviceable || !service.zone) {
      return {
        summary,
        serviceable: false,
        message: service.message,
        deliveryCharge: 0,
        discount: 0,
        total: summary.subtotal,
      };
    }

    let discount = 0;
    let appliedCode: string | undefined;
    if (couponCode) {
      const evaluation = await couponsService.evaluate(couponCode, userId, summary.subtotal);
      discount = evaluation.discount;
      appliedCode = evaluation.code;
    }

    const deliveryCharge = deliveryService.computeDeliveryCharge(service.zone, summary.subtotal);
    const total = round(Math.max(0, summary.subtotal - discount) + deliveryCharge);

    return {
      summary,
      serviceable: true,
      message: service.message,
      deliveryCharge,
      discount,
      couponCode: appliedCode,
      eta: { min: service.zone.minEtaMinutes, max: service.zone.maxEtaMinutes },
      total,
      zoneId: service.zone.id,
    };
  },
};
