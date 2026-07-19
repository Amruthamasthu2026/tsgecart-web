import { randomInt } from 'node:crypto';
import { computeLineTaxPaise } from '../cart/cart.queries';
import type { OrderStatus } from './orders.types';

/**
 * Pure order arithmetic + status-transition rules, mirroring
 * `backend/src/modules/orders/orders.service.ts` exactly (totals formula,
 * `TRANSITIONS` map, `CANCELLABLE` set, `generateOrderNumber`'s format).
 * Kept side-effect-free — Firestore reads/writes/transactions live in
 * `orders.function.ts`.
 */

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['PACKED', 'CANCELLED'],
  PACKED: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export const CUSTOMER_CANCELLABLE_STATUSES: OrderStatus[] = ['CONFIRMED', 'PREPARING'];

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

/** Matches `backend/src/shared/tokens.ts`'s `generateOrderNumber` format: `TSG-YYMMDD-########`. */
export function generateOrderNumber(now: Date = new Date()): string {
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  let digits = '';
  for (let i = 0; i < 8; i++) {
    digits += randomInt(0, 10).toString();
  }
  return `TSG-${yy}${mm}${dd}-${digits}`;
}

export interface OrderLineForTotals {
  lineTotalPaise: number;
  gstRatePercent: number;
}

export function sumLineTotalsPaise(lines: OrderLineForTotals[]): number {
  return lines.reduce((sum, l) => sum + l.lineTotalPaise, 0);
}

export interface OrderTotals {
  subtotalPaise: number;
  taxPaise: number;
  discountPaise: number;
  deliveryChargePaise: number;
  convenienceFeePaise: number;
  totalPaise: number;
}

/**
 * `totalPaise = max(0, subtotal - discount) + deliveryCharge + convenienceFee`,
 * exactly matching `orders.service.ts`'s `grandTotal` formula (this
 * migration has no wallet-redemption step — see the Phase 5 completion
 * report — so unlike Express's `Order.total`, there is no further
 * wallet-deduction stage; `totalPaise` is the full payable amount).
 * `discountPaise` is clamped to never exceed the subtotal, defending
 * against a coupon/reward discount larger than the cart even if upstream
 * validation had a bug.
 */
export function computeOrderTotals(
  lines: OrderLineForTotals[],
  discountPaise: number,
  deliveryChargePaise: number,
  convenienceFeePaise = 0,
): OrderTotals {
  const subtotalPaise = sumLineTotalsPaise(lines);
  const taxPaise = lines.reduce((sum, l) => sum + computeLineTaxPaise(l.lineTotalPaise, l.gstRatePercent), 0);
  const clampedDiscountPaise = Math.max(0, Math.min(discountPaise, subtotalPaise));
  const totalPaise = Math.max(0, subtotalPaise - clampedDiscountPaise) + deliveryChargePaise + convenienceFeePaise;
  return {
    subtotalPaise,
    taxPaise,
    discountPaise: clampedDiscountPaise,
    deliveryChargePaise,
    convenienceFeePaise,
    totalPaise,
  };
}
