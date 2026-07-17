import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate, optionalAuth } from '../../middlewares/auth.js';

const productInclude = {
  variants: {
    where: { isActive: true },
    orderBy: { price: 'asc' as const },
    include: { inventory: { select: { stock: true, reserved: true } } },
  },
  category: { select: { name: true, slug: true } },
};

const trackSchema = z.object({ productId: z.string().cuid() });
const slugParam = z.object({ slug: z.string().min(1) });

export const discoveryRouter = Router();

// Record a product view (deduplicated per user/product).
discoveryRouter.post(
  '/recently-viewed',
  authenticate,
  validate({ body: trackSchema }),
  asyncHandler(async (req, res) => {
    await prisma.recentlyViewed.upsert({
      where: { userId_productId: { userId: req.user!.id, productId: req.body.productId } },
      create: { userId: req.user!.id, productId: req.body.productId },
      update: { viewedAt: new Date() },
    });
    sendSuccess(res, { tracked: true }, 201);
  }),
);

discoveryRouter.get(
  '/recently-viewed',
  authenticate,
  asyncHandler(async (req, res) => {
    const rows = await prisma.recentlyViewed.findMany({
      where: { userId: req.user!.id, product: { isActive: true } },
      orderBy: { viewedAt: 'desc' },
      take: 12,
      include: { product: { include: productInclude } },
    });
    sendSuccess(res, { products: rows.map((r) => r.product) });
  }),
);

// Recommendations: derived from recently-viewed categories, else best sellers.
discoveryRouter.get(
  '/recommendations',
  optionalAuth,
  asyncHandler(async (req, res) => {
    let categoryIds: string[] = [];
    if (req.user) {
      const recent = await prisma.recentlyViewed.findMany({
        where: { userId: req.user.id },
        orderBy: { viewedAt: 'desc' },
        take: 10,
        include: { product: { select: { categoryId: true } } },
      });
      categoryIds = [...new Set(recent.map((r) => r.product.categoryId))];
    }

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        ...(categoryIds.length ? { categoryId: { in: categoryIds } } : { isBestSeller: true }),
      },
      orderBy: { ratingAvg: 'desc' },
      take: 10,
      include: productInclude,
    });
    sendSuccess(res, { products });
  }),
);

// Related products — same category, excluding the current product.
discoveryRouter.get(
  '/related/:slug',
  validate({ params: slugParam }),
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { slug: req.params.slug },
      select: { id: true, categoryId: true },
    });
    if (!product) {
      sendSuccess(res, { products: [] });
      return;
    }
    const products = await prisma.product.findMany({
      where: { isActive: true, categoryId: product.categoryId, id: { not: product.id } },
      take: 8,
      include: productInclude,
    });
    sendSuccess(res, { products });
  }),
);
