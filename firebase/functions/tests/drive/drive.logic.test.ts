import { describe, it, expect } from 'vitest';
import { isAllowedImageMimeType, base64ByteLength, validateImageUpload, safeFileName } from '../../src/drive/drive.logic';
import { MAX_IMAGE_UPLOAD_BYTES } from '../../src/drive/drive.types';

describe('isAllowedImageMimeType', () => {
  it('accepts JPEG, PNG, and WEBP', () => {
    expect(isAllowedImageMimeType('image/jpeg')).toBe(true);
    expect(isAllowedImageMimeType('image/png')).toBe(true);
    expect(isAllowedImageMimeType('image/webp')).toBe(true);
  });

  it('rejects everything else, including near-miss and dangerous types', () => {
    expect(isAllowedImageMimeType('image/gif')).toBe(false);
    expect(isAllowedImageMimeType('image/svg+xml')).toBe(false);
    expect(isAllowedImageMimeType('application/pdf')).toBe(false);
    expect(isAllowedImageMimeType('text/html')).toBe(false);
    expect(isAllowedImageMimeType('')).toBe(false);
  });
});

describe('base64ByteLength', () => {
  it('computes the exact decoded byte length for unpadded base64', () => {
    // "hello" -> "aGVsbG8=" (5 bytes, one '=' padding char)
    expect(base64ByteLength('aGVsbG8=')).toBe(5);
  });

  it('computes the exact decoded byte length with no padding', () => {
    // "foob" -> "Zm9vYg==" is actually 4 bytes w/ 2 padding chars; use a
    // 6-byte example with zero padding: "foobar" -> "Zm9vYmFy"
    expect(base64ByteLength('Zm9vYmFy')).toBe(6);
  });

  it('returns 0 for an empty string', () => {
    expect(base64ByteLength('')).toBe(0);
  });
});

const ONE_KB_JPEG_BASE64 = Buffer.alloc(1024, 1).toString('base64');

describe('validateImageUpload', () => {
  it('accepts a well-formed small JPEG payload', () => {
    const result = validateImageUpload({ mimeType: 'image/jpeg', base64Data: ONE_KB_JPEG_BASE64 });
    expect(result.valid).toBe(true);
    expect(result.sizeBytes).toBe(1024);
  });

  it('accepts PNG and WEBP the same way', () => {
    expect(validateImageUpload({ mimeType: 'image/png', base64Data: ONE_KB_JPEG_BASE64 }).valid).toBe(true);
    expect(validateImageUpload({ mimeType: 'image/webp', base64Data: ONE_KB_JPEG_BASE64 }).valid).toBe(true);
  });

  it('rejects an unsupported MIME type with a clear reason', () => {
    const result = validateImageUpload({ mimeType: 'image/gif', base64Data: ONE_KB_JPEG_BASE64 });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Unsupported image type/);
  });

  it('rejects an empty payload', () => {
    const result = validateImageUpload({ mimeType: 'image/jpeg', base64Data: '' });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Empty file');
  });

  it('rejects a payload over the 5 MB limit', () => {
    const oversized = Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES + 1024, 1).toString('base64');
    const result = validateImageUpload({ mimeType: 'image/jpeg', base64Data: oversized });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/exceeds the 5 MB limit/);
  });

  it('accepts a payload exactly at the 5 MB limit', () => {
    const exact = Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES, 1).toString('base64');
    const result = validateImageUpload({ mimeType: 'image/png', base64Data: exact });
    expect(result.valid).toBe(true);
  });
});

describe('safeFileName', () => {
  const now = new Date('2026-07-21T10:30:00.000Z');

  it('slugifies the original name and forces the extension to match the validated MIME type', () => {
    const name = safeFileName('My Product Photo!.png', 'image/jpeg', now);
    expect(name).toMatch(/^my-product-photo-\d{14}-[a-z0-9]{6}\.jpg$/);
  });

  it('ignores whatever extension the client sent — only the validated MIME type decides it', () => {
    const name = safeFileName('sneaky.exe.jpg', 'image/webp', now);
    expect(name.endsWith('.webp')).toBe(true);
  });

  it('falls back to "image" when the name has no usable characters', () => {
    const name = safeFileName('!!!.png', 'image/png', now);
    expect(name).toMatch(/^image-\d{14}-[a-z0-9]{6}\.png$/);
  });

  it('produces different names for two uploads of the same original filename (collision-safe)', () => {
    const a = safeFileName('banner.jpg', 'image/jpeg', now);
    const b = safeFileName('banner.jpg', 'image/jpeg', now);
    expect(a).not.toBe(b);
  });

  it('truncates a very long original name', () => {
    const name = safeFileName('a'.repeat(500), 'image/png', now);
    expect(name.length).toBeLessThan(120);
  });
});
