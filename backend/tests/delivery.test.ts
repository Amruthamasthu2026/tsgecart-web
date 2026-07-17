import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= 'test_access_secret_value_123456';
  process.env.JWT_REFRESH_SECRET ??= 'test_refresh_secret_value_123456';
  process.env.DATABASE_URL ??= 'mysql://root:root@localhost:3306/test';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
});

describe('delivery charge computation', () => {
  it('waives delivery when subtotal meets the free-delivery limit', async () => {
    const { deliveryService } = await import('../src/modules/delivery/delivery.service.js');
    const zone = { deliveryCharge: 25, freeDeliveryLimit: 499 };
    expect(deliveryService.computeDeliveryCharge(zone, 500)).toBe(0);
    expect(deliveryService.computeDeliveryCharge(zone, 499)).toBe(0);
    expect(deliveryService.computeDeliveryCharge(zone, 498)).toBe(25);
  });

  it('always charges when there is no free-delivery limit', async () => {
    const { deliveryService } = await import('../src/modules/delivery/delivery.service.js');
    const zone = { deliveryCharge: 30, freeDeliveryLimit: 0 };
    expect(deliveryService.computeDeliveryCharge(zone, 10_000)).toBe(30);
  });
});
