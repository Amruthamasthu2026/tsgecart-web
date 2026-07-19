import { describe, it, expect } from 'vitest';
import { computeDeliveryChargePaise } from '../../src/delivery/delivery';

describe('computeDeliveryChargePaise', () => {
  it('charges the zone delivery fee when subtotal is below the free-delivery threshold', () => {
    expect(computeDeliveryChargePaise({ deliveryChargePaise: 3000, freeDeliveryLimitPaise: 50000 }, 20000)).toBe(3000);
  });

  it('waives delivery charge when subtotal meets the free-delivery threshold', () => {
    expect(computeDeliveryChargePaise({ deliveryChargePaise: 3000, freeDeliveryLimitPaise: 50000 }, 50000)).toBe(0);
  });

  it('waives delivery charge when subtotal exceeds the free-delivery threshold', () => {
    expect(computeDeliveryChargePaise({ deliveryChargePaise: 3000, freeDeliveryLimitPaise: 50000 }, 99999)).toBe(0);
  });

  it('a zero freeDeliveryLimitPaise means "no threshold configured", not "always free"', () => {
    expect(computeDeliveryChargePaise({ deliveryChargePaise: 3000, freeDeliveryLimitPaise: 0 }, 1_000_000)).toBe(3000);
  });
});
