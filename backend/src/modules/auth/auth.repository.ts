import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

/** Data-access layer for authentication. The only place auth touches Prisma. */
export const authRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  findUserByReferralCode(code: string) {
    return prisma.user.findUnique({ where: { referralCode: code } });
  },

  createUser(data: Prisma.UserCreateInput) {
    return prisma.user.create({ data });
  },

  updateUser(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id }, data });
  },

  createRefreshToken(data: Prisma.RefreshTokenUncheckedCreateInput) {
    return prisma.refreshToken.create({ data });
  },

  findRefreshTokenById(id: string) {
    return prisma.refreshToken.findUnique({ where: { id } });
  },

  revokeRefreshToken(id: string) {
    return prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
  },

  revokeAllUserRefreshTokens(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  createVerificationToken(data: Prisma.VerificationTokenUncheckedCreateInput) {
    return prisma.verificationToken.create({ data });
  },

  findVerificationToken(tokenHash: string, type: string) {
    return prisma.verificationToken.findFirst({
      where: { tokenHash, type, usedAt: null, expiresAt: { gt: new Date() } },
    });
  },

  markVerificationTokenUsed(id: string) {
    return prisma.verificationToken.update({ where: { id }, data: { usedAt: new Date() } });
  },

  /** Creates the user plus their cart, wishlist and referral link in one transaction. */
  createUserWithProfile(
    userData: Prisma.UserCreateInput,
    referral: { referrerId: string; code: string } | null,
  ) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: userData });
      await tx.cart.create({ data: { userId: user.id } });
      await tx.wishlist.create({ data: { userId: user.id } });
      if (referral) {
        await tx.referral.create({
          data: {
            referrerId: referral.referrerId,
            refereeId: user.id,
            code: referral.code,
          },
        });
      }
      return user;
    });
  },
};
