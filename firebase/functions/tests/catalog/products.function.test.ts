import { describe, it, expect } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { getProducts, getFeaturedProducts, getTrendingProducts } from '../../src/catalog/products.function';

function fakeRequest(data: unknown): CallableRequest {
  return { data, auth: undefined } as unknown as CallableRequest;
}

/**
 * Regression coverage for a real bug found during Phase 3 manual browser
 * verification: the Firebase client SDK's callable wire protocol
 * serializes an omitted (`undefined`) field as JSON `null`, not as an
 * absent key. A plain `z.string().optional()` rejects `null`, so any
 * ordinary "don't filter by category" call from the frontend — which never
 * sends `categorySlug` at all — arrived here as `categorySlug: null` and
 * 400'd. These calls don't reach Firestore (this project has no emulator
 * running in the plain unit-test run), so they only exercise the request
 * validation layer, which is exactly what's being regression-tested.
 */
describe('getProducts — null vs. undefined optional fields (client wire-protocol quirk)', () => {
  it('does not throw invalid-argument when optional filters arrive as null', async () => {
    await expect(
      getProducts.run(
        fakeRequest({
          categorySlug: null,
          featured: null,
          bestSeller: null,
          search: null,
          sort: 'createdAt',
          order: 'desc',
          page: 1,
          limit: 24,
        }),
      ),
      // Firestore itself isn't running in this unit-test file, so the call
      // still fails — the assertion is on *how* it fails: it must not be
      // the validation error this test guards against.
    ).rejects.not.toMatchObject({ code: 'invalid-argument' });
  });

  it('accepts a genuinely empty request (no data at all)', async () => {
    await expect(getProducts.run(fakeRequest(undefined))).rejects.not.toMatchObject({
      code: 'invalid-argument',
    });
  });
});

describe('getFeaturedProducts / getTrendingProducts — no data at all', () => {
  it('getFeaturedProducts does not reject with invalid-argument when called with no args', async () => {
    await expect(getFeaturedProducts.run(fakeRequest(undefined))).rejects.not.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('getTrendingProducts does not reject with invalid-argument when called with no args', async () => {
    await expect(getTrendingProducts.run(fakeRequest(undefined))).rejects.not.toMatchObject({
      code: 'invalid-argument',
    });
  });
});
