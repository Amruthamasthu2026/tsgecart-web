import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { analyticsService } from './analytics.service.js';
import { sendSuccess, buildPaginationMeta } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { requirePermission, requireRole } from '../../middlewares/rbac.js';
import { NotFoundError } from '../../shared/errors.js';

export const adminRouter = Router();
adminRouter.use(authenticate);

// ── Analytics (dashboard.view) ───────────────────────────────
const analytics = requirePermission('dashboard.view');

adminRouter.get(
  '/analytics/dashboard',
  analytics,
  asyncHandler(async (_req, res) => sendSuccess(res, await analyticsService.dashboard())),
);
adminRouter.get(
  '/analytics/sales',
  analytics,
  asyncHandler(async (req, res) => {
    const days = Math.min(90, Math.max(7, Number(req.query.days) || 14));
    sendSuccess(res, { trend: await analyticsService.salesTrend(days) });
  }),
);
adminRouter.get(
  '/analytics/top-products',
  analytics,
  asyncHandler(async (_req, res) => sendSuccess(res, { products: await analyticsService.topProducts() })),
);
adminRouter.get(
  '/analytics/low-stock',
  requirePermission('inventory.manage'),
  asyncHandler(async (_req, res) => sendSuccess(res, { items: await analyticsService.lowStock() })),
);

// ── Inventory adjust (inventory.manage) ──────────────────────
const adjustSchema = z.object({
  stock: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
});
adminRouter.patch(
  '/inventory/:variantId',
  requirePermission('inventory.manage'),
  validate({ params: z.object({ variantId: z.string().cuid() }), body: adjustSchema }),
  asyncHandler(async (req, res) => {
    const inventory = await prisma.inventory.update({
      where: { variantId: req.params.variantId },
      data: req.body,
    });
    sendSuccess(res, { inventory });
  }),
);

// ── Customers (customers.manage) ─────────────────────────────
const customers = requirePermission('customers.manage');

adminRouter.get(
  '/customers',
  customers,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const where: Prisma.UserWhereInput = { role: 'CUSTOMER' };
    if (search) {
      where.OR = [{ name: { contains: search } }, { email: { contains: search } }];
    }
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          isActive: true,
          emailVerified: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);
    sendSuccess(res, { customers: items }, 200, buildPaginationMeta(page, limit, total));
  }),
);

adminRouter.patch(
  '/customers/:id',
  customers,
  validate({
    params: z.object({ id: z.string().cuid() }),
    body: z.object({ isActive: z.boolean() }),
  }),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: req.body.isActive },
      select: { id: true, isActive: true },
    });
    sendSuccess(res, { user });
  }),
);

// ── Settings (settings.manage) ───────────────────────────────
const settings = requirePermission('settings.manage');

adminRouter.get(
  '/settings',
  settings,
  asyncHandler(async (_req, res) => {
    const rows = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
    sendSuccess(res, { settings: rows });
  }),
);
adminRouter.put(
  '/settings/:key',
  settings,
  validate({
    params: z.object({ key: z.string().min(1) }),
    body: z.object({ value: z.any() }),
  }),
  asyncHandler(async (req, res) => {
    const setting = await prisma.setting.upsert({
      where: { key: req.params.key },
      create: { key: req.params.key, value: req.body.value },
      update: { value: req.body.value },
    });
    sendSuccess(res, { setting });
  }),
);

// ── Roles & permissions (settings.manage, ADMIN only for grants) ─
adminRouter.get(
  '/permissions',
  settings,
  asyncHandler(async (_req, res) => {
    const permissions = await prisma.permission.findMany({ orderBy: { key: 'asc' } });
    sendSuccess(res, { permissions });
  }),
);

adminRouter.get(
  '/staff',
  settings,
  asyncHandler(async (_req, res) => {
    const staff = await prisma.user.findMany({
      where: { role: { in: ['STAFF', 'ADMIN'] } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        permissions: { select: { permission: { select: { key: true } } } },
      },
    });
    sendSuccess(res, {
      staff: staff.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        role: s.role,
        permissions: s.permissions.map((p) => p.permission.key),
      })),
    });
  }),
);

adminRouter.patch(
  '/users/:id/role',
  requireRole('ADMIN'),
  validate({
    params: z.object({ id: z.string().cuid() }),
    body: z.object({
      role: z.enum(['CUSTOMER', 'STAFF', 'ADMIN']),
      permissionKeys: z.array(z.string()).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new NotFoundError('User not found');

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: req.params.id }, data: { role: req.body.role } });
      if (req.body.permissionKeys) {
        await tx.userPermission.deleteMany({ where: { userId: req.params.id } });
        const perms = await tx.permission.findMany({
          where: { key: { in: req.body.permissionKeys } },
        });
        await tx.userPermission.createMany({
          data: perms.map((p) => ({ userId: req.params.id, permissionId: p.id })),
          skipDuplicates: true,
        });
      }
    });
    sendSuccess(res, { updated: true });
  }),
);
