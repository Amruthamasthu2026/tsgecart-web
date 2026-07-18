import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../config/firebaseAdmin';
import type { FirestoreCategoryDoc, CategoryResponse } from './catalog.types';
import { categoryDocToResponse } from './catalog.queries';

/**
 * Public, read-only Callable Function — returns every active category,
 * ordered exactly like the Express API's flat (non-tree) mode
 * (`sortOrder asc, name asc`). Requires the composite index
 * `(isActive, sortOrder, name)` — see firebase/firestore.indexes.json.
 */
export async function fetchCategories(): Promise<CategoryResponse[]> {
  const snap = await db
    .collection('categories')
    .where('isActive', '==', true)
    .orderBy('sortOrder', 'asc')
    .orderBy('name', 'asc')
    .get();
  return snap.docs.map((doc) =>
    categoryDocToResponse(doc as FirebaseFirestore.QueryDocumentSnapshot<FirestoreCategoryDoc>),
  );
}

export const getCategories = onCall(async (_request: CallableRequest) => {
  return { categories: await fetchCategories() };
});
