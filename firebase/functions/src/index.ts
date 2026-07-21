/**
 * TSG eCart — Firebase Cloud Functions entrypoint.
 *
 * Phase 1 shipped the health check. Phase 2 added the Firebase
 * Authentication functions (default signup claims + admin role management).
 * Phase 3 added read-only product/category catalog functions. Phase 4 added
 * product variants, transactional cart/inventory reservation, and address
 * management. Phase 5 added atomic order creation (checkout), order
 * lifecycle (cancel/admin status transitions), global + reward coupons,
 * the reward-spin wheel, and Razorpay (create/verify/webhook/refund).
 * Phase 6 adds the admin dashboard: analytics, customer/staff management,
 * inventory adjustment, product/variant admin CRUD, reward analytics,
 * bulk pincode import, and admin-composed notifications.
 *
 * Drive/Sheets bridge, Phase 1: admin image upload/delete/replace via
 * Google Drive (not Firebase Storage) — Firestore stays the source of
 * truth, Google Apps Script is the only thing that ever talks to Drive.
 * See drive/drive.function.ts.
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
export { getRewardWheel, spinReward, getRewardAnalytics } from './rewards/rewards.function';
export { createOrder, cancelOrder, adminUpdateOrderStatus, createRazorpayOrder } from './orders/orders.function';
export { verifyRazorpayPayment, razorpayWebhook, refundRazorpayPayment } from './payments/razorpay.function';
export { sendNotification } from './notifications/notifications.function';
export { adminAdjustInventory } from './inventory/inventory.function';
export { adminUpsertProduct, adminDeleteProduct } from './catalog/adminProducts.function';
export { adminListCustomers, adminSetCustomerActive, adminListStaff } from './admin/customers.function';
export { getAdminDashboard, getSalesTrend, getTopProducts } from './admin/dashboard.function';
export { adminBulkImportPincodes } from './delivery/delivery.function';
export { adminUploadDriveImage, adminDeleteDriveImage, adminReplaceDriveImage } from './drive/drive.function';
