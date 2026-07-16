import { Router } from 'express';
import { productsController } from './products.controller.js';
import {
  productListQuery,
  createProductSchema,
  updateProductSchema,
  productIdParam,
  productSlugParam,
} from './products.validators.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { authenticate } from '../../middlewares/auth.js';
import { requirePermission } from '../../middlewares/rbac.js';

export const productsRouter = Router();

// Public
productsRouter.get('/', validate({ query: productListQuery }), asyncHandler(productsController.list));
productsRouter.get(
  '/:slug',
  validate({ params: productSlugParam }),
  asyncHandler(productsController.getBySlug),
);

// Admin
productsRouter.post(
  '/',
  authenticate,
  requirePermission('products.manage'),
  validate({ body: createProductSchema }),
  asyncHandler(productsController.create),
);
productsRouter.put(
  '/:id',
  authenticate,
  requirePermission('products.manage'),
  validate({ params: productIdParam, body: updateProductSchema }),
  asyncHandler(productsController.update),
);
productsRouter.delete(
  '/:id',
  authenticate,
  requirePermission('products.manage'),
  validate({ params: productIdParam }),
  asyncHandler(productsController.remove),
);
