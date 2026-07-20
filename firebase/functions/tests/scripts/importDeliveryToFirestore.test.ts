import { describe, it, expect } from 'vitest';
import {
  toFirestoreDeliveryZoneDoc,
  toFirestoreServiceablePincodeDoc,
  parseArgs,
  type ExportedDeliveryZone,
  type ExportedPincode,
} from '../../scripts/importDeliveryToFirestore';

function zone(overrides: Partial<ExportedDeliveryZone> = {}): ExportedDeliveryZone {
  return {
    id: 'cuid-zone-1',
    name: 'Hyderabad Core',
    description: 'Inner city zone',
    deliveryCharge: '20.00',
    freeDeliveryLimit: '499.00',
    minEtaMinutes: 20,
    maxEtaMinutes: 45,
    isActive: true,
    ...overrides,
  };
}

function pincode(overrides: Partial<ExportedPincode> = {}): ExportedPincode {
  return { code: '500001', city: 'Hyderabad', state: 'Telangana', zoneId: 'cuid-zone-1', isServiceable: true, ...overrides };
}

describe('toFirestoreDeliveryZoneDoc', () => {
  it('converts deliveryCharge/freeDeliveryLimit to paise', () => {
    const doc = toFirestoreDeliveryZoneDoc(zone());
    expect(doc.deliveryChargePaise).toBe(2000);
    expect(doc.freeDeliveryLimitPaise).toBe(49900);
  });

  it('carries name/description/eta/isActive through unchanged', () => {
    const doc = toFirestoreDeliveryZoneDoc(zone({ name: 'Outer Zone', description: null, minEtaMinutes: 30, maxEtaMinutes: 60, isActive: false }));
    expect(doc.name).toBe('Outer Zone');
    expect(doc.description).toBeNull();
    expect(doc.minEtaMinutes).toBe(30);
    expect(doc.maxEtaMinutes).toBe(60);
    expect(doc.isActive).toBe(false);
  });

  it('does not include the MySQL cuid id in the document body (used only as the doc ID by the caller)', () => {
    expect(toFirestoreDeliveryZoneDoc(zone())).not.toHaveProperty('id');
  });
});

describe('toFirestoreServiceablePincodeDoc', () => {
  it('carries city/state/zoneId/isServiceable through unchanged', () => {
    const doc = toFirestoreServiceablePincodeDoc(pincode());
    expect(doc).toEqual({ city: 'Hyderabad', state: 'Telangana', zoneId: 'cuid-zone-1', isServiceable: true });
  });

  it('carries a null zoneId through unchanged', () => {
    expect(toFirestoreServiceablePincodeDoc(pincode({ zoneId: null })).zoneId).toBeNull();
  });

  it('does not include the pincode code in the document body (used only as the doc ID by the caller)', () => {
    expect(toFirestoreServiceablePincodeDoc(pincode())).not.toHaveProperty('code');
  });
});

describe('parseArgs', () => {
  it('defaults execute to false (dry run)', () => {
    expect(parseArgs(['export.json'])).toEqual({ filePath: 'export.json', execute: false });
  });

  it('sets execute true only with --execute', () => {
    expect(parseArgs(['export.json', '--execute'])).toEqual({ filePath: 'export.json', execute: true });
  });

  it('throws when no file path is given', () => {
    expect(() => parseArgs([])).toThrow();
  });
});
