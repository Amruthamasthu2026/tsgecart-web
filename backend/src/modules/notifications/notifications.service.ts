import type { NotificationType } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

export const notificationsService = {
  create(userId: string, type: NotificationType, title: string, body: string, link?: string) {
    return prisma.notification.create({ data: { userId, type, title, body, link } });
  },

  list(userId: string) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  unreadCount(userId: string) {
    return prisma.notification.count({ where: { userId, isRead: false } });
  },

  async markRead(userId: string, id: string) {
    await prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
    return { read: true };
  },

  async markAllRead(userId: string) {
    await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    return { read: true };
  },
};
