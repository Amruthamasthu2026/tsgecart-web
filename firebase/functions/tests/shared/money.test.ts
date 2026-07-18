import { describe, it, expect } from 'vitest';
import { rupeesToPaise, paiseToRupees } from '../../src/shared/money';

describe('rupeesToPaise', () => {
  it('converts a whole rupee amount', () => {
    expect(rupeesToPaise(200)).toBe(20000);
  });

  it('converts a decimal rupee amount', () => {
    expect(rupeesToPaise(199.5)).toBe(19950);
  });

  it('accepts a decimal string (as Prisma Decimal serializes)', () => {
    expect(rupeesToPaise('49.99')).toBe(4999);
  });

  it('rounds to the nearest paisa for floating point noise', () => {
    expect(rupeesToPaise(10.005)).toBe(1001);
  });

  it('throws for a non-finite value', () => {
    expect(() => rupeesToPaise('not-a-number')).toThrow();
    expect(() => rupeesToPaise(Infinity)).toThrow();
  });
});

describe('paiseToRupees', () => {
  it('converts back to rupees', () => {
    expect(paiseToRupees(20000)).toBe(200);
    expect(paiseToRupees(19950)).toBe(199.5);
  });

  it('round-trips with rupeesToPaise', () => {
    expect(paiseToRupees(rupeesToPaise(149.75))).toBe(149.75);
  });
});
