import { Router } from 'express';
import { usersController } from './users.controller.js';
import {
  updateProfileSchema,
  changePasswordSchema,
  addressSchema,
  addressIdParam,
} from './users.validators.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { authenticate } from '../../middlewares/auth.js';

export const usersRouter = Router();

// All user routes require authentication.
usersRouter.use(authenticate);

usersRouter.patch(
  '/me',
  validate({ body: updateProfileSchema }),
  asyncHandler(usersController.updateProfile),
);

usersRouter.post(
  '/me/change-password',
  validate({ body: changePasswordSchema }),
  asyncHandler(usersController.changePassword),
);

usersRouter.get('/me/addresses', asyncHandler(usersController.listAddresses));

usersRouter.post(
  '/me/addresses',
  validate({ body: addressSchema }),
  asyncHandler(usersController.createAddress),
);

usersRouter.put(
  '/me/addresses/:id',
  validate({ params: addressIdParam, body: addressSchema }),
  asyncHandler(usersController.updateAddress),
);

usersRouter.delete(
  '/me/addresses/:id',
  validate({ params: addressIdParam }),
  asyncHandler(usersController.deleteAddress),
);
