import type { CartLineResponse, CartResponse } from './cart.types';

/**
 * Pure cart-total arithmetic, mirroring `backend/src/modules/cart/cart.service.ts`
 * exactly: prices are GST-inclusive, so tax is the *embedded* portion of
 * each line total (`lineTotal - lineTotal / (1 + rate)`), shown for
 * transparency — never added on top. Kept side-effect-free so the exact
 * same rounding behavior as the Express API is independently verifiable
 * without Firestore.
 */

export function computeLineTotalPaise(pricePaise: number, quantity: number): number {
  return Math.round(pricePaise * quantity);
}

export function computeLineTaxPaise(lineTotalPaise: number, gstRatePercent: number): number {
  const rate = gstRatePercent / 100;
  return Math.round(lineTotalPaise - lineTotalPaise / (1 + rate));
}

export function summarizeCart(items: CartLineResponse[]): Omit<CartResponse, 'items'> {
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalPaise = items.reduce((sum, item) => sum + item.lineTotalPaise, 0);
  const taxPaise = items.reduce(
    (sum, item) => sum + computeLineTaxPaise(item.lineTotalPaise, item.gstRatePercent),
    0,
  );
  return { itemCount, subtotalPaise, taxPaise };
}
