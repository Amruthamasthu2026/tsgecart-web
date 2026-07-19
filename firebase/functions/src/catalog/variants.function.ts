import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import type { CollectionReference } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin';
import { parseInput } from '../shared/validation';
import { AppError } from '../shared/errors';
import type { FirestoreVariantDoc, VariantResponse } from './variants.types';

/**
 * Public, read-only Callable Function — every active variant of a given
 * product, ordered by price ascending (cheapest/default-ish first), for
 * the product-detail page's variant selector (migration Phase 4).
 * Requires the composite index `(productId, isActive)` — see
 * firebase/firestore.indexes.json.
 */

const variantsCollection = () =>
  db.collection('productVariants') as CollectionReference<FirestoreVariantDoc>;

function variantDocToResponse(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirestoreVariantDoc>,
): VariantResponse {
  const data = doc.data();
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt.toDate().toISOString(),
    updatedAt: data.updatedAt.toDate().toISOString(),
  };
}

const getProductVariantsSchema = z.object({ productId: z.string().min(1) });

export async function fetchProductVariants(productId: string): Promise<VariantResponse[]> {
  const snap = await variantsCollection()
    .where('productId', '==', productId)
    .where('isActive', '==', true)
    .orderBy('pricePaise', 'asc')
    .get();
  return snap.docs.map(variantDocToResponse);
}

export const getProductVariants = onCall(async (request: CallableRequest) => {
  try {
    const { productId } = parseInput(getProductVariantsSchema, request.data);
    return { variants: await fetchProductVariants(productId) };
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});
