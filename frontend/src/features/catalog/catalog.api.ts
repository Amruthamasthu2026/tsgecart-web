import { apiClient } from '../../lib/apiClient';
import type { Product, ProductDetail, Category, Pagination } from './catalog.types';

export interface ProductFilters {
  page?: number;
  limit?: number;
  sort?: 'createdAt' | 'price' | 'name' | 'ratingAvg';
  order?: 'asc' | 'desc';
  search?: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  featured?: boolean;
  bestSeller?: boolean;
  inStock?: boolean;
}

export const catalogApi = {
  async listProducts(
    filters: ProductFilters = {},
  ): Promise<{ products: Product[]; meta: Pagination }> {
    const { data } = await apiClient.get('/products', { params: filters });
    return { products: data.data.products, meta: data.meta };
  },

  async getProduct(slug: string): Promise<ProductDetail> {
    const { data } = await apiClient.get(`/products/${slug}`);
    return data.data.product;
  },

  async listCategories(tree = false): Promise<Category[]> {
    const { data } = await apiClient.get('/categories', { params: { tree } });
    return data.data.categories;
  },

  async getCategory(slug: string): Promise<Category> {
    const { data } = await apiClient.get(`/categories/${slug}`);
    return data.data.category;
  },
};
