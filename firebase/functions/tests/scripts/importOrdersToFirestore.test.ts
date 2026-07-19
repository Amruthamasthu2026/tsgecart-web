import { describe, it, expect } from 'vitest';
import {
  toFirestoreOrderDoc,
  toFirestoreOrderItemDoc,
  toFirestoreOrderStatusHistoryDoc,
  toFirestorePaymentRecordDoc,
  parseArgs,
  type ExportedOrder,
} from '../../scripts/importOrdersToFirestore';

function order(overrides: Partial<ExportedOrder> = {}): ExportedOrder {
  return {
    orderNumber: 'TSG-260719-00000001',
    userId: 'user-1',
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    paymentMethod: 'COD',
    shipContactName: 'Asha Rao',
    shipContactPhone: '9876543210',
    shipLine1: '123 Main St',
    shipLine2: null,
    shipLandmark: null,
    shipPincode: '500001',
    shipCity: 'Hyderabad',
    shipState: 'Telangana',
    subtotal: '500.00',
    discount: '50.00',
    taxTotal: '25.00',
    deliveryCharge: '30.00',
    total: '480.00',
    couponCode: null,
    rewardCouponCode: null,
    deliveryZoneId: 'zone-cuid-1',
    etaMinMinutes: 20,
    etaMaxMinutes: 45,
    notes: null,
    placedAt: '2026-07-19T10:00:00.000Z',
    deliveredAt: null,
    cancelledAt: null,
    createdAt: '2026-07-19T10:00:00.000Z',
    updatedAt: '2026-07-19T10:00:00.000Z',
    items: [
      { variantId: 'ALM-500', productName: 'Premium Almonds', variantLabel: '500 g', sku: 'ALM-500', imageUrl: null, unitPrice: '500.00', gstRate: '5.00', quantity: 1, lineTotal: '500.00' },
    ],
    statusHistory: [{ status: 'CONFIRMED', note: 'Order placed', createdAt: '2026-07-19T10:00:00.000Z' }],
    payment: { method: 'COD', status: 'PENDING', amount: '480.00', currency: 'INR', razorpayOrderId: null, razorpayPaymentId: null, razorpaySignature: null, refundId: null, refundedAmount: '0.00', paidAt: null },
    ...overrides,
  };
}

describe('toFirestoreOrderDoc', () => {
  it('converts every money field from rupees to paise', () => {
    const doc = toFirestoreOrderDoc(order());
    expect(doc.subtotalPaise).toBe(50000);
    expect(doc.discountPaise).toBe(5000);
    expect(doc.taxPaise).toBe(2500);
    expect(doc.deliveryChargePaise).toBe(3000);
    expect(doc.totalPaise).toBe(48000);
  });

  it('always sets convenienceFeePaise to 0 (no fee schedule exists in the source system)', () => {
    expect(toFirestoreOrderDoc(order()).convenienceFeePaise).toBe(0);
  });

  it('carries orderNumber/userId/status/paymentStatus/paymentMethod through unchanged', () => {
    const doc = toFirestoreOrderDoc(order({ status: 'DELIVERED', paymentStatus: 'PAID', paymentMethod: 'RAZORPAY' }));
    expect(doc.orderNumber).toBe('TSG-260719-00000001');
    expect(doc.status).toBe('DELIVERED');
    expect(doc.paymentStatus).toBe('PAID');
    expect(doc.paymentMethod).toBe('RAZORPAY');
  });

  it('carries couponCode/rewardCouponCode through, including both null', () => {
    expect(toFirestoreOrderDoc(order()).couponCode).toBeNull();
    expect(toFirestoreOrderDoc(order({ couponCode: 'SAVE10' })).couponCode).toBe('SAVE10');
  });

  it('carries the shipping address snapshot through unchanged', () => {
    const doc = toFirestoreOrderDoc(order());
    expect(doc.shipContactName).toBe('Asha Rao');
    expect(doc.shipPincode).toBe('500001');
  });
});

describe('toFirestoreOrderItemDoc', () => {
  it('converts unitPrice/lineTotal to paise and gstRate to a number', () => {
    const doc = toFirestoreOrderItemDoc(order().items[0]);
    expect(doc.unitPricePaise).toBe(50000);
    expect(doc.lineTotalPaise).toBe(50000);
    expect(doc.gstRatePercent).toBe(5);
  });

  it('falls back to an empty string variantId for a hard-deleted variant (null in the export)', () => {
    const doc = toFirestoreOrderItemDoc({ ...order().items[0], variantId: null });
    expect(doc.variantId).toBe('');
  });
});

describe('toFirestoreOrderStatusHistoryDoc', () => {
  it('carries status/note through and keeps createdAt as the ISO string for the caller to convert', () => {
    const doc = toFirestoreOrderStatusHistoryDoc({ status: 'CANCELLED', note: 'Cancelled by customer', createdAt: '2026-07-19T12:00:00.000Z' });
    expect(doc).toEqual({ status: 'CANCELLED', note: 'Cancelled by customer', createdAt: '2026-07-19T12:00:00.000Z' });
  });
});

describe('toFirestorePaymentRecordDoc', () => {
  it('converts amount/refundedAmount to paise', () => {
    const doc = toFirestorePaymentRecordDoc(order());
    expect(doc?.amountPaise).toBe(48000);
    expect(doc?.refundedAmountPaise).toBe(0);
  });

  it('returns null when the exported order has no payment row', () => {
    expect(toFirestorePaymentRecordDoc(order({ payment: null }))).toBeNull();
  });

  it('uses the order number as orderId (matches the Firestore doc-ID convention)', () => {
    expect(toFirestorePaymentRecordDoc(order())?.orderId).toBe('TSG-260719-00000001');
  });

  it('carries Razorpay identifiers through, including all-null for a COD order', () => {
    const doc = toFirestorePaymentRecordDoc(order());
    expect(doc?.razorpayOrderId).toBeNull();
    expect(doc?.razorpayPaymentId).toBeNull();
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
