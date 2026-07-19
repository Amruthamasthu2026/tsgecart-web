/**
 * TSG eCart — Firebase Cloud Functions entrypoint.
 *
 * Phase 1 shipped the health check. Phase 2 added the Firebase
 * Authentication functions (default signup claims + admin role management).
 * Phase 3 added read-only product/category catalog functions. Phase 4 added
 * product variants, transactional cart/inventory reservation, and address
 * management. Phase 5 adds atomic order creation (checkout), order
 * lifecycle (cancel/admin status transitions), global + reward coupons,
 * the reward-spin wheel, and Razorpay (create/verify/webhook/refund).
 * Admin-analytics functions remain for a later, separately approved
 * migration phase — see docs/firebase-migration-audit.md.
 */

export { health } from './health/health.function';
export { onUserCreated } from './auth/onUserCreated.function';
export { setUserRole } from './auth/setUserRole.function';
export {
  getProducts,
  getProductBySlug,
  getFeaturedProducts,
  getTrendingProducts,
} from './catalog/products.function';
export { getCategories } from './catalog/categories.function';
export { getProductVariants } from './catalog/variants.function';
export { getCart, addCartItem, updateCartItemQuantity, removeCartItem, clearCart } from './cart/cart.function';
export { addAddress, updateAddress, deleteAddress } from './addresses/addresses.function';
export { validateCoupon } from './coupons/coupons.function';
export { getRewardWheel, spinReward } from './rewards/rewards.function';
export { createOrder, cancelOrder, adminUpdateOrderStatus, createRazorpayOrder } from './orders/orders.function';
export { verifyRazorpayPayment, razorpayWebhook, refundRazorpayPayment } from './payments/razorpay.function';
