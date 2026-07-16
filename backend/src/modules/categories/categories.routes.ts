import { Router } from 'express';
import { categoriesController } from './categories.controller.js';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParam,
  categorySlugParam,
} from './categories.validators.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { authenticate } from '../../middlewares/auth.js';
import { requirePermission } from '../../middlewares/rbac.js';

export const categoriesRouter = Router();

// Public
categoriesRouter.get('/', asyncHandler(categoriesController.list));
categoriesRouter.get(
  '/:slug',
  validate({ params: categorySlugParam }),
  asyncHandler(categoriesController.getBySlug),
);

// Admin
categoriesRouter.post(
  '/',
  authenticate,
  requirePermission('products.manage'),
  validate({ body: createCategorySchema }),
  asyncHandler(categoriesController.create),
);
categoriesRouter.put(
  '/:id',
  authenticate,
  requirePermission('products.manage'),
  validate({ params: categoryIdParam, body: updateCategorySchema }),
  asyncHandler(categoriesController.update),
);
categoriesRouter.delete(
  '/:id',
  authenticate,
  requirePermission('products.manage'),
  validate({ params: categoryIdParam }),
  asyncHandler(categoriesController.remove),
);
