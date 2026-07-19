import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin';
import { requireAuthenticatedCaller } from '../shared/auth';
import { parseInput } from '../shared/validation';
import { AppError, NotFoundError, BadRequestError } from '../shared/errors';
import { applyReservationDelta, MAX_QTY_PER_ITEM } from '../inventory/inventory';
import { computeLineTotalPaise, summarizeCart } from './cart.queries';
import type { FirestoreVariantDoc } from '../catalog/variants.types';
import type { FirestoreInventoryDoc } from '../inventory/inventory.types';
import type { FirestoreProductDoc } from '../catalog/catalog.types';
import type { CartLineResponse, CartResponse, FirestoreCartItemDoc } from './cart.types';

/**
 * Per-user cart, migration Phase 4. Every mutation is a Callable Function
 * running a Firestore transaction across the cart item doc AND the
 * variant's `inventory` doc together — never a direct client write (see
 * firestore.rules: `carts/{uid}` is read-only for the owner, write: false)
 * — because reserving stock atomically alongside the cart write is exactly
 * the kind of cross-document invariant a client cannot be trusted to
 * execute honestly (docs/firebase-migration-audit.md §27, §17). This is
 * also why `getCart`/every mutation here always computes prices/totals
 * fresh from the current `productVariants` docs — never from a client-
 * supplied price — matching the existing Express `cartService` exactly
 * (see cart.queries.ts).
 *
 * The caller's own Firebase uid (`request.auth.uid`) is always the cart
 * being read/written — no function here accepts a `uid` parameter from the
 * client, so there is no way to operate on someone else's cart.
 */

function cartItemsCollection(uid: string) {
  return db.collection('carts').doc(uid).collection('items');
}

function variantRef(variantId: string) {
  return db.collection('productVariants').doc(variantId);
}

function inventoryRef(variantId: string) {
  return db.collection('inventory').doc(variantId);
}

export async function fetchCart(uid: string): Promise<CartResponse> {
  const itemsSnap = await cartItemsCollection(uid).get();
  if (itemsSnap.empty) {
    return { items: [], itemCount: 0, subtotalPaise: 0, taxPaise: 0 };
  }

  const itemDocs = itemsSnap.docs.map((d) => d.data() as FirestoreCartItemDoc);
  const variantSnaps = await Promise.all(itemDocs.map((item) => variantRef(item.variantId).get()));

  const lines: CartLineResponse[] = [];
  for (let i = 0; i < itemDocs.length; i++) {
    const item = itemDocs[i];
    const variantSnap = variantSnaps[i];
    // A variant that's been hard-deleted since being added simply drops out
    // of the cart's totals — matches the Express API's plain SQL join,
    // which likewise can't surface a row for a deleted variant.
    if (!variantSnap.exists) continue;
    const variant = variantSnap.data() as FirestoreVariantDoc;
    const productSnap = await db.collection('products').doc(variant.productId).get();
    const product = productSnap.exists ? (productSnap.data() as FirestoreProductDoc) : null;

    const lineTotalPaise = computeLineTotalPaise(variant.pricePaise, item.quantity);
    lines.push({
      variantId: item.variantId,
      productId: variant.productId,
      productSlug: product?.slug ?? variant.productId,
      productName: product?.name ?? 'Unknown product',
      image: product?.images[0] ?? null,
      unitLabel: variant.unitLabel,
      sku: item.variantId,
      pricePaise: variant.pricePaise,
      mrpPaise: variant.mrpPaise,
      gstRatePercent: product?.gstRatePercent ?? 0,
      quantity: item.quantity,
      lineTotalPaise,
      inStock: variant.isActive && (product?.isActive ?? false) && variant.availableStock > 0,
      availableStock: variant.availableStock,
    });
  }

  return { items: lines, ...summarizeCart(lines) };
}

async function assertSellableVariant(
  variantSnap: FirebaseFirestore.DocumentSnapshot,
): Promise<FirestoreVariantDoc> {
  if (!variantSnap.exists) throw new NotFoundError('Variant not found');
  const variant = variantSnap.data() as FirestoreVariantDoc;
  if (!variant.isActive) throw new BadRequestError('This variant is no longer available');
  const productSnap = await db.collection('products').doc(variant.productId).get();
  if (!productSnap.exists || !(productSnap.data() as FirestoreProductDoc).isActive) {
    throw new BadRequestError('This product is no longer available');
  }
  return variant;
}

export async function addCartItemTx(uid: string, variantId: string, requestedQuantity: number): Promise<CartResponse> {
  await db.runTransaction(async (tx) => {
    const vRef = variantRef(variantId);
    const iRef = inventoryRef(variantId);
    const itemRef = cartItemsCollection(uid).doc(variantId);

    const [variantSnap, inventorySnap, itemSnap] = await Promise.all([tx.get(vRef), tx.get(iRef), tx.get(itemRef)]);

    // assertSellableVariant does its own product read; run it after the
    // transactional reads above so all `tx.get()` calls stay grouped before
    // any writes (Firestore transaction requirement).
    await assertSellableVariant(variantSnap);
    if (!inventorySnap.exists) throw new NotFoundError('Inventory record not found');
    const inventory = inventorySnap.data() as FirestoreInventoryDoc;

    const existingQuantity = itemSnap.exists ? (itemSnap.data() as FirestoreCartItemDoc).quantity : 0;
    const newQuantity = existingQuantity + requestedQuantity;
    if (newQuantity > MAX_QTY_PER_ITEM) {
      throw new BadRequestError(`You can add at most ${MAX_QTY_PER_ITEM} of this item`);
    }

    const adjustment = applyReservationDelta(inventory, requestedQuantity);
    const now = FieldValue.serverTimestamp();
    tx.update(iRef, { reserved: adjustment.newReserved, isLowStock: adjustment.newIsLowStock, updatedAt: now });
    tx.update(vRef, { availableStock: adjustment.newAvailableStock, updatedAt: now });
    if (itemSnap.exists) {
      tx.update(itemRef, { quantity: newQuantity, updatedAt: now });
    } else {
      tx.set(itemRef, { variantId, quantity: newQuantity, addedAt: now, updatedAt: now });
    }
  });

  return fetchCart(uid);
}

export async function updateCartItemQuantityTx(
  uid: string,
  variantId: string,
  newQuantity: number,
): Promise<CartResponse> {
  await db.runTransaction(async (tx) => {
    const vRef = variantRef(variantId);
    const iRef = inventoryRef(variantId);
    const itemRef = cartItemsCollection(uid).doc(variantId);

    const [variantSnap, inventorySnap, itemSnap] = await Promise.all([tx.get(vRef), tx.get(iRef), tx.get(itemRef)]);

    if (newQuantity === 0) {
      if (!itemSnap.exists) return; // idempotent — nothing to remove
      if (inventorySnap.exists) {
        const existingQuantity = (itemSnap.data() as FirestoreCartItemDoc).quantity;
        const inventory = inventorySnap.data() as FirestoreInventoryDoc;
        const adjustment = applyReservationDelta(inventory, -existingQuantity);
        const now = FieldValue.serverTimestamp();
        tx.update(iRef, { reserved: adjustment.newReserved, isLowStock: adjustment.newIsLowStock, updatedAt: now });
        if (variantSnap.exists) {
          tx.update(vRef, { availableStock: adjustment.newAvailableStock, updatedAt: now });
        }
      }
      tx.delete(itemRef);
      return;
    }

    if (!itemSnap.exists) throw new NotFoundError('Cart item not found');
    await assertSellableVariant(variantSnap);
    if (!inventorySnap.exists) throw new NotFoundError('Inventory record not found');
    const inventory = inventorySnap.data() as FirestoreInventoryDoc;

    const existingQuantity = (itemSnap.data() as FirestoreCartItemDoc).quantity;
    const delta = newQuantity - existingQuantity;
    const now = FieldValue.serverTimestamp();
    if (delta !== 0) {
      const adjustment = applyReservationDelta(inventory, delta);
      tx.update(iRef, { reserved: adjustment.newReserved, isLowStock: adjustment.newIsLowStock, updatedAt: now });
      tx.update(vRef, { availableStock: adjustment.newAvailableStock, updatedAt: now });
    }
    tx.update(itemRef, { quantity: newQuantity, updatedAt: now });
  });

  return fetchCart(uid);
}

export async function removeCartItemTx(uid: string, variantId: string): Promise<CartResponse> {
  return updateCartItemQuantityTx(uid, variantId, 0);
}

export async function clearCartTx(uid: string): Promise<CartResponse> {
  const itemsSnap = await cartItemsCollection(uid).get();
  if (itemsSnap.empty) return fetchCart(uid);
  const itemRefs = itemsSnap.docs.map((d) => d.ref);

  await db.runTransaction(async (tx) => {
    const itemSnaps = await Promise.all(itemRefs.map((r) => tx.get(r)));
    const validItems = itemSnaps
      .filter((s) => s.exists)
      .map((s) => ({ ref: s.ref, data: s.data() as FirestoreCartItemDoc }));

    const vRefs = validItems.map((i) => variantRef(i.data.variantId));
    const iRefs = validItems.map((i) => inventoryRef(i.data.variantId));
    const [variantSnaps, inventorySnaps] = await Promise.all([
      Promise.all(vRefs.map((r) => tx.get(r))),
      Promise.all(iRefs.map((r) => tx.get(r))),
    ]);

    const now = FieldValue.serverTimestamp();
    for (let i = 0; i < validItems.length; i++) {
      const inventorySnap = inventorySnaps[i];
      if (inventorySnap.exists) {
        const inventory = inventorySnap.data() as FirestoreInventoryDoc;
        const adjustment = applyReservationDelta(inventory, -validItems[i].data.quantity);
        tx.update(iRefs[i], { reserved: adjustment.newReserved, isLowStock: adjustment.newIsLowStock, updatedAt: now });
        if (variantSnaps[i].exists) {
          tx.update(vRefs[i], { availableStock: adjustment.newAvailableStock, updatedAt: now });
        }
      }
      tx.delete(validItems[i].ref);
    }
  });

  return fetchCart(uid);
}

export const getCart = onCall(async (request: CallableRequest) => {
  try {
    const caller = requireAuthenticatedCaller(request);
    return await fetchCart(caller.uid);
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

const addCartItemSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(MAX_QTY_PER_ITEM).nullish().transform((v) => v ?? 1),
});

export const addCartItem = onCall(async (request: CallableRequest) => {
  try {
    const caller = requireAuthenticatedCaller(request);
    const { variantId, quantity } = parseInput(addCartItemSchema, request.data);
    return await addCartItemTx(caller.uid, variantId, quantity);
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

const updateCartItemSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(0).max(MAX_QTY_PER_ITEM),
});

export const updateCartItemQuantity = onCall(async (request: CallableRequest) => {
  try {
    const caller = requireAuthenticatedCaller(request);
    const { variantId, quantity } = parseInput(updateCartItemSchema, request.data);
    return await updateCartItemQuantityTx(caller.uid, variantId, quantity);
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

const removeCartItemSchema = z.object({ variantId: z.string().min(1) });

export const removeCartItem = onCall(async (request: CallableRequest) => {
  try {
    const caller = requireAuthenticatedCaller(request);
    const { variantId } = parseInput(removeCartItemSchema, request.data);
    return await removeCartItemTx(caller.uid, variantId);
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

export const clearCart = onCall(async (request: CallableRequest) => {
  try {
    const caller = requireAuthenticatedCaller(request);
    return await clearCartTx(caller.uid);
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});
