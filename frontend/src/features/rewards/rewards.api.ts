import { apiClient } from '../../lib/apiClient';

export interface WalletTransaction {
  id: string;
  source: string;
  amount: string;
  balanceAfter: string;
  note: string | null;
  createdAt: string;
}

export interface ReferralSummary {
  referralCode: string | null;
  referrerReward: number;
  refereeReward: number;
  totalEarned: number;
  referrals: Array<{ name: string; status: string; rewardAmount: number; createdAt: string }>;
}

export interface SpinSegment {
  id: string;
  label: string;
  rewardAmount: number;
  color: string | null;
}

export interface SpinConfig {
  config: { id: string; name: string; cooldownHours: number; segments: SpinSegment[] } | null;
  canSpin: boolean;
  nextSpinAt: string | null;
}

export interface SpinResult {
  segmentId: string;
  label: string;
  rewardAmount: number;
  balance: number;
}

export const rewardsApi = {
  async wallet(): Promise<{ balance: number; transactions: WalletTransaction[] }> {
    const { data } = await apiClient.get('/rewards/wallet');
    return data.data;
  },
  async referral(): Promise<ReferralSummary> {
    const { data } = await apiClient.get('/rewards/referral');
    return data.data;
  },
  async spinConfig(): Promise<SpinConfig> {
    const { data } = await apiClient.get('/spin');
    return data.data;
  },
  async spin(): Promise<SpinResult> {
    const { data } = await apiClient.post('/spin/spin');
    return data.data;
  },
};
