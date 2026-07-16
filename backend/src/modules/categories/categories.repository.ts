import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

export const categoriesRepository = {
  list(where: Prisma.CategoryWhereInput) {
    return prisma.category.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
  },

  findBySlug(slug: string) {
    return prisma.category.findUnique({
      where: { slug },
      include: { children: { where: { isActive: true } } },
    });
  },

  findById(id: string) {
    return prisma.category.findUnique({ where: { id } });
  },

  findBySlugExact(slug: string) {
    return prisma.category.findUnique({ where: { slug } });
  },

  create(data: Prisma.CategoryUncheckedCreateInput) {
    return prisma.category.create({ data });
  },

  update(id: string, data: Prisma.CategoryUncheckedUpdateInput) {
    return prisma.category.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.category.delete({ where: { id } });
  },

  countProducts(categoryId: string) {
    return prisma.product.count({ where: { categoryId } });
  },
};
