import { prisma } from '../../config/prisma.js';
import { walletService } from '../wallet/wallet.service.js';
import { notificationsService } from '../notifications/notifications.service.js';

const REFERRER_REWARD = 50; // ₹ credited to the referrer
const REFEREE_REWARD = 25; // ₹ credited to the new user

export const referralService = {
  /** Summary for the "refer a friend" screen. */
  async getSummary(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    const referrals = await prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      include: { referee: { select: { name: true } } },
    });
    const totalEarned = referrals
      .filter((r) => r.status === 'COMPLETED')
      .reduce((sum, r) => sum + Number(r.rewardAmount), 0);
    return {
      referralCode: user?.referralCode ?? null,
      referrerReward: REFERRER_REWARD,
      refereeReward: REFEREE_REWARD,
      totalEarned,
      referrals: referrals.map((r) => ({
        name: r.referee.name,
        status: r.status,
        rewardAmount: Number(r.rewardAmount),
        createdAt: r.createdAt,
      })),
    };
  },

  /**
   * Completes a pending referral when the referee's first order is delivered:
   * credits both parties and marks the referral completed.
   */
  async completeForReferee(refereeId: string): Promise<void> {
    const referral = await prisma.referral.findUnique({
      where: { refereeId },
    });
    if (!referral || referral.status !== 'PENDING') return;

    await prisma.$transaction(async (tx) => {
      await tx.referral.update({
        where: { id: referral.id },
        data: { status: 'COMPLETED', rewardAmount: REFERRER_REWARD, completedAt: new Date() },
      });
      await walletService.adjust(referral.referrerId, REFERRER_REWARD, 'REFERRAL', {
        reference: referral.id,
        note: 'Referral reward',
        tx,
      });
      await walletService.adjust(refereeId, REFEREE_REWARD, 'REFERRAL', {
        reference: referral.id,
        note: 'Welcome referral bonus',
        tx,
      });
    });

    await Promise.all([
      notificationsService.create(
        referral.referrerId,
        'REFERRAL',
        'Referral reward earned!',
        `You earned ₹${REFERRER_REWARD} — a friend you referred placed their first order.`,
      ),
      notificationsService.create(
        refereeId,
        'REFERRAL',
        'Referral bonus credited',
        `₹${REFEREE_REWARD} has been added to your wallet.`,
      ),
    ]).catch(() => undefined);
  },
};
