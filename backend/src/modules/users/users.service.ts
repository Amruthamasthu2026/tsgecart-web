import { usersRepository } from './users.repository.js';
import { hashPassword, verifyPassword } from '../../shared/password.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';
import type { UpdateProfileInput, AddressInput } from './users.validators.js';

export const usersService = {
  async updateProfile(userId: string, input: UpdateProfileInput) {
    const user = await usersRepository.updateProfile(userId, input);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
    };
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await usersRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestError('Current password is incorrect');
    const passwordHash = await hashPassword(newPassword);
    await usersRepository.updateProfile(userId, { passwordHash });
    return { changed: true };
  },

  listAddresses(userId: string) {
    return usersRepository.listAddresses(userId);
  },

  async createAddress(userId: string, input: AddressInput) {
    const count = await usersRepository.countAddresses(userId);
    const isFirst = count === 0;
    return usersRepository.createAddress(userId, {
      ...input,
      userId,
      isDefault: input.isDefault || isFirst, // first address is default
    });
  },

  async updateAddress(userId: string, id: string, input: AddressInput) {
    const existing = await usersRepository.findAddress(userId, id);
    if (!existing) throw new NotFoundError('Address not found');
    return usersRepository.updateAddress(userId, id, input);
  },

  async deleteAddress(userId: string, id: string) {
    const existing = await usersRepository.findAddress(userId, id);
    if (!existing) throw new NotFoundError('Address not found');
    await usersRepository.deleteAddress(id);
    // Promote another address to default if we removed the default one.
    if (existing.isDefault) {
      const remaining = await usersRepository.listAddresses(userId);
      if (remaining[0]) {
        await usersRepository.updateAddress(userId, remaining[0].id, { isDefault: true });
      }
    }
    return { deleted: true };
  },
};
