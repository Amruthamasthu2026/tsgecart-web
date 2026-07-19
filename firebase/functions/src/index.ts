/**
 * TSG eCart — Firebase Cloud Functions entrypoint.
 *
 * Phase 1 shipped the health check. Phase 2 added the Firebase
 * Authentication functions (default signup claims + admin role management).
 * Phase 3 added read-only product/category catalog functions. Phase 4 adds
 * product variants, transactional cart/inventory reservation, and address
 * management. Orders/payments/coupons/rewards/admin-analytics functions
 * remain for later, separately approved migration phases — see
 * docs/firebase-migration-audit.md.
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
