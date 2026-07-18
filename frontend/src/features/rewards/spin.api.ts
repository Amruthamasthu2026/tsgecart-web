import { apiClient } from '../../lib/apiClient';

export interface WheelTier {
  id: string;
  cashbackAmount: number;
  minOrder: number;
}

export interface WheelState {
  tiers: WheelTier[];
  canSpin: boolean;
  isConfigured: boolean;
  activeProbabilityTotal: number;
  nextSpinAt: string | null;
}

export interface SpinReward {
  code: string;
  cashbackAmount: number;
  minOrder: number;
  expiresAt: string;
}

export interface RewardCoupon {
  id: string;
  code: string;
  cashbackAmount: number;
  minOrder: number;
  status: 'ACTIVE' | 'REDEEMED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
}

export const spinApi = {
  async wheel(): Promise<WheelState> {
    const { data } = await apiClient.get('/rewards-spin/wheel');
    return data.data;
  },
  async spin(): Promise<SpinReward> {
    const { data } = await apiClient.post('/rewards-spin/spin');
    return data.data;
  },
  async myRewards(): Promise<RewardCoupon[]> {
    const { data } = await apiClient.get('/rewards-spin/mine');
    return data.data.rewards;
  },
};
