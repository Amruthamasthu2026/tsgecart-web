import type { Category, Prisma } from '@prisma/client';
import { categoriesRepository } from './categories.repository.js';
import { slugify } from '../../shared/slug.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors.js';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.validators.js';

type CategoryNode = Category & { children: CategoryNode[] };

function buildTree(categories: Category[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>();
  categories.forEach((c) => byId.set(c.id, { ...c, children: [] }));
  const roots: CategoryNode[] = [];
  byId.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

async function generateUniqueSlug(name: string, ignoreId?: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let n = 1;
  // Append -2, -3… on collision.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await categoriesRepository.findBySlugExact(slug);
    if (!existing || existing.id === ignoreId) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

export const categoriesService = {
  async list(options: { tree: boolean; includeInactive: boolean }) {
    const where: Prisma.CategoryWhereInput = options.includeInactive ? {} : { isActive: true };
    const categories = await categoriesRepository.list(where);
    if (options.tree) return buildTree(categories);
    return categories;
  },

  async getBySlug(slug: string) {
    const category = await categoriesRepository.findBySlug(slug);
    if (!category || !category.isActive) throw new NotFoundError('Category not found');
    return category;
  },

  async create(input: CreateCategoryInput) {
    if (input.parentId) {
      const parent = await categoriesRepository.findById(input.parentId);
      if (!parent) throw new BadRequestError('Parent category does not exist');
    }
    const slug = await generateUniqueSlug(input.name);
    return categoriesRepository.create({ ...input, slug });
  },

  async update(id: string, input: UpdateCategoryInput) {
    const existing = await categoriesRepository.findById(id);
    if (!existing) throw new NotFoundError('Category not found');
    if (input.parentId) {
      if (input.parentId === id) throw new BadRequestError('A category cannot be its own parent');
      const parent = await categoriesRepository.findById(input.parentId);
      if (!parent) throw new BadRequestError('Parent category does not exist');
    }
    const data: Prisma.CategoryUncheckedUpdateInput = { ...input };
    if (input.name && input.name !== existing.name) {
      data.slug = await generateUniqueSlug(input.name, id);
    }
    return categoriesRepository.update(id, data);
  },

  async remove(id: string) {
    const existing = await categoriesRepository.findById(id);
    if (!existing) throw new NotFoundError('Category not found');
    const productCount = await categoriesRepository.countProducts(id);
    if (productCount > 0) {
      throw new ConflictError('Cannot delete a category that still has products');
    }
    await categoriesRepository.delete(id);
    return { deleted: true };
  },
};
