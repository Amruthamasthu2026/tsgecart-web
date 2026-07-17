import { prisma } from '../../config/prisma.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';

async function recomputeProductRating(productId: string): Promise<void> {
  const agg = await prisma.review.aggregate({
    where: { productId, isApproved: true },
    _avg: { rating: true },
    _count: true,
  });
  await prisma.product.update({
    where: { id: productId },
    data: {
      ratingAvg: agg._avg.rating ? Math.round(agg._avg.rating * 100) / 100 : 0,
      ratingCount: agg._count,
    },
  });
}

export const reviewsService = {
  async create(
    userId: string,
    productId: string,
    input: { rating: number; title?: string; comment?: string },
  ) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundError('Product not found');

    // Only buyers of a delivered order may review.
    const purchased = await prisma.orderItem.findFirst({
      where: {
        variant: { productId },
        order: { userId, status: 'DELIVERED' },
      },
    });
    if (!purchased) {
      throw new BadRequestError('You can only review products from your delivered orders');
    }

    const review = await prisma.review.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId, rating: input.rating, title: input.title, comment: input.comment },
      update: { rating: input.rating, title: input.title, comment: input.comment, isApproved: false },
    });
    return review;
  },

  listMine(userId: string) {
    return prisma.review.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true, slug: true } } },
    });
  },

  // ── Admin ──────────────────────────────────────────────────
  adminList(approved?: boolean) {
    return prisma.review.findMany({
      where: approved === undefined ? {} : { isApproved: approved },
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { name: true, slug: true } },
        user: { select: { name: true, email: true } },
      },
    });
  },

  async setApproval(id: string, isApproved: boolean) {
    const review = await prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundError('Review not found');
    await prisma.review.update({ where: { id }, data: { isApproved } });
    await recomputeProductRating(review.productId);
    return { updated: true };
  },

  async remove(id: string) {
    const review = await prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundError('Review not found');
    await prisma.review.delete({ where: { id } });
    await recomputeProductRating(review.productId);
    return { deleted: true };
  },
};
