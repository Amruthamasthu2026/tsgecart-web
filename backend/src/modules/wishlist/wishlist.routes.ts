import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { NotFoundError } from '../../shared/errors.js';

const addSchema = z.object({ productId: z.string().cuid() });
const productIdParam = z.object({ productId: z.string().cuid() });

async function getOrCreateWishlist(userId: string) {
  const existing = await prisma.wishlist.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.wishlist.create({ data: { userId } });
}

export const wishlistRouter = Router();
wishlistRouter.use(authenticate);

wishlistRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const wishlist = await getOrCreateWishlist(req.user!.id);
    const items = await prisma.wishlistItem.findMany({
      where: { wishlistId: wishlist.id },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          include: {
            variants: {
              where: { isActive: true },
              orderBy: { price: 'asc' },
              include: { inventory: { select: { stock: true, reserved: true } } },
            },
            category: { select: { name: true, slug: true } },
          },
        },
      },
    });
    sendSuccess(res, { products: items.map((i) => i.product) });
  }),
);

wishlistRouter.post(
  '/items',
  validate({ body: addSchema }),
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.body.productId } });
    if (!product) throw new NotFoundError('Product not found');
    const wishlist = await getOrCreateWishlist(req.user!.id);
    await prisma.wishlistItem.upsert({
      where: { wishlistId_productId: { wishlistId: wishlist.id, productId: req.body.productId } },
      create: { wishlistId: wishlist.id, productId: req.body.productId },
      update: {},
    });
    sendSuccess(res, { added: true }, 201);
  }),
);

wishlistRouter.delete(
  '/items/:productId',
  validate({ params: productIdParam }),
  asyncHandler(async (req, res) => {
    const wishlist = await getOrCreateWishlist(req.user!.id);
    await prisma.wishlistItem.deleteMany({
      where: { wishlistId: wishlist.id, productId: req.params.productId },
    });
    sendSuccess(res, { removed: true });
  }),
);
