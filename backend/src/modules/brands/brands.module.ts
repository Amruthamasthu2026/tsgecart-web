import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { slugify } from '../../shared/slug.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { requirePermission } from '../../middlewares/rbac.js';
import { ConflictError, NotFoundError } from '../../shared/errors.js';

const createBrandSchema = z.object({
  name: z.string().trim().min(1).max(80),
  logoUrl: z.string().url().optional(),
  isActive: z.boolean().default(true),
});
const updateBrandSchema = createBrandSchema.partial();
const idParam = z.object({ id: z.string().cuid() });

async function uniqueSlug(name: string, ignoreId?: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.brand.findUnique({ where: { slug } });
    if (!existing || existing.id === ignoreId) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

export const brandsRouter = Router();

brandsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === 'true';
    const where: Prisma.BrandWhereInput = includeInactive ? {} : { isActive: true };
    const brands = await prisma.brand.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    sendSuccess(res, { brands });
  }),
);

brandsRouter.post(
  '/',
  authenticate,
  requirePermission('products.manage'),
  validate({ body: createBrandSchema }),
  asyncHandler(async (req, res) => {
    const slug = await uniqueSlug(req.body.name);
    const brand = await prisma.brand.create({ data: { ...req.body, slug } });
    sendSuccess(res, { brand }, 201);
  }),
);

brandsRouter.put(
  '/:id',
  authenticate,
  requirePermission('products.manage'),
  validate({ params: idParam, body: updateBrandSchema }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.brand.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Brand not found');
    const data: Prisma.BrandUncheckedUpdateInput = { ...req.body };
    if (req.body.name && req.body.name !== existing.name) {
      data.slug = await uniqueSlug(req.body.name, req.params.id);
    }
    const brand = await prisma.brand.update({ where: { id: req.params.id }, data });
    sendSuccess(res, { brand });
  }),
);

brandsRouter.delete(
  '/:id',
  authenticate,
  requirePermission('products.manage'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const count = await prisma.product.count({ where: { brandId: req.params.id } });
    if (count > 0) throw new ConflictError('Cannot delete a brand that still has products');
    await prisma.brand.delete({ where: { id: req.params.id } });
    sendSuccess(res, { deleted: true });
  }),
);
