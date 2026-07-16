import type { Prisma } from '@prisma/client';
import { productsRepository } from './products.repository.js';
import { slugify } from '../../shared/slug.js';
import { buildPaginationMeta } from '../../shared/apiResponse.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';
import { prisma } from '../../config/prisma.js';
import type {
  ProductListQuery,
  CreateProductInput,
  UpdateProductInput,
} from './products.validators.js';

async function generateUniqueSlug(name: string, ignoreId?: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await productsRepository.findBySlugExact(slug);
    if (!existing || existing.id === ignoreId) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

function ensureSingleDefault<T extends { isDefault: boolean }>(variants: T[]): T[] {
  const defaults = variants.filter((v) => v.isDefault);
  if (defaults.length === 0 && variants[0]) variants[0].isDefault = true;
  if (defaults.length > 1) {
    variants.forEach((v, i) => (v.isDefault = i === variants.findIndex((x) => x.isDefault)));
  }
  return variants;
}

export const productsService = {
  async list(query: ProductListQuery) {
    const where: Prisma.ProductWhereInput = { isActive: true };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { description: { contains: query.search } },
      ];
    }
    if (query.category) where.category = { slug: query.category };
    if (query.brand) where.brand = { slug: query.brand };
    if (query.featured !== undefined) where.isFeatured = query.featured;
    if (query.bestSeller !== undefined) where.isBestSeller = query.bestSeller;

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.variants = {
        some: {
          isActive: true,
          price: {
            ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
            ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
          },
        },
      };
    }
    if (query.inStock) {
      where.variants = {
        some: { isActive: true, inventory: { stock: { gt: 0 } } },
      };
    }

    // "price" sorts by the product's default/lowest variant — approximated via name fallback.
    const orderBy: Prisma.ProductOrderByWithRelationInput =
      query.sort === 'price'
        ? { createdAt: query.order } // price ordering handled client-side per variant
        : { [query.sort]: query.order };

    const skip = (query.page - 1) * query.limit;
    const { items, total } = await productsRepository.paginate(where, orderBy, skip, query.limit);
    const meta = buildPaginationMeta(query.page, query.limit, total);
    return { items, meta };
  },

  async getBySlug(slug: string) {
    const product = await productsRepository.findBySlug(slug);
    if (!product || !product.isActive) throw new NotFoundError('Product not found');
    return product;
  },

  async create(input: CreateProductInput) {
    const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) throw new BadRequestError('Category does not exist');
    if (input.brandId) {
      const brand = await prisma.brand.findUnique({ where: { id: input.brandId } });
      if (!brand) throw new BadRequestError('Brand does not exist');
    }

    const skus = input.variants.map((v) => v.sku);
    if (new Set(skus).size !== skus.length) {
      throw new BadRequestError('Variant SKUs must be unique');
    }
    const variants = ensureSingleDefault([...input.variants]);
    const slug = await generateUniqueSlug(input.name);

    return productsRepository.createWithVariants(
      {
        name: input.name,
        slug,
        description: input.description,
        categoryId: input.categoryId,
        brandId: input.brandId ?? null,
        images: input.images,
        gstRate: input.gstRate,
        hsnCode: input.hsnCode,
        isActive: input.isActive,
        isFeatured: input.isFeatured,
        isBestSeller: input.isBestSeller,
        metaTitle: input.metaTitle,
        metaDescription: input.metaDescription,
      },
      variants,
    );
  },

  async update(id: string, input: UpdateProductInput) {
    const existing = await productsRepository.findById(id);
    if (!existing) throw new NotFoundError('Product not found');

    const data: Prisma.ProductUncheckedUpdateInput = {
      name: input.name,
      description: input.description,
      categoryId: input.categoryId,
      brandId: input.brandId,
      images: input.images,
      gstRate: input.gstRate,
      hsnCode: input.hsnCode,
      isActive: input.isActive,
      isFeatured: input.isFeatured,
      isBestSeller: input.isBestSeller,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
    };
    if (input.name && input.name !== existing.name) {
      data.slug = await generateUniqueSlug(input.name, id);
    }

    // Replace variants wholesale when provided.
    if (input.variants) {
      const skus = input.variants.map((v) => v.sku);
      if (new Set(skus).size !== skus.length) {
        throw new BadRequestError('Variant SKUs must be unique');
      }
      const variants = ensureSingleDefault([...input.variants]);
      await prisma.$transaction(async (tx) => {
        await tx.product.update({ where: { id }, data });
        await tx.productVariant.deleteMany({ where: { productId: id } });
        for (const v of variants) {
          const variant = await tx.productVariant.create({
            data: {
              productId: id,
              sku: v.sku,
              unitLabel: v.unitLabel,
              mrp: v.mrp,
              price: v.price,
              weightGrams: v.weightGrams,
              isDefault: v.isDefault,
              isActive: v.isActive,
            },
          });
          await tx.inventory.create({
            data: { variantId: variant.id, stock: v.stock, lowStockThreshold: v.lowStockThreshold },
          });
        }
      });
      return productsRepository.findBySlug((await productsRepository.findById(id))!.slug);
    }

    return productsRepository.update(id, data);
  },

  async remove(id: string) {
    const existing = await productsRepository.findById(id);
    if (!existing) throw new NotFoundError('Product not found');
    await productsRepository.delete(id);
    return { deleted: true };
  },
};
