import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin';
import { appsScriptUrlSecret, appsScriptSecretSecret } from '../config/environment';
import { requirePermission } from '../shared/auth';
import { parseInput } from '../shared/validation';
import { AppError, BadRequestError } from '../shared/errors';
import { validateImageUpload, safeFileName } from './drive.logic';
import { uploadImageViaAppsScript, deleteImageViaAppsScript, replaceImageViaAppsScript } from './driveClient';
import type { AllowedImageMimeType, DriveImageAsset } from './drive.types';

/**
 * Phase 1 of the Firestore → Google Drive → Google Apps Script bridge:
 * admin image upload/delete/replace. Not using Firebase Storage — Drive is
 * the file store, Apps Script is the only thing that ever talks to Drive,
 * and Firestore stays the source of truth for metadata.
 *
 * Business logic (MIME/size validation, safe-filename generation, which
 * folder a file belongs in, permission checks) lives entirely here, in
 * TypeScript, running on Cloud Functions — never in Apps Script, which only
 * ever receives an already-validated, already-named payload and performs
 * the Drive I/O (see google-apps-script/src/DriveService.gs). Apps Script
 * never sees payment data and is never involved in any transactional flow;
 * these three Callables are the ONLY code in this repository that calls
 * the Apps Script web app (`drive/driveClient.ts`) — React never does (no
 * Apps Script URL or secret ships to the client bundle).
 *
 * `driveImageAssets/{fileId}` is the canonical per-file metadata registry
 * (doc ID = the Drive file ID, matching the "deterministic doc ID" pattern
 * used everywhere else in this migration) — the record of "this file
 * exists in Drive, with these properties." Attaching an uploaded asset to
 * a specific product/category document is deliberately NOT done here —
 * that's admin-UI/product-management work for a later phase; this module
 * only owns the physical file and its standalone metadata record.
 */

const uploadFolderSchema = z.enum(['products', 'categories', 'banners']);

const uploadImageSchema = z.object({
  folder: uploadFolderSchema,
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(100),
  base64Data: z.string().min(1),
});

export type AdminUploadDriveImageInput = z.output<typeof uploadImageSchema>;

export async function adminUploadDriveImageImpl(input: AdminUploadDriveImageInput, uploadedBy: string): Promise<DriveImageAsset> {
  const validation = validateImageUpload({ mimeType: input.mimeType, base64Data: input.base64Data });
  if (!validation.valid) {
    throw new BadRequestError(validation.reason ?? 'Invalid image upload');
  }

  const fileName = safeFileName(input.fileName, input.mimeType as AllowedImageMimeType);
  const result = await uploadImageViaAppsScript({ folder: input.folder, fileName, mimeType: input.mimeType, base64Data: input.base64Data });

  const asset: DriveImageAsset = {
    fileId: result.fileId,
    imageUrl: result.imageUrl,
    fileName: result.fileName,
    mimeType: result.mimeType,
    size: result.size,
    uploadedAt: result.uploadedAt,
  };

  await db.collection('driveImageAssets').doc(asset.fileId).set({
    ...asset,
    folder: input.folder,
    uploadedBy,
    createdAt: FieldValue.serverTimestamp(),
  });

  return asset;
}

export const adminUploadDriveImage = onCall({ secrets: [appsScriptUrlSecret, appsScriptSecretSecret] }, async (request: CallableRequest) => {
  try {
    const caller = requirePermission(request, 'products.manage');
    const input = parseInput(uploadImageSchema, request.data);
    return await adminUploadDriveImageImpl(input, caller.uid);
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

const deleteImageSchema = z.object({ fileId: z.string().min(1) });

export async function adminDeleteDriveImageImpl(fileId: string): Promise<void> {
  await deleteImageViaAppsScript({ fileId });
  await db.collection('driveImageAssets').doc(fileId).delete();
}

export const adminDeleteDriveImage = onCall({ secrets: [appsScriptUrlSecret, appsScriptSecretSecret] }, async (request: CallableRequest) => {
  try {
    requirePermission(request, 'products.manage');
    const { fileId } = parseInput(deleteImageSchema, request.data);
    await adminDeleteDriveImageImpl(fileId);
    return { deleted: true };
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

const replaceImageSchema = z.object({
  oldFileId: z.string().min(1),
  folder: uploadFolderSchema,
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(100),
  base64Data: z.string().min(1),
});

export type AdminReplaceDriveImageInput = z.output<typeof replaceImageSchema>;

/**
 * Uploads the new file first, THEN deletes the old one — if the new upload
 * fails validation or the Apps Script call errors, the old file and its
 * registry entry are untouched, so a failed "replace" never leaves the
 * admin with no image at all.
 */
export async function adminReplaceDriveImageImpl(input: AdminReplaceDriveImageInput, uploadedBy: string): Promise<DriveImageAsset> {
  const validation = validateImageUpload({ mimeType: input.mimeType, base64Data: input.base64Data });
  if (!validation.valid) {
    throw new BadRequestError(validation.reason ?? 'Invalid image upload');
  }

  const fileName = safeFileName(input.fileName, input.mimeType as AllowedImageMimeType);
  const result = await replaceImageViaAppsScript({
    oldFileId: input.oldFileId,
    folder: input.folder,
    fileName,
    mimeType: input.mimeType,
    base64Data: input.base64Data,
  });

  const asset: DriveImageAsset = {
    fileId: result.fileId,
    imageUrl: result.imageUrl,
    fileName: result.fileName,
    mimeType: result.mimeType,
    size: result.size,
    uploadedAt: result.uploadedAt,
  };

  const batch = db.batch();
  batch.set(db.collection('driveImageAssets').doc(asset.fileId), {
    ...asset,
    folder: input.folder,
    uploadedBy,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.delete(db.collection('driveImageAssets').doc(input.oldFileId));
  await batch.commit();

  return asset;
}

export const adminReplaceDriveImage = onCall({ secrets: [appsScriptUrlSecret, appsScriptSecretSecret] }, async (request: CallableRequest) => {
  try {
    const caller = requirePermission(request, 'products.manage');
    const input = parseInput(replaceImageSchema, request.data);
    return await adminReplaceDriveImageImpl(input, caller.uid);
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});
