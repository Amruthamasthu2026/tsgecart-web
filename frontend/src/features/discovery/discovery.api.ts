import { apiClient } from '../../lib/apiClient';
import type { Product } from '../catalog/catalog.types';

export const discoveryApi = {
  async trackView(productId: string): Promise<void> {
    await apiClient.post('/discovery/recently-viewed', { productId });
  },
  async recentlyViewed(): Promise<Product[]> {
    const { data } = await apiClient.get('/discovery/recently-viewed');
    return data.data.products;
  },
  async recommendations(): Promise<Product[]> {
    const { data } = await apiClient.get('/discovery/recommendations');
    return data.data.products;
  },
  async related(slug: string): Promise<Product[]> {
    const { data } = await apiClient.get(`/discovery/related/${slug}`);
    return data.data.products;
  },
};

export const reviewsApi = {
  async create(payload: { productId: string; rating: number; title?: string; comment?: string }) {
    const { data } = await apiClient.post('/reviews', payload);
    return data.data.review;
  },
};

export interface Banner {
  id: string;
  title: string | null;
  imageUrl: string;
  linkUrl: string | null;
  position: string;
}

export const bannersApi = {
  async list(position?: string): Promise<Banner[]> {
    const { data } = await apiClient.get('/banners', { params: position ? { position } : {} });
    return data.data.banners;
  },
};
