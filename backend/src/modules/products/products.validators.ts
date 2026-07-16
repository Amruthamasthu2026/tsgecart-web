import { z } from 'zod';

export const productListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
  sort: z.enum(['createdAt', 'price', 'name', 'ratingAvg']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().optional(), // category slug
  brand: z.string().trim().optional(), // brand slug
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  featured: z.coerce.boolean().optional(),
  bestSeller: z.coerce.boolean().optional(),
  inStock: z.coerce.boolean().optional(),
});

const variantSchema = z.object({
  sku: z.string().trim().min(1).max(60),
  unitLabel: z.string().trim().min(1).max(40),
  mrp: z.number().positive(),
  price: z.number().positive(),
  weightGrams: z.number().int().positive().optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  stock: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(10),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(4000).optional(),
  categoryId: z.string().cuid(),
  brandId: z.string().cuid().optional().nullable(),
  images: z.array(z.string().url()).default([]),
  gstRate: z.number().min(0).max(28).default(0),
  hsnCode: z.string().trim().max(20).optional(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  isBestSeller: z.boolean().default(false),
  metaTitle: z.string().trim().max(160).optional(),
  metaDescription: z.string().trim().max(320).optional(),
  variants: z.array(variantSchema).min(1, 'At least one variant is required'),
});

export const updateProductSchema = createProductSchema
  .omit({ variants: true })
  .partial()
  .extend({ variants: z.array(variantSchema).optional() });

export const productIdParam = z.object({ id: z.string().cuid() });
export const productSlugParam = z.object({ slug: z.string().min(1) });

export type ProductListQuery = z.infer<typeof productListQuery>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type VariantInput = z.infer<typeof variantSchema>;
