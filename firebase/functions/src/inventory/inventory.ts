import { InsufficientStockError } from '../shared/errors';

/**
 * Pure inventory/reservation arithmetic, shared by every cart Function that
 * touches `inventory/{sku}` inside a Firestore transaction (see
 * `cart/cart.function.ts`). Kept side-effect-free and decoupled from
 * Firestore so it's unit-testable without the emulator — the "pure
 * function + thin wrapper" pattern used throughout this codebase.
 *
 * This is new behavior beyond the existing Express app: the current
 * MySQL/Prisma `Inventory.reserved` column exists in the schema but is
 * never written anywhere in the codebase (confirmed by a full-repo grep) —
 * cart-time stock checks there are read-only/advisory, and the only real
 * stock mutation happens at order-creation time. Phase 4 explicitly asks
 * for real cart-time reservation ("prevent adding more than available
 * stock," "reserved stock changes" under Firestore transactions), so this
 * is a deliberate improvement over current behavior, not a parity port.
 */

/** Matches the Express cart's per-line cap exactly (`cart.service.ts` MAX_QTY_PER_ITEM). */
export const MAX_QTY_PER_ITEM = 20;

export function computeAvailable(stock: number, reserved: number): number {
  return Math.max(0, stock - reserved);
}

export function computeIsLowStock(stock: number, reserved: number, lowStockThreshold: number): boolean {
  return computeAvailable(stock, reserved) <= lowStockThreshold;
}

export interface InventorySnapshot {
  stock: number;
  reserved: number;
  lowStockThreshold: number;
}

export interface ReservationAdjustment {
  newReserved: number;
  newAvailableStock: number;
  newIsLowStock: boolean;
}

/**
 * Computes the new reservation state for a `+delta` (reserving more) or
 * `-delta` (releasing) change. Throws `InsufficientStockError` if reserving
 * more than is currently available; never lets `reserved` go negative
 * (a release larger than the current reservation is clamped to zero rather
 * than throwing, since "release everything this cart line ever reserved"
 * must always succeed even if inventory shrank in the meantime).
 */
export function applyReservationDelta(inventory: InventorySnapshot, delta: number): ReservationAdjustment {
  if (delta > 0) {
    const available = computeAvailable(inventory.stock, inventory.reserved);
    if (delta > available) {
      throw new InsufficientStockError(available);
    }
  }
  const newReserved = Math.max(0, inventory.reserved + delta);
  return {
    newReserved,
    newAvailableStock: computeAvailable(inventory.stock, newReserved),
    newIsLowStock: computeIsLowStock(inventory.stock, newReserved, inventory.lowStockThreshold),
  };
}
