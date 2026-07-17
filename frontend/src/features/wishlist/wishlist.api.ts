import { apiClient } from '../../lib/apiClient';
import type { Product } from '../catalog/catalog.types';

export const wishlistApi = {
  async list(): Promise<Product[]> {
    const { data } = await apiClient.get('/wishlist');
    return data.data.products;
  },
  async add(productId: string): Promise<void> {
    await apiClient.post('/wishlist/items', { productId });
  },
  async remove(productId: string): Promise<void> {
    await apiClient.delete(`/wishlist/items/${productId}`);
  },
};
