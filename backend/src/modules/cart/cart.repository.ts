import { prisma } from '../../config/prisma.js';

const itemInclude = {
  variant: {
    include: {
      inventory: { select: { stock: true, reserved: true } },
      product: {
        select: { id: true, name: true, slug: true, images: true, gstRate: true, isActive: true },
      },
    },
  },
} as const;

export const cartRepository = {
  async getOrCreateCart(userId: string) {
    const existing = await prisma.cart.findUnique({
      where: { userId },
      include: { items: { include: itemInclude, orderBy: { createdAt: 'asc' } } },
    });
    if (existing) return existing;
    await prisma.cart.create({ data: { userId } });
    return prisma.cart.findUniqueOrThrow({
      where: { userId },
      include: { items: { include: itemInclude, orderBy: { createdAt: 'asc' } } },
    });
  },

  findCartByUser(userId: string) {
    return prisma.cart.findUnique({ where: { userId } });
  },

  findVariant(variantId: string) {
    return prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { inventory: true, product: { select: { isActive: true, name: true } } },
    });
  },

  findItem(cartId: string, variantId: string) {
    return prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId, variantId } },
    });
  },

  findItemById(id: string) {
    return prisma.cartItem.findUnique({ where: { id } });
  },

  upsertItem(cartId: string, variantId: string, quantity: number) {
    return prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId } },
      create: { cartId, variantId, quantity },
      update: { quantity },
    });
  },

  updateItemQuantity(id: string, quantity: number) {
    return prisma.cartItem.update({ where: { id }, data: { quantity } });
  },

  deleteItem(id: string) {
    return prisma.cartItem.delete({ where: { id } });
  },

  clearCart(cartId: string) {
    return prisma.cartItem.deleteMany({ where: { cartId } });
  },
};
