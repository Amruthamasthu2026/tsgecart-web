import { apiClient } from '../../lib/apiClient';

export interface CartLine {
  itemId: string;
  variantId: string;
  productId: string;
  name: string;
  slug: string;
  image: string | null;
  unitLabel: string;
  sku: string;
  price: number;
  mrp: number;
  gstRate: number;
  quantity: number;
  lineTotal: number;
  inStock: boolean;
  availableStock: number;
}

export interface CartSummary {
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  taxTotal: number;
}

export interface CheckoutSummary {
  summary: CartSummary;
  serviceable: boolean;
  message: string;
  deliveryCharge: number;
  discount: number;
  couponCode?: string;
  eta?: { min: number; max: number };
  total: number;
  zoneId?: string;
}

export const cartApi = {
  async get(): Promise<CartSummary> {
    const { data } = await apiClient.get('/cart');
    return data.data;
  },
  async addItem(variantId: string, quantity = 1): Promise<CartSummary> {
    const { data } = await apiClient.post('/cart/items', { variantId, quantity });
    return data.data;
  },
  async updateItem(itemId: string, quantity: number): Promise<CartSummary> {
    const { data } = await apiClient.patch(`/cart/items/${itemId}`, { quantity });
    return data.data;
  },
  async removeItem(itemId: string): Promise<CartSummary> {
    const { data } = await apiClient.delete(`/cart/items/${itemId}`);
    return data.data;
  },
  async clear(): Promise<CartSummary> {
    const { data } = await apiClient.delete('/cart');
    return data.data;
  },
  async checkoutSummary(pincode: string, couponCode?: string): Promise<CheckoutSummary> {
    const { data } = await apiClient.post('/cart/checkout-summary', { pincode, couponCode });
    return data.data;
  },
};
