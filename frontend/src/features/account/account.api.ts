import { apiClient } from '../../lib/apiClient';

export interface Address {
  id: string;
  label: string | null;
  type: 'HOME' | 'WORK' | 'OTHER';
  contactName: string;
  contactPhone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  pincode: string;
  city: string;
  state: string;
  isDefault: boolean;
}

export interface AddressPayload {
  label?: string;
  type: 'HOME' | 'WORK' | 'OTHER';
  contactName: string;
  contactPhone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  pincode: string;
  city?: string;
  state?: string;
  isDefault?: boolean;
}

export const accountApi = {
  async updateProfile(payload: { name?: string; phone?: string }) {
    const { data } = await apiClient.patch('/users/me', payload);
    return data.data.user;
  },

  async changePassword(currentPassword: string, newPassword: string) {
    await apiClient.post('/users/me/change-password', { currentPassword, newPassword });
  },

  async listAddresses(): Promise<Address[]> {
    const { data } = await apiClient.get('/users/me/addresses');
    return data.data.addresses;
  },

  async createAddress(payload: AddressPayload): Promise<Address> {
    const { data } = await apiClient.post('/users/me/addresses', payload);
    return data.data.address;
  },

  async updateAddress(id: string, payload: AddressPayload): Promise<Address> {
    const { data } = await apiClient.put(`/users/me/addresses/${id}`, payload);
    return data.data.address;
  },

  async deleteAddress(id: string): Promise<void> {
    await apiClient.delete(`/users/me/addresses/${id}`);
  },
};
