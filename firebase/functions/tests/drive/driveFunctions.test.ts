import { describe, it, expect } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { adminUploadDriveImage, adminDeleteDriveImage, adminReplaceDriveImage } from '../../src/drive/drive.function';

function fakeRequest(auth: { uid: string; token: Record<string, unknown> } | undefined, data?: unknown): CallableRequest {
  return { data, auth } as unknown as CallableRequest;
}

const CUSTOMER = { uid: 'u1', token: { role: 'CUSTOMER' } };
const STAFF_NO_PERMS = { uid: 'staff-1', token: { role: 'STAFF', permissions: [] } };
const ADMIN = { uid: 'admin-1', token: { role: 'ADMIN' } };

const ONE_KB_BASE64 = Buffer.alloc(1024, 1).toString('base64');
const OVERSIZED_BASE64 = Buffer.alloc(6 * 1024 * 1024, 1).toString('base64');

/**
 * Same table-driven auth-guard shape as tests/admin/adminFunctions.test.ts
 * — these guards run BEFORE any Apps Script network call or Firestore
 * write, so they're safe as plain unit tests (no emulator/live Apps
 * Script needed). Validation-error cases are safe the same way: MIME/size
 * validation runs immediately after the permission check and throws
 * before `driveClient` is ever touched, so an authorized ADMIN caller
 * sending a deliberately-invalid payload never reaches the network.
 */
describe('Drive image Callables — permission guards', () => {
  const cases: Array<{ name: string; fn: { run: (r: CallableRequest) => Promise<unknown> }; data?: unknown }> = [
    { name: 'adminUploadDriveImage', fn: adminUploadDriveImage, data: { folder: 'products', fileName: 'a.jpg', mimeType: 'image/jpeg', base64Data: ONE_KB_BASE64 } },
    { name: 'adminDeleteDriveImage', fn: adminDeleteDriveImage, data: { fileId: 'some-file-id' } },
    {
      name: 'adminReplaceDriveImage',
      fn: adminReplaceDriveImage,
      data: { oldFileId: 'old-id', folder: 'products', fileName: 'a.jpg', mimeType: 'image/jpeg', base64Data: ONE_KB_BASE64 },
    },
  ];

  for (const { name, fn, data } of cases) {
    it(`${name} rejects an unauthenticated caller`, async () => {
      await expect(fn.run(fakeRequest(undefined, data))).rejects.toBeInstanceOf(HttpsError);
    });

    it(`${name} rejects a signed-in CUSTOMER (no permission)`, async () => {
      try {
        await fn.run(fakeRequest(CUSTOMER, data));
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpsError);
        expect((err as HttpsError).code).toBe('permission-denied');
      }
    });

    it(`${name} rejects a STAFF caller without products.manage`, async () => {
      try {
        await fn.run(fakeRequest(STAFF_NO_PERMS, data));
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpsError);
        expect((err as HttpsError).code).toBe('permission-denied');
      }
    });
  }
});

describe('adminUploadDriveImage — input validation (authorized caller, still rejected before any network call)', () => {
  it('rejects an unsupported MIME type with invalid-argument', async () => {
    try {
      await adminUploadDriveImage.run(fakeRequest(ADMIN, { folder: 'products', fileName: 'a.gif', mimeType: 'image/gif', base64Data: ONE_KB_BASE64 }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });

  it('rejects a payload over 5 MB with invalid-argument', async () => {
    try {
      await adminUploadDriveImage.run(fakeRequest(ADMIN, { folder: 'products', fileName: 'a.jpg', mimeType: 'image/jpeg', base64Data: OVERSIZED_BASE64 }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });

  it('rejects an unknown folder key with invalid-argument (zod enum)', async () => {
    try {
      await adminUploadDriveImage.run(fakeRequest(ADMIN, { folder: 'invoices', fileName: 'a.jpg', mimeType: 'image/jpeg', base64Data: ONE_KB_BASE64 }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });

  it('rejects a missing fileName with invalid-argument', async () => {
    try {
      await adminUploadDriveImage.run(fakeRequest(ADMIN, { folder: 'products', mimeType: 'image/jpeg', base64Data: ONE_KB_BASE64 }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });
});

describe('adminReplaceDriveImage — input validation', () => {
  it('rejects an unsupported MIME type with invalid-argument', async () => {
    try {
      await adminReplaceDriveImage.run(
        fakeRequest(ADMIN, { oldFileId: 'old-id', folder: 'banners', fileName: 'a.bmp', mimeType: 'image/bmp', base64Data: ONE_KB_BASE64 }),
      );
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });

  it('rejects a missing oldFileId with invalid-argument', async () => {
    try {
      await adminReplaceDriveImage.run(fakeRequest(ADMIN, { folder: 'banners', fileName: 'a.jpg', mimeType: 'image/jpeg', base64Data: ONE_KB_BASE64 }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });
});

describe('adminDeleteDriveImage — input validation', () => {
  it('rejects a missing fileId with invalid-argument', async () => {
    try {
      await adminDeleteDriveImage.run(fakeRequest(ADMIN, {}));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });
});
