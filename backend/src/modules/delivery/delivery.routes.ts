import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { deliveryService } from './delivery.service.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { requirePermission } from '../../middlewares/rbac.js';
import { NotFoundError } from '../../shared/errors.js';
import {
  pincodeParam,
  createZoneSchema,
  updateZoneSchema,
  createPincodeSchema,
  updatePincodeSchema,
  createLocalitySchema,
  updateLocalitySchema,
  idParam,
} from './delivery.validators.js';

export const deliveryRouter = Router();
const manage = [authenticate, requirePermission('delivery.manage')] as const;

// ── Public: serviceability check ─────────────────────────────
deliveryRouter.get(
  '/check/:pincode',
  validate({ params: pincodeParam }),
  asyncHandler(async (req, res) => {
    const result = await deliveryService.checkServiceability(req.params.pincode);
    sendSuccess(res, result);
  }),
);

// ── Admin: zones ─────────────────────────────────────────────
deliveryRouter.get(
  '/zones',
  ...manage,
  asyncHandler(async (_req, res) => {
    const zones = await prisma.deliveryZone.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { pincodes: true } } },
    });
    sendSuccess(res, { zones });
  }),
);
deliveryRouter.post(
  '/zones',
  ...manage,
  validate({ body: createZoneSchema }),
  asyncHandler(async (req, res) => {
    const zone = await prisma.deliveryZone.create({ data: req.body });
    sendSuccess(res, { zone }, 201);
  }),
);
deliveryRouter.put(
  '/zones/:id',
  ...manage,
  validate({ params: idParam, body: updateZoneSchema }),
  asyncHandler(async (req, res) => {
    const zone = await prisma.deliveryZone.update({ where: { id: req.params.id }, data: req.body });
    sendSuccess(res, { zone });
  }),
);
deliveryRouter.delete(
  '/zones/:id',
  ...manage,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await prisma.deliveryZone.delete({ where: { id: req.params.id } });
    sendSuccess(res, { deleted: true });
  }),
);

// ── Admin: pincodes ──────────────────────────────────────────
deliveryRouter.get(
  '/pincodes',
  ...manage,
  asyncHandler(async (req, res) => {
    const where: Prisma.PincodeWhereInput = {};
    if (typeof req.query.zoneId === 'string') where.zoneId = req.query.zoneId;
    const pincodes = await prisma.pincode.findMany({
      where,
      orderBy: { code: 'asc' },
      include: { zone: { select: { id: true, name: true } } },
    });
    sendSuccess(res, { pincodes });
  }),
);
deliveryRouter.post(
  '/pincodes',
  ...manage,
  validate({ body: createPincodeSchema }),
  asyncHandler(async (req, res) => {
    const pincode = await prisma.pincode.create({ data: req.body });
    await deliveryService.invalidatePincodeCache(pincode.code);
    sendSuccess(res, { pincode }, 201);
  }),
);
deliveryRouter.put(
  '/pincodes/:id',
  ...manage,
  validate({ params: idParam, body: updatePincodeSchema }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.pincode.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Pincode not found');
    const pincode = await prisma.pincode.update({ where: { id: req.params.id }, data: req.body });
    await deliveryService.invalidatePincodeCache(pincode.code);
    sendSuccess(res, { pincode });
  }),
);
deliveryRouter.delete(
  '/pincodes/:id',
  ...manage,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.pincode.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Pincode not found');
    await prisma.pincode.delete({ where: { id: req.params.id } });
    await deliveryService.invalidatePincodeCache(existing.code);
    sendSuccess(res, { deleted: true });
  }),
);

// ── Admin: localities ────────────────────────────────────────
deliveryRouter.get(
  '/localities',
  ...manage,
  asyncHandler(async (req, res) => {
    const where: Prisma.LocalityWhereInput = {};
    if (typeof req.query.pincodeId === 'string') where.pincodeId = req.query.pincodeId;
    const localities = await prisma.locality.findMany({ where, orderBy: { name: 'asc' } });
    sendSuccess(res, { localities });
  }),
);
deliveryRouter.post(
  '/localities',
  ...manage,
  validate({ body: createLocalitySchema }),
  asyncHandler(async (req, res) => {
    const locality = await prisma.locality.create({ data: req.body });
    sendSuccess(res, { locality }, 201);
  }),
);
deliveryRouter.put(
  '/localities/:id',
  ...manage,
  validate({ params: idParam, body: updateLocalitySchema }),
  asyncHandler(async (req, res) => {
    const locality = await prisma.locality.update({ where: { id: req.params.id }, data: req.body });
    sendSuccess(res, { locality });
  }),
);
deliveryRouter.delete(
  '/localities/:id',
  ...manage,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await prisma.locality.delete({ where: { id: req.params.id } });
    sendSuccess(res, { deleted: true });
  }),
);
