import { ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGE_UPLOAD_BYTES, type AllowedImageMimeType } from './drive.types';

/**
 * Pure validation/formatting helpers for the Drive image upload path — no
 * Admin SDK, no network call, unit-testable on their own (same pattern as
 * catalog/adminProducts.logic.ts, delivery/pincodeImport.logic.ts).
 */

const EXTENSION_BY_MIME: Record<AllowedImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function isAllowedImageMimeType(mimeType: string): mimeType is AllowedImageMimeType {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

/** Decodes a base64 payload's byte length without materializing the buffer twice. */
export function base64ByteLength(base64Data: string): number {
  const cleaned = base64Data.replace(/[^A-Za-z0-9+/=]/g, '');
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  return Math.floor((cleaned.length * 3) / 4) - padding;
}

export interface ImageUploadValidationInput {
  mimeType: string;
  base64Data: string;
}

export interface ImageUploadValidationResult {
  valid: boolean;
  reason?: string;
  sizeBytes: number;
}

/** Authoritative validation — the ONLY place that decides an upload is acceptable (Apps Script re-checks defensively, but never decides). */
export function validateImageUpload(input: ImageUploadValidationInput): ImageUploadValidationResult {
  if (!isAllowedImageMimeType(input.mimeType)) {
    return { valid: false, reason: `Unsupported image type "${input.mimeType}" — only JPEG, PNG, and WEBP are allowed`, sizeBytes: 0 };
  }
  const sizeBytes = base64ByteLength(input.base64Data);
  if (sizeBytes <= 0) {
    return { valid: false, reason: 'Empty file', sizeBytes };
  }
  if (sizeBytes > MAX_IMAGE_UPLOAD_BYTES) {
    return { valid: false, reason: `Image exceeds the 5 MB limit (${(sizeBytes / (1024 * 1024)).toFixed(2)} MB)`, sizeBytes };
  }
  return { valid: true, sizeBytes };
}

/**
 * Generates a collision-safe, filesystem/URL-safe filename: strips the
 * original name down to a slug, appends a timestamp + short random suffix
 * (so two admins uploading "photo.jpg" at the same moment never collide),
 * and forces the extension to match the validated MIME type (never trusts
 * the client-supplied extension).
 */
export function safeFileName(originalName: string, mimeType: AllowedImageMimeType, now: Date = new Date()): string {
  const base =
    originalName
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'image';
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `${base}-${timestamp}-${random}.${EXTENSION_BY_MIME[mimeType]}`;
}
