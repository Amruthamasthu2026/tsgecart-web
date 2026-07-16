import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

const listInclude = {
  brand: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, slug: true } },
  variants: {
    where: { isActive: true },
    orderBy: { price: 'asc' as const },
    include: { inventory: { select: { stock: true, reserved: true } } },
  },
} satisfies Prisma.ProductInclude;

export const productsRepository = {
  async paginate(where: Prisma.ProductWhereInput, orderBy: Prisma.ProductOrderByWithRelationInput, skip: number, take: number) {
    const [items, total] = await Promise.all([
      prisma.product.findMany({ where, orderBy, skip, take, include: listInclude }),
      prisma.product.count({ where }),
    ]);
    return { items, total };
  },

  findBySlug(slug: string) {
    return prisma.product.findUnique({
      where: { slug },
      include: {
        ...listInclude,
        reviews: {
          where: { isApproved: true },
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            rating: true,
            title: true,
            comment: true,
            createdAt: true,
            user: { select: { name: true } },
          },
        },
      },
    });
  },

  findById(id: string) {
    return prisma.product.findUnique({ where: { id }, include: { variants: true } });
  },

  findBySlugExact(slug: string) {
    return prisma.product.findUnique({ where: { slug } });
  },

  createWithVariants(
    data: Prisma.ProductUncheckedCreateInput,
    variants: Array<{
      sku: string;
      unitLabel: string;
      mrp: number;
      price: number;
      weightGrams?: number;
      isDefault: boolean;
      isActive: boolean;
      stock: number;
      lowStockThreshold: number;
    }>,
  ) {
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.create({ data });
      for (const v of variants) {
        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            sku: v.sku,
            unitLabel: v.unitLabel,
            mrp: v.mrp,
            price: v.price,
            weightGrams: v.weightGrams,
            isDefault: v.isDefault,
            isActive: v.isActive,
          },
        });
        await tx.inventory.create({
          data: {
            variantId: variant.id,
            stock: v.stock,
            lowStockThreshold: v.lowStockThreshold,
          },
        });
      }
      return tx.product.findUnique({ where: { id: product.id }, include: listInclude });
    });
  },

  update(id: string, data: Prisma.ProductUncheckedUpdateInput) {
    return prisma.product.update({ where: { id }, data, include: listInclude });
  },

  delete(id: string) {
    return prisma.product.delete({ where: { id } });
  },
};
