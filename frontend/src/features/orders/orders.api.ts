import { apiClient } from '../../lib/apiClient';

export type OrderStatus =
  | 'CONFIRMED'
  | 'PREPARING'
  | 'PACKED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export interface OrderItem {
  id: string;
  productName: string;
  variantLabel: string;
  sku: string;
  imageUrl: string | null;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface OrderStatusHistory {
  id: string;
  status: OrderStatus;
  note: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: string;
  subtotal: string;
  discount: string;
  taxTotal: string;
  deliveryCharge: string;
  total: string;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
  placedAt: string;
  shipContactName: string;
  shipContactPhone: string;
  shipLine1: string;
  shipLine2: string | null;
  shipPincode: string;
  shipCity: string;
  items: OrderItem[];
  statusHistory?: OrderStatusHistory[];
  payment?: { method: string; status: string };
}

export interface CreateOrderResult {
  order: Order;
  razorpay: {
    orderId: string;
    amount: number;
    currency: string;
    keyId: string;
  } | null;
}

export const ordersApi = {
  async create(payload: {
    addressId: string;
    paymentMethod: 'COD' | 'RAZORPAY';
    couponCode?: string;
  }): Promise<CreateOrderResult> {
    const { data } = await apiClient.post('/orders', payload);
    return data.data;
  },
  async list(page = 1): Promise<{ orders: Order[]; meta: { totalPages: number; page: number } }> {
    const { data } = await apiClient.get('/orders', { params: { page } });
    return { orders: data.data.orders, meta: data.meta };
  },
  async get(id: string): Promise<Order> {
    const { data } = await apiClient.get(`/orders/${id}`);
    return data.data.order;
  },
  async cancel(id: string): Promise<Order> {
    const { data } = await apiClient.post(`/orders/${id}/cancel`);
    return data.data.order;
  },
  async invoice(id: string) {
    const { data } = await apiClient.get(`/orders/${id}/invoice`);
    return data.data.invoice;
  },
  async verifyPayment(payload: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): Promise<{ verified: boolean; orderId: string }> {
    const { data } = await apiClient.post('/payments/razorpay/verify', payload);
    return data.data;
  },
};
