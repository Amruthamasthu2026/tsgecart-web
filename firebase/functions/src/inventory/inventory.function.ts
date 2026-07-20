import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin';
import { requirePermission } from '../shared/auth';
import { parseInput } from '../shared/validation';
import { AppError, NotFoundError } from '../shared/errors';
import { computeAvailable, computeIsLowStock } from './inventory';
import type { FirestoreInventoryDoc } from './inventory.types';

/**
 * Admin inventory adjustment, migration Phase 6 — ports
 * `PATCH /admin/inventory/:variantId` (`backend/src/modules/admin/admin.routes.ts`).
 * `inventory/{sku}` is Function-only for every write (see
 * firestore.rules — unchanged since Phase 4), so this is the one and only
 * way, including for an admin, to correct a stock count or low-stock
 * threshold. Recomputes `isLowStock` and the denormalized public
 * `productVariants/{sku}.availableStock` in the same transaction, exactly
 * like every other inventory-writing Function in this codebase
 * (`cart.function.ts`, `orders.function.ts`).
 */

const adjustInventorySchema = z.object({
  variantId: z.string().min(1),
  stock: z.number().int().min(0).nullish().transform((v) => v ?? undefined),
  lowStockThreshold: z.number().int().min(0).nullish().transform((v) => v ?? undefined),
});

export type AdjustInventoryInput = z.output<typeof adjustInventorySchema>;

export async function adminAdjustInventoryTx(input: AdjustInventoryInput): Promise<void> {
  if (input.stock === undefined && input.lowStockThreshold === undefined) {
    return; // nothing to change — matches Express's PATCH accepting a partial body
  }

  const invRef = db.collection('inventory').doc(input.variantId);
  const variantRef = db.collection('productVariants').doc(input.variantId);

  await db.runTransaction(async (tx) => {
    const [invSnap, variantSnap] = await Promise.all([tx.get(invRef), tx.get(variantRef)]);
    if (!invSnap.exists) throw new NotFoundError('Inventory record not found');
    const inventory = invSnap.data() as FirestoreInventoryDoc;

    const newStock = input.stock ?? inventory.stock;
    const newThreshold = input.lowStockThreshold ?? inventory.lowStockThreshold;
    const now = FieldValue.serverTimestamp();

    tx.update(invRef, {
      stock: newStock,
      lowStockThreshold: newThreshold,
      isLowStock: computeIsLowStock(newStock, inventory.reserved, newThreshold),
      updatedAt: now,
    });
    if (variantSnap.exists) {
      tx.update(variantRef, { availableStock: computeAvailable(newStock, inventory.reserved), updatedAt: now });
    }
  });
}

export const adminAdjustInventory = onCall(async (request: CallableRequest) => {
  try {
    requirePermission(request, 'inventory.manage');
    const input = parseInput(adjustInventorySchema, request.data);
    await adminAdjustInventoryTx(input);
    return { adjusted: true };
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});
