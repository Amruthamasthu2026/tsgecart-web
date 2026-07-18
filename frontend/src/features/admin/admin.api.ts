import { apiClient } from '../../lib/apiClient';

export interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  activeProducts: number;
  pendingOrders: number;
  lowStockItems: number;
  ordersByStatus: Array<{ status: string; count: number }>;
}

export interface SalesPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface BulkImportResult {
  toCreate: Array<{ code: string; zoneId: string }>;
  toUpdate: Array<{ code: string; zoneId: string }>;
  invalid: Array<{ code: string; reason: string }>;
  failed: Array<{ code: string; reason: string }>;
  duplicates: string[];
  skipped: string[];
  warnings: Array<{ code: string; message: string }>;
  stats: {
    total: number;
    added: number;
    updated: number;
    skipped: number;
    invalid: number;
    failed: number;
    duplicates: number;
  };
}

export const adminApi = {
  // Analytics
  async dashboard(): Promise<DashboardStats> {
    const { data } = await apiClient.get('/admin/analytics/dashboard');
    return data.data;
  },
  async salesTrend(days = 14): Promise<SalesPoint[]> {
    const { data } = await apiClient.get('/admin/analytics/sales', { params: { days } });
    return data.data.trend;
  },
  async topProducts(): Promise<Array<{ productName: string; unitsSold: number; revenue: number }>> {
    const { data } = await apiClient.get('/admin/analytics/top-products');
    return data.data.products;
  },
  async lowStock() {
    const { data } = await apiClient.get('/admin/analytics/low-stock');
    return data.data.items as Array<{
      sku: string;
      productName: string;
      unitLabel: string;
      stock: number;
      threshold: number;
    }>;
  },

  // Products
  async listProducts(params: Record<string, unknown> = {}) {
    const { data } = await apiClient.get('/products', { params: { ...params, limit: 50 } });
    return { products: data.data.products, meta: data.meta };
  },
  async createProduct(payload: unknown) {
    const { data } = await apiClient.post('/products', payload);
    return data.data.product;
  },
  async updateProduct(id: string, payload: unknown) {
    const { data } = await apiClient.put(`/products/${id}`, payload);
    return data.data.product;
  },
  async deleteProduct(id: string) {
    await apiClient.delete(`/products/${id}`);
  },

  // Categories / brands
  async createCategory(payload: unknown) {
    const { data } = await apiClient.post('/categories', payload);
    return data.data.category;
  },
  async updateCategory(id: string, payload: unknown) {
    const { data } = await apiClient.put(`/categories/${id}`, payload);
    return data.data.category;
  },
  async deleteCategory(id: string) {
    await apiClient.delete(`/categories/${id}`);
  },

  // Orders
  async listOrders(params: Record<string, unknown> = {}) {
    const { data } = await apiClient.get('/admin/orders', { params });
    return { orders: data.data.orders, meta: data.meta };
  },
  async updateOrderStatus(id: string, status: string, note?: string) {
    const { data } = await apiClient.patch(`/admin/orders/${id}/status`, { status, note });
    return data.data.order;
  },
  async refundOrder(id: string, amount?: number) {
    const { data } = await apiClient.post(`/admin/orders/${id}/refund`, { amount });
    return data.data;
  },

  // Coupons
  async listCoupons() {
    const { data } = await apiClient.get('/coupons');
    return data.data.coupons;
  },
  async createCoupon(payload: unknown) {
    const { data } = await apiClient.post('/coupons', payload);
    return data.data.coupon;
  },
  async deleteCoupon(id: string) {
    await apiClient.delete(`/coupons/${id}`);
  },

  // Customers
  async listCustomers(params: Record<string, unknown> = {}) {
    const { data } = await apiClient.get('/admin/customers', { params });
    return { customers: data.data.customers, meta: data.meta };
  },
  async setCustomerActive(id: string, isActive: boolean) {
    await apiClient.patch(`/admin/customers/${id}`, { isActive });
  },

  // Delivery
  async listZones() {
    const { data } = await apiClient.get('/delivery/zones');
    return data.data.zones;
  },
  async createZone(payload: unknown) {
    const { data } = await apiClient.post('/delivery/zones', payload);
    return data.data.zone;
  },
  async listPincodes() {
    const { data } = await apiClient.get('/delivery/pincodes');
    return data.data.pincodes;
  },
  async createPincode(payload: unknown) {
    const { data } = await apiClient.post('/delivery/pincodes', payload);
    return data.data.pincode;
  },
  async deletePincode(id: string) {
    await apiClient.delete(`/delivery/pincodes/${id}`);
  },
  async bulkImportPincodes(
    items: Array<{ code: string; zoneName?: string }>,
    zoneId?: string,
    mode: 'skip' | 'upsert' = 'skip',
  ): Promise<BulkImportResult> {
    const { data } = await apiClient.post('/delivery/pincodes/bulk', { items, zoneId, mode });
    return data.data;
  },
  async importHyderabad(zoneId?: string): Promise<BulkImportResult> {
    const { data } = await apiClient.post('/delivery/pincodes/import-hyderabad', { zoneId });
    return data.data;
  },
  async bulkActionPincodes(
    ids: string[],
    action: 'activate' | 'deactivate' | 'move' | 'delete',
    zoneId?: string,
  ): Promise<{ affected: number }> {
    const { data } = await apiClient.post('/delivery/pincodes/bulk-action', { ids, action, zoneId });
    return data.data;
  },

  // Reviews
  async listReviews(approved?: boolean) {
    const { data } = await apiClient.get('/reviews/admin', {
      params: approved === undefined ? {} : { approved },
    });
    return data.data.reviews;
  },
  async setReviewApproval(id: string, isApproved: boolean) {
    await apiClient.patch(`/reviews/admin/${id}`, { isApproved });
  },
  async deleteReview(id: string) {
    await apiClient.delete(`/reviews/admin/${id}`);
  },

  // Banners
  async listBanners() {
    const { data } = await apiClient.get('/banners/admin');
    return data.data.banners;
  },
  async createBanner(payload: unknown) {
    const { data } = await apiClient.post('/banners', payload);
    return data.data.banner;
  },
  async deleteBanner(id: string) {
    await apiClient.delete(`/banners/${id}`);
  },

  // Rewards / spin-wheel configuration
  async listRewardConfigs() {
    const { data } = await apiClient.get('/rewards-spin/admin/configs');
    return data.data as {
      configs: Array<{
        id: string;
        cashbackAmount: string;
        probability: number;
        minOrder: string;
        expiryDays: number;
        isActive: boolean;
        sortOrder: number;
      }>;
      activeProbabilityTotal: number;
      isSpinnable: boolean;
    };
  },
  async createRewardConfig(payload: unknown) {
    const { data } = await apiClient.post('/rewards-spin/admin/configs', payload);
    return data.data.config;
  },
  async updateRewardConfig(id: string, payload: unknown) {
    const { data } = await apiClient.put(`/rewards-spin/admin/configs/${id}`, payload);
    return data.data.config;
  },
  async deleteRewardConfig(id: string) {
    await apiClient.delete(`/rewards-spin/admin/configs/${id}`);
  },
  async seedRewardDefaults() {
    const { data } = await apiClient.post('/rewards-spin/admin/seed-defaults');
    return data.data;
  },
  async rewardAnalytics() {
    const { data } = await apiClient.get('/rewards-spin/admin/analytics');
    return data.data as {
      totalSpins: number;
      todaySpins: number;
      couponsGenerated: number;
      couponsRedeemed: number;
      totalCashbackIssued: number;
      mostWonReward: number | null;
    };
  },

  // Image upload
  async uploadImage(file: File, folder = 'products'): Promise<string> {
    const form = new FormData();
    form.append('image', file);
    const { data } = await apiClient.post('/uploads', form, {
      params: { folder },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data.url;
  },
};
