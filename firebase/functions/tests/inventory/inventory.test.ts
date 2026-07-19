import { describe, it, expect } from 'vitest';
import {
  computeAvailable,
  computeIsLowStock,
  applyReservationDelta,
  consumeStockForOrder,
  restockInventory,
  MAX_QTY_PER_ITEM,
} from '../../src/inventory/inventory';
import { InsufficientStockError } from '../../src/shared/errors';

describe('computeAvailable', () => {
  it('subtracts reserved from stock', () => {
    expect(computeAvailable(20, 5)).toBe(15);
  });

  it('never goes negative even if reserved exceeds stock', () => {
    expect(computeAvailable(5, 10)).toBe(0);
  });
});

describe('computeIsLowStock', () => {
  it('is true when available is at or below the threshold', () => {
    expect(computeIsLowStock(10, 5, 5)).toBe(true); // available=5, threshold=5
    expect(computeIsLowStock(10, 6, 5)).toBe(true); // available=4
  });

  it('is false when available is above the threshold', () => {
    expect(computeIsLowStock(20, 5, 5)).toBe(false); // available=15
  });

  it('is true when stock is fully depleted', () => {
    expect(computeIsLowStock(0, 0, 5)).toBe(true);
  });
});

describe('applyReservationDelta', () => {
  it('increases reserved when reserving more (positive delta) within availability', () => {
    const result = applyReservationDelta({ stock: 20, reserved: 5, lowStockThreshold: 3 }, 4);
    expect(result.newReserved).toBe(9);
    expect(result.newAvailableStock).toBe(11);
  });

  it('throws InsufficientStockError when reserving more than available', () => {
    expect(() => applyReservationDelta({ stock: 10, reserved: 8, lowStockThreshold: 3 }, 5)).toThrow(
      InsufficientStockError,
    );
  });

  it('the InsufficientStockError carries the actual available count', () => {
    try {
      applyReservationDelta({ stock: 10, reserved: 8, lowStockThreshold: 3 }, 5);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientStockError);
      expect((err as InsufficientStockError).details).toEqual({ available: 2 });
    }
  });

  it('allows reserving exactly the available amount (boundary)', () => {
    const result = applyReservationDelta({ stock: 10, reserved: 8, lowStockThreshold: 3 }, 2);
    expect(result.newReserved).toBe(10);
    expect(result.newAvailableStock).toBe(0);
  });

  it('releases reservation on negative delta', () => {
    const result = applyReservationDelta({ stock: 20, reserved: 10, lowStockThreshold: 3 }, -4);
    expect(result.newReserved).toBe(6);
  });

  it('clamps a release larger than the current reservation to zero, never negative', () => {
    const result = applyReservationDelta({ stock: 20, reserved: 3, lowStockThreshold: 3 }, -10);
    expect(result.newReserved).toBe(0);
  });

  it('recomputes isLowStock after the adjustment', () => {
    const result = applyReservationDelta({ stock: 10, reserved: 0, lowStockThreshold: 3 }, 8);
    expect(result.newAvailableStock).toBe(2);
    expect(result.newIsLowStock).toBe(true);
  });

  it('a zero delta is a no-op that never throws even at zero availability', () => {
    const result = applyReservationDelta({ stock: 5, reserved: 5, lowStockThreshold: 3 }, 0);
    expect(result.newReserved).toBe(5);
    expect(result.newAvailableStock).toBe(0);
  });
});

describe('MAX_QTY_PER_ITEM', () => {
  it('matches the Express cart service cap exactly', () => {
    expect(MAX_QTY_PER_ITEM).toBe(20);
  });
});

describe('consumeStockForOrder', () => {
  it('decrements both stock and reserved by the same quantity (converts a hold into a sale)', () => {
    const result = consumeStockForOrder({ stock: 20, reserved: 5, lowStockThreshold: 3 }, 5);
    expect(result.newStock).toBe(15);
    expect(result.newReserved).toBe(0);
  });

  it('leaves availableStock unchanged (item was already unavailable to others while reserved)', () => {
    const before = computeAvailable(20, 5);
    const result = consumeStockForOrder({ stock: 20, reserved: 5, lowStockThreshold: 3 }, 5);
    expect(result.newAvailableStock).toBe(before);
  });

  it('throws InsufficientStockError if quantity exceeds real stock', () => {
    expect(() => consumeStockForOrder({ stock: 3, reserved: 3, lowStockThreshold: 1 }, 5)).toThrow(
      InsufficientStockError,
    );
  });

  it('the InsufficientStockError carries the actual stock count, not availableStock', () => {
    try {
      consumeStockForOrder({ stock: 3, reserved: 3, lowStockThreshold: 1 }, 5);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as InsufficientStockError).details).toEqual({ available: 3 });
    }
  });

  it('clamps reserved at 0 rather than going negative if quantity exceeds the pooled reservation', () => {
    // e.g. inventory.reserved was already partially released by another
    // process — consuming for this order must not push it negative.
    const result = consumeStockForOrder({ stock: 20, reserved: 2, lowStockThreshold: 3 }, 5);
    expect(result.newReserved).toBe(0);
    expect(result.newStock).toBe(15);
  });

  it('recomputes isLowStock after consumption', () => {
    const result = consumeStockForOrder({ stock: 10, reserved: 10, lowStockThreshold: 3 }, 8);
    expect(result.newStock).toBe(2);
    expect(result.newIsLowStock).toBe(true);
  });
});

describe('restockInventory', () => {
  it('increments stock by quantity, leaving reserved untouched', () => {
    const result = restockInventory({ stock: 5, reserved: 2, lowStockThreshold: 3 }, 4);
    expect(result.newStock).toBe(9);
  });

  it('recomputes isLowStock after restocking', () => {
    const result = restockInventory({ stock: 0, reserved: 0, lowStockThreshold: 3 }, 10);
    expect(result.newIsLowStock).toBe(false);
  });
});
