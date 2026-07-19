import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { firebaseFirestore } from '../lib/firebase';
import { firebaseProductsApi, toLegacyProduct } from './firebaseProducts';
import type { Product } from '../features/catalog/catalog.types';

/**
 * Firestore-backed wishlist service — added ALONGSIDE
 * `features/wishlist/wishlist.api.ts` (untouched). Unlike cart, this talks
 * to Firestore DIRECTLY from the client (no Callable Function) — there is
 * no authoritative computation involved, just a list of product
 * references, and duplicate-prevention comes for free from using the
 * product's own doc ID (its slug) as the wishlist item's doc ID (see
 * firestore.rules: `wishlists/{uid}/items/{productId}`, owner-only
 * read/write).
 *
 * See `VITE_USE_FIRESTORE_WISHLIST` (frontend/.env.example).
 */

function itemsCollection(uid: string) {
  return collection(firebaseFirestore, 'wishlists', uid, 'items');
}

export const firebaseWishlistApi = {
  /** Returns full `Product` records (legacy shape) for every wishlisted item, joining to the catalog. */
  async list(uid: string): Promise<Product[]> {
    const snap = await getDocs(itemsCollection(uid));
    const slugs = snap.docs.map((d) => d.id);
    const products = await Promise.all(
      slugs.map((slug) => firebaseProductsApi.getProduct(slug).catch(() => null)),
    );
    return products.filter((p): p is NonNullable<typeof p> => p !== null).map(toLegacyProduct);
  },

  async add(uid: string, productSlug: string): Promise<void> {
    await setDoc(doc(firebaseFirestore, 'wishlists', uid, 'items', productSlug), {
      addedAt: serverTimestamp(),
    });
  },

  async remove(uid: string, productSlug: string): Promise<void> {
    await deleteDoc(doc(firebaseFirestore, 'wishlists', uid, 'items', productSlug));
  },
};

/** True when the wishlist page should read/write Firestore instead of the Express API. */
export const useFirestoreWishlist = import.meta.env.VITE_USE_FIRESTORE_WISHLIST === 'true';
