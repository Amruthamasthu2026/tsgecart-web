import { apiClient } from '../../lib/apiClient';

export interface ServiceabilityResult {
  serviceable: boolean;
  pincode: string;
  message: string;
  zone?: {
    id: string;
    name: string;
    deliveryCharge: number;
    freeDeliveryLimit: number;
    minEtaMinutes: number;
    maxEtaMinutes: number;
  };
}

export const deliveryApi = {
  async check(pincode: string): Promise<ServiceabilityResult> {
    const { data } = await apiClient.get(`/delivery/check/${pincode}`);
    return data.data;
  },
};
