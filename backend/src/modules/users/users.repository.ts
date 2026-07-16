import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

export const usersRepository = {
  updateProfile(userId: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id: userId }, data });
  },

  findById(userId: string) {
    return prisma.user.findUnique({ where: { id: userId } });
  },

  listAddresses(userId: string) {
    return prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  },

  findAddress(userId: string, id: string) {
    return prisma.address.findFirst({ where: { id, userId } });
  },

  /** Creates an address, resetting other defaults in the same transaction if needed. */
  createAddress(userId: string, data: Prisma.AddressUncheckedCreateInput) {
    return prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.create({ data });
    });
  },

  updateAddress(userId: string, id: string, data: Prisma.AddressUpdateInput) {
    return prisma.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.update({ where: { id }, data });
    });
  },

  deleteAddress(id: string) {
    return prisma.address.delete({ where: { id } });
  },

  countAddresses(userId: string) {
    return prisma.address.count({ where: { userId } });
  },
};
