import type { Prisma, WalletSource } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { BadRequestError } from '../../shared/errors.js';

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export const walletService = {
  /** Current wallet balance = running balanceAfter of the latest transaction. */
  async getBalance(userId: string): Promise<number> {
    const latest = await prisma.walletTransaction.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    });
    return latest ? Number(latest.balanceAfter) : 0;
  },

  async getTransactions(userId: string) {
    return prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  /**
   * Credits or debits the wallet atomically. Pass a negative amount to debit.
   * Accepts an optional transaction client so it can participate in a larger
   * transaction (e.g. order placement).
   */
  async adjust(
    userId: string,
    amount: number,
    source: WalletSource,
    options: { reference?: string; note?: string; tx?: Prisma.TransactionClient } = {},
  ) {
    const client = options.tx ?? prisma;
    const latest = await client.walletTransaction.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    });
    const current = latest ? Number(latest.balanceAfter) : 0;
    const next = round(current + amount);
    if (next < 0) throw new BadRequestError('Insufficient wallet balance');

    return client.walletTransaction.create({
      data: {
        userId,
        source,
        amount: round(amount),
        balanceAfter: next,
        reference: options.reference,
        note: options.note,
      },
    });
  },
};
