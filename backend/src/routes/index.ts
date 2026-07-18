import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { redis } from '../config/redis.js';
import { asyncHandler } from '../shared/asyncHandler.js';
import { sendSuccess } from '../shared/apiResponse.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';
import { categoriesRouter } from '../modules/categories/categories.routes.js';
import { brandsRouter } from '../modules/brands/brands.module.js';
import { productsRouter } from '../modules/products/products.routes.js';
import { uploadsRouter } from '../modules/uploads/uploads.module.js';
import { cartRouter } from '../modules/cart/cart.routes.js';
import { wishlistRouter } from '../modules/wishlist/wishlist.routes.js';
import { deliveryRouter } from '../modules/delivery/delivery.routes.js';
import { couponsRouter } from '../modules/coupons/coupons.routes.js';
import { ordersRouter } from '../modules/orders/orders.routes.js';
import { adminOrdersRouter } from '../modules/orders/adminOrders.routes.js';
import { paymentsRouter } from '../modules/payments/payments.routes.js';
import { reviewsRouter } from '../modules/reviews/reviews.routes.js';
import { notificationsRouter } from '../modules/notifications/notifications.routes.js';
import { rewardsRouter } from '../modules/rewards/rewards.routes.js';
import { spinRouter } from '../modules/spin/spin.routes.js';
import { bannersRouter } from '../modules/banners/banners.routes.js';
import { discoveryRouter } from '../modules/discovery/discovery.routes.js';
import { adminRouter } from '../modules/admin/admin.routes.js';
import { rewardSpinRouter } from '../modules/rewardspin/rewardSpin.routes.js';

/**
 * Root API router. Feature module routers are mounted here as each phase
 * is implemented (auth, catalog, cart, orders, admin, …).
 */
export const apiRouter = Router();

apiRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const [dbOk, redisOk] = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      redis.ping(),
    ]);
    sendSuccess(res, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk.status === 'fulfilled' ? 'up' : 'down',
        redis: redisOk.status === 'fulfilled' ? 'up' : 'down',
      },
    });
  }),
);

// Feature modules
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/brands', brandsRouter);
apiRouter.use('/products', productsRouter);
apiRouter.use('/uploads', uploadsRouter);
apiRouter.use('/cart', cartRouter);
apiRouter.use('/wishlist', wishlistRouter);
apiRouter.use('/delivery', deliveryRouter);
apiRouter.use('/coupons', couponsRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/admin/orders', adminOrdersRouter);
apiRouter.use('/payments', paymentsRouter);
apiRouter.use('/reviews', reviewsRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/rewards', rewardsRouter);
apiRouter.use('/spin', spinRouter);
apiRouter.use('/banners', bannersRouter);
apiRouter.use('/discovery', discoveryRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/rewards-spin', rewardSpinRouter);
