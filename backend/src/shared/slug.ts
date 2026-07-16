import { customAlphabet } from 'nanoid';

const suffix = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 6);

/** Converts arbitrary text to a URL-safe slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Slug with a short random suffix to guarantee uniqueness. */
export function slugifyUnique(input: string): string {
  const base = slugify(input) || 'item';
  return `${base}-${suffix()}`;
}
