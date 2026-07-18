import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';
import {
  validateProbabilities,
  pickWeightedTier,
  generateRewardCode,
  DEFAULT_REWARD_TIERS,
  type RewardTier,
} from './rewardSpin.logic.js';

const SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toTier(c: {
  id: string;
  cashbackAmount: Prisma.Decimal;
  probability: number;
  minOrder: Prisma.Decimal;
  expiryDays: number;
  isActive: boolean;
}): RewardTier {
  return {
    id: c.id,
    cashbackAmount: Number(c.cashbackAmount),
    probability: c.probability,
    minOrder: Number(c.minOrder),
    expiryDays: c.expiryDays,
    isActive: c.isActive,
  };
}

export const rewardSpinService = {
  // ── Admin config ───────────────────────────────────────────
  async listConfigs() {
    const configs = await prisma.rewardConfig.findMany({ orderBy: { sortOrder: 'asc' } });
    const tiers = configs.map(toTier);
    const { ok, total } = validateProbabilities(tiers);
    return { configs, activeProbabilityTotal: total, isSpinnable: ok };
  },

  createConfig(data: {
    cashbackAmount: number;
    probability: number;
    minOrder: number;
    expiryDays: number;
    isActive: boolean;
    sortOrder?: number;
  }) {
    return prisma.rewardConfig.create({ data });
  },

  async updateConfig(id: string, data: Prisma.RewardConfigUpdateInput) {
    const existing = await prisma.rewardConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Reward tier not found');
    return prisma.rewardConfig.update({ where: { id }, data });
  },

  async deleteConfig(id: string) {
    await prisma.rewardConfig.delete({ where: { id } });
    return { deleted: true };
  },

  /** Inserts the six default tiers, but only when none exist yet (idempotent). */
  async seedDefaults() {
    const count = await prisma.rewardConfig.count();
    if (count > 0) return { created: 0, message: 'Reward tiers already exist' };
    await prisma.rewardConfig.createMany({ data: DEFAULT_REWARD_TIERS });
    return { created: DEFAULT_REWARD_TIERS.length, message: 'Default reward tiers created' };
  },

  // ── Customer wheel ─────────────────────────────────────────
  async nextSpinAt(userId: string): Promise<Date | null> {
    const last = await prisma.rewardCoupon.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!last) return null;
    const next = new Date(last.createdAt.getTime() + SPIN_COOLDOWN_MS);
    return next > new Date() ? next : null;
  },

  async getWheel(userId: string) {
    const configs = await prisma.rewardConfig.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const tiers = configs.map(toTier);
    const { ok, total } = validateProbabilities(tiers);
    const nextSpinAt = await this.nextSpinAt(userId);
    return {
      tiers: tiers.map((t) => ({ id: t.id, cashbackAmount: t.cashbackAmount, minOrder: t.minOrder })),
      canSpin: ok && !nextSpinAt,
      isConfigured: ok,
      activeProbabilityTotal: total,
      nextSpinAt,
    };
  },

  async spin(userId: string) {
    const blockedUntil = await this.nextSpinAt(userId);
    if (blockedUntil) {
      throw new BadRequestError(`You can spin again after ${blockedUntil.toLocaleString('en-IN')}`);
    }

    const configs = await prisma.rewardConfig.findMany({ where: { isActive: true } });
    const tiers = configs.map(toTier);
    const { ok } = validateProbabilities(tiers);
    if (!ok) throw new BadRequestError('The spin wheel is not available right now');

    const tier = pickWeightedTier(tiers);
    if (!tier) throw new BadRequestError('The spin wheel is not available right now');

    // Generate a guaranteed-unique code (retry on the rare collision).
    let code = generateRewardCode();
    for (let i = 0; i < 5; i += 1) {
      const clash = await prisma.rewardCoupon.findUnique({ where: { code } });
      if (!clash) break;
      code = generateRewardCode();
    }

    const expiresAt = new Date(Date.now() + tier.expiryDays * MS_PER_DAY);
    const coupon = await prisma.rewardCoupon.create({
      data: {
        code,
        userId,
        cashbackAmount: tier.cashbackAmount,
        minOrder: tier.minOrder,
        expiresAt,
        status: 'ACTIVE',
      },
    });

    return {
      code: coupon.code,
      cashbackAmount: Number(coupon.cashbackAmount),
      minOrder: Number(coupon.minOrder),
      expiresAt: coupon.expiresAt,
    };
  },

  async listMyRewards(userId: string) {
    // Lazily expire past-due active coupons so statuses are accurate on read.
    await prisma.rewardCoupon.updateMany({
      where: { userId, status: 'ACTIVE', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
    const coupons = await prisma.rewardCoupon.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return coupons.map((c) => ({
      id: c.id,
      code: c.code,
      cashbackAmount: Number(c.cashbackAmount),
      minOrder: Number(c.minOrder),
      status: c.status,
      expiresAt: c.expiresAt,
      createdAt: c.createdAt,
    }));
  },

  // ── Checkout integration helpers ───────────────────────────
  /** Finds a reward coupon usable by this user, or throws a user-facing reason. */
  async evaluateForCheckout(code: string, userId: string, subtotal: number) {
    const coupon = await prisma.rewardCoupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon) return null; // not a reward coupon — caller falls back to global coupons
    if (coupon.userId !== userId) throw new BadRequestError('This reward coupon belongs to another account');
    if (coupon.status === 'REDEEMED') throw new BadRequestError('This reward coupon has already been used');
    if (coupon.status === 'EXPIRED' || coupon.expiresAt < new Date()) {
      throw new BadRequestError('This reward coupon has expired');
    }
    if (subtotal < Number(coupon.minOrder)) {
      throw new BadRequestError(`Add items worth ₹${Number(coupon.minOrder)} to use this reward`);
    }
    const discount = Math.min(Number(coupon.cashbackAmount), subtotal);
    return { rewardCouponId: coupon.id, code: coupon.code, discount };
  },

  /** Marks a reward coupon redeemed against an order (called during placement). */
  markRedeemed(rewardCouponId: string, orderId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.rewardCoupon.update({
      where: { id: rewardCouponId },
      data: { status: 'REDEEMED', redeemedOrderId: orderId, redeemedAt: new Date() },
    });
  },

  // ── Admin analytics ────────────────────────────────────────
  async analytics() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [totalSpins, todaySpins, redeemed, cashbackAgg, byReward] = await Promise.all([
      prisma.rewardCoupon.count(),
      prisma.rewardCoupon.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.rewardCoupon.count({ where: { status: 'REDEEMED' } }),
      prisma.rewardCoupon.aggregate({ _sum: { cashbackAmount: true } }),
      prisma.rewardCoupon.groupBy({
        by: ['cashbackAmount'],
        _count: true,
        orderBy: { _count: { cashbackAmount: 'desc' } },
        take: 1,
      }),
    ]);

    return {
      totalSpins,
      todaySpins,
      couponsGenerated: totalSpins,
      couponsRedeemed: redeemed,
      totalCashbackIssued: Number(cashbackAgg._sum.cashbackAmount ?? 0),
      mostWonReward: byReward[0] ? Number(byReward[0].cashbackAmount) : null,
    };
  },
};
