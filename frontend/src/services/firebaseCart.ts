import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from '../lib/firebase';
import type { CartLine, CartSummary } from '../features/cart/cart.api';

/**
 * Firestore-backed cart service — added ALONGSIDE `features/cart/cart.api.ts`
 * (untouched) and `contexts/CartContext.tsx` (untouched). Every mutation
 * calls a Callable Function (`firebase/functions/src/cart/cart.function.ts`)
 * that recomputes prices/totals server-side and reserves stock inside a
 * Firestore transaction — this service never computes or trusts a price
 * itself, matching the existing Express cart exactly.
 *
 * See `VITE_USE_FIRESTORE_CART` (frontend/.env.example).
 */

export interface FirestoreCartLine {
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  image: string | null;
  unitLabel: string;
  sku: string;
  pricePaise: number;
  mrpPaise: number;
  gstRatePercent: number;
  quantity: number;
  lineTotalPaise: number;
  inStock: boolean;
  availableStock: number;
}

export interface FirestoreCart {
  items: FirestoreCartLine[];
  itemCount: number;
  subtotalPaise: number;
  taxPaise: number;
}

const getCartCallable = httpsCallable<undefined, FirestoreCart>(firebaseFunctions, 'getCart');
const addCartItemCallable = httpsCallable<{ variantId: string; quantity?: number }, FirestoreCart>(
  firebaseFunctions,
  'addCartItem',
);
const updateCartItemQuantityCallable = httpsCallable<{ variantId: string; quantity: number }, FirestoreCart>(
  firebaseFunctions,
  'updateCartItemQuantity',
);
const removeCartItemCallable = httpsCallable<{ variantId: string }, FirestoreCart>(
  firebaseFunctions,
  'removeCartItem',
);
const clearCartCallable = httpsCallable<undefined, FirestoreCart>(firebaseFunctions, 'clearCart');

export const firebaseCartApi = {
  async get(): Promise<FirestoreCart> {
    return (await getCartCallable()).data;
  },
  async addItem(variantId: string, quantity = 1): Promise<FirestoreCart> {
    return (await addCartItemCallable({ variantId, quantity })).data;
  },
  async updateItem(variantId: string, quantity: number): Promise<FirestoreCart> {
    return (await updateCartItemQuantityCallable({ variantId, quantity })).data;
  },
  async removeItem(variantId: string): Promise<FirestoreCart> {
    return (await removeCartItemCallable({ variantId })).data;
  },
  async clear(): Promise<FirestoreCart> {
    return (await clearCartCallable()).data;
  },
};

/** True when the cart page should read/write Firestore instead of the Express API. */
export const useFirestoreCart = import.meta.env.VITE_USE_FIRESTORE_CART === 'true';

function paiseToRupees(paise: number): number {
  return paise / 100;
}

/**
 * Reshapes a Firestore cart into the exact `CartSummary`/`CartLine` shape
 * `CartPage` already renders — no rendering code needed to change. The
 * variant ID doubles as `itemId` (Firestore's cart-item doc ID IS the
 * variant ID — see cart/cart.types.ts), so quantity/remove actions on the
 * legacy shape map straight back onto `firebaseCartApi.updateItem/removeItem`.
 */
export function toLegacyCartSummary(fsCart: FirestoreCart): CartSummary {
  const items: CartLine[] = fsCart.items.map((line) => ({
    itemId: line.variantId,
    variantId: line.variantId,
    productId: line.productId,
    name: line.productName,
    slug: line.productSlug,
    image: line.image,
    unitLabel: line.unitLabel,
    sku: line.sku,
    price: paiseToRupees(line.pricePaise),
    mrp: paiseToRupees(line.mrpPaise),
    gstRate: line.gstRatePercent,
    quantity: line.quantity,
    lineTotal: paiseToRupees(line.lineTotalPaise),
    inStock: line.inStock,
    availableStock: line.availableStock,
  }));

  return {
    items,
    itemCount: fsCart.itemCount,
    subtotal: paiseToRupees(fsCart.subtotalPaise),
    taxTotal: paiseToRupees(fsCart.taxPaise),
  };
}
