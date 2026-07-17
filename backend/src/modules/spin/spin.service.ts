import { prisma } from '../../config/prisma.js';
import { walletService } from '../wallet/wallet.service.js';
import { BadRequestError } from '../../shared/errors.js';

export const spinService = {
  async getActiveConfig() {
    const config = await prisma.spinWheelConfig.findFirst({
      where: { isActive: true },
      include: { segments: { where: { isActive: true } } },
    });
    return config;
  },

  /** Returns when the user may next spin, or null if they can spin now. */
  async nextSpinAt(userId: string, cooldownHours: number): Promise<Date | null> {
    const last = await prisma.spinHistory.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!last) return null;
    const next = new Date(last.createdAt.getTime() + cooldownHours * 3_600_000);
    return next > new Date() ? next : null;
  },

  async spin(userId: string) {
    const config = await this.getActiveConfig();
    if (!config || config.segments.length === 0) {
      throw new BadRequestError('The spin wheel is not available right now');
    }

    const blockedUntil = await this.nextSpinAt(userId, config.cooldownHours);
    if (blockedUntil) {
      throw new BadRequestError(`You can spin again after ${blockedUntil.toLocaleString('en-IN')}`);
    }

    // Weighted random selection.
    const totalWeight = config.segments.reduce((sum, s) => sum + s.weight, 0);
    let roll = Math.random() * totalWeight;
    const chosen =
      config.segments.find((s) => (roll -= s.weight) < 0) ?? config.segments[0];

    const reward = Number(chosen.rewardAmount);
    await prisma.$transaction(async (tx) => {
      await tx.spinHistory.create({
        data: { userId, segmentId: chosen.id, rewardAmount: reward },
      });
      if (reward > 0) {
        await walletService.adjust(userId, reward, 'SPIN', {
          reference: chosen.id,
          note: `Spin reward: ${chosen.label}`,
          tx,
        });
      }
    });

    return {
      segmentId: chosen.id,
      label: chosen.label,
      rewardAmount: reward,
      balance: await walletService.getBalance(userId),
    };
  },
};
