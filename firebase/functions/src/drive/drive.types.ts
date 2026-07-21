/**
 * Firestore/Function types for the Google Drive image bridge
 * (Firestore → Google Drive → Google Apps Script), Phase 1 of the
 * Drive/Sheets/Apps-Script architecture. Firestore stays the source of
 * truth: this is a metadata *record* of a file that physically lives in
 * Drive, never a re-implementation of Storage, and never business logic —
 * Apps Script only ever performs the Drive I/O described here; every
 * validation/naming decision is made in `drive.logic.ts`/`drive.function.ts`
 * before Apps Script is ever called.
 *
 * Phase 1 scope only: upload/delete/replace a single image file. No
 * product/category document is touched by anything in this module — image
 * metadata is recorded standalone in `driveImageAssets/{fileId}`
 * (drive.function.ts). Attaching an uploaded asset to a specific
 * product/category is admin-UI work for a later phase.
 */

/** The three image folders Phase 1 uploads into. `invoices`/`exports` (Phase 3 of the wider architecture) are not wired yet — add them here when that work starts. */
export type DriveFolderKey = 'products' | 'categories' | 'banners';

export const DRIVE_IMAGE_FOLDERS: readonly DriveFolderKey[] = ['products', 'categories', 'banners'];

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

/** Persisted in Firestore at `driveImageAssets/{fileId}`. */
export interface DriveImageAsset {
  fileId: string;
  imageUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  /** ISO 8601 — a plain data field synced from Apps Script's response, not a Firestore Timestamp. */
  uploadedAt: string;
}

/** What `adminUploadDriveImage` sends to the Apps Script web app. */
export interface AppsScriptUploadRequest {
  action: 'uploadImage';
  folder: DriveFolderKey;
  fileName: string;
  mimeType: string;
  /** Base64-encoded file bytes (no data-URL prefix). */
  base64Data: string;
}

export interface AppsScriptUploadResponse {
  ok: true;
  fileId: string;
  imageUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface AppsScriptDeleteRequest {
  action: 'deleteImage';
  fileId: string;
}

export interface AppsScriptDeleteResponse {
  ok: true;
  fileId: string;
  deleted: boolean;
}

/** Uploads the new file, then deletes `oldFileId` — same folder/validation rules as a plain upload. */
export interface AppsScriptReplaceRequest {
  action: 'replaceImage';
  oldFileId: string;
  folder: DriveFolderKey;
  fileName: string;
  mimeType: string;
  base64Data: string;
}

export interface AppsScriptReplaceResponse {
  ok: true;
  fileId: string;
  imageUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  oldFileId: string;
  oldFileDeleted: boolean;
}

export interface AppsScriptErrorResponse {
  ok: false;
  error: string;
}

export type AppsScriptResponse = AppsScriptUploadResponse | AppsScriptDeleteResponse | AppsScriptReplaceResponse | AppsScriptErrorResponse;
