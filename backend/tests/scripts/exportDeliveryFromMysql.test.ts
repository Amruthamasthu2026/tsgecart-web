import { describe, it, expect } from 'vitest';
import { toExportedDeliveryZone, toExportedPincode } from '../../scripts/exportDeliveryFromMysql.js';

describe('toExportedDeliveryZone', () => {
  it('stringifies Decimal fields and carries the id through', () => {
    const result = toExportedDeliveryZone({
      id: 'cuid-zone-1',
      name: 'Hyderabad Core',
      description: 'Inner city zone',
      deliveryCharge: { toString: () => '20.00' },
      freeDeliveryLimit: { toString: () => '499.00' },
      minEtaMinutes: 20,
      maxEtaMinutes: 45,
      isActive: true,
    });
    expect(result).toEqual({
      id: 'cuid-zone-1',
      name: 'Hyderabad Core',
      description: 'Inner city zone',
      deliveryCharge: '20.00',
      freeDeliveryLimit: '499.00',
      minEtaMinutes: 20,
      maxEtaMinutes: 45,
      isActive: true,
    });
  });

  it('carries a null description through unchanged', () => {
    const result = toExportedDeliveryZone({
      id: 'cuid-zone-2',
      name: 'Outer Zone',
      description: null,
      deliveryCharge: { toString: () => '0.00' },
      freeDeliveryLimit: { toString: () => '0.00' },
      minEtaMinutes: 30,
      maxEtaMinutes: 60,
      isActive: false,
    });
    expect(result.description).toBeNull();
  });
});

describe('toExportedPincode', () => {
  it('carries all fields through unchanged', () => {
    const result = toExportedPincode({ code: '500001', city: 'Hyderabad', state: 'Telangana', zoneId: 'cuid-zone-1', isServiceable: true });
    expect(result).toEqual({ code: '500001', city: 'Hyderabad', state: 'Telangana', zoneId: 'cuid-zone-1', isServiceable: true });
  });

  it('carries a null zoneId through unchanged (unassigned pincode)', () => {
    const result = toExportedPincode({ code: '500002', city: 'Hyderabad', state: 'Telangana', zoneId: null, isServiceable: false });
    expect(result.zoneId).toBeNull();
  });
});
