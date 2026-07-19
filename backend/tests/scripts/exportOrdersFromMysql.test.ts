import { describe, it, expect } from 'vitest';
import { toExportedOrder } from '../../scripts/exportOrdersFromMysql.js';

const baseRow = {
  orderNumber: 'TSG-260719-00000001',
  userId: 'user-1',
  status: 'CONFIRMED',
  paymentStatus: 'PENDING',
  shipContactName: 'Asha Rao',
  shipContactPhone: '9876543210',
  shipLine1: '123 Main St',
  shipLine2: null,
  shipLandmark: null,
  shipPincode: '500001',
  shipCity: 'Hyderabad',
  shipState: 'Telangana',
  subtotal: { toString: () => '500.00' },
  discount: { toString: () => '50.00' },
  taxTotal: { toString: () => '25.00' },
  deliveryCharge: { toString: () => '30.00' },
  total: { toString: () => '480.00' },
  deliveryZoneId: 'zone-cuid-1',
  etaMinMinutes: 20,
  etaMaxMinutes: 45,
  notes: null,
  placedAt: new Date('2026-07-19T10:00:00Z'),
  deliveredAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-07-19T10:00:00Z'),
  updatedAt: new Date('2026-07-19T10:00:00Z'),
  items: [
    {
      variantId: 'ALM-500',
      productName: 'Premium Almonds',
      variantLabel: '500 g',
      sku: 'ALM-500',
      imageUrl: 'https://example.test/img.jpg',
      unitPrice: { toString: () => '500.00' },
      gstRate: { toString: () => '5.00' },
      quantity: 1,
      lineTotal: { toString: () => '500.00' },
    },
  ],
  statusHistory: [{ status: 'CONFIRMED', note: 'Order placed', createdAt: new Date('2026-07-19T10:00:00Z') }],
  payment: {
    method: 'COD',
    status: 'PENDING',
    amount: { toString: () => '480.00' },
    currency: 'INR',
    razorpayOrderId: null,
    razorpayPaymentId: null,
    razorpaySignature: null,
    refundId: null,
    refundedAmount: { toString: () => '0.00' },
    paidAt: null,
  },
};

describe('toExportedOrder', () => {
  it('stringifies all Decimal fields via toString()', () => {
    const result = toExportedOrder(baseRow, null, null);
    expect(result.subtotal).toBe('500.00');
    expect(result.discount).toBe('50.00');
    expect(result.taxTotal).toBe('25.00');
    expect(result.deliveryCharge).toBe('30.00');
    expect(result.total).toBe('480.00');
  });

  it('carries couponCode/rewardCouponCode through when passed', () => {
    const result = toExportedOrder(baseRow, 'SAVE10', null);
    expect(result.couponCode).toBe('SAVE10');
    expect(result.rewardCouponCode).toBeNull();
    const result2 = toExportedOrder(baseRow, null, 'SPIN-ABCD1234');
    expect(result2.rewardCouponCode).toBe('SPIN-ABCD1234');
  });

  it('derives paymentMethod from the payment row, defaulting to COD when there is none', () => {
    expect(toExportedOrder(baseRow, null, null).paymentMethod).toBe('COD');
    expect(toExportedOrder({ ...baseRow, payment: null }, null, null).paymentMethod).toBe('COD');
    expect(toExportedOrder({ ...baseRow, payment: { ...baseRow.payment, method: 'RAZORPAY' } }, null, null).paymentMethod).toBe(
      'RAZORPAY',
    );
  });

  it('converts every date field to an ISO string', () => {
    const result = toExportedOrder(baseRow, null, null);
    expect(result.placedAt).toBe('2026-07-19T10:00:00.000Z');
    expect(result.createdAt).toBe('2026-07-19T10:00:00.000Z');
  });

  it('carries null deliveredAt/cancelledAt through, and non-null when present', () => {
    expect(toExportedOrder(baseRow, null, null).deliveredAt).toBeNull();
    const delivered = toExportedOrder({ ...baseRow, deliveredAt: new Date('2026-07-20T00:00:00Z') }, null, null);
    expect(delivered.deliveredAt).toBe('2026-07-20T00:00:00.000Z');
  });

  it('maps every order item, stringifying its Decimal fields', () => {
    const result = toExportedOrder(baseRow, null, null);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ sku: 'ALM-500', unitPrice: '500.00', gstRate: '5.00', lineTotal: '500.00' });
  });

  it('maps status history in order, converting createdAt to ISO', () => {
    const result = toExportedOrder(baseRow, null, null);
    expect(result.statusHistory).toEqual([{ status: 'CONFIRMED', note: 'Order placed', createdAt: '2026-07-19T10:00:00.000Z' }]);
  });

  it('maps payment when present, and produces null when absent', () => {
    const result = toExportedOrder(baseRow, null, null);
    expect(result.payment).toMatchObject({ method: 'COD', status: 'PENDING', amount: '480.00' });
    expect(toExportedOrder({ ...baseRow, payment: null }, null, null).payment).toBeNull();
  });

  it('carries the raw MySQL deliveryZoneId through as historical metadata (not resolved to a Firestore doc)', () => {
    expect(toExportedOrder(baseRow, null, null).deliveryZoneId).toBe('zone-cuid-1');
  });
});
