import prisma from '../config/prisma.js';
import httpStatus from 'http-status';
import ApiError from '../utils/ApiError.js';

export const NotificationService = {
  /**
   * @param {Object} data 
   * @param {string} data.userId - Recipient
   * @param {string} [data.actorId] - Who triggered it
   * @param {string} data.type - ENUM type
   * @param {string} data.title
   * @param {string} data.message
   * @param {Object} [data.metadata] - JSON for building frontend links
   * @param {string} [data.actionUrl] - Explicit redirect URL
   */
  async createNotification(data) {
    const notification = await prisma.notification.create({
      data: {
        userId: data.userId,
        actorId: data.actorId,
        type: data.type,
        title: data.title,
        message: data.message,
        metadata: data.metadata || {},
        actionUrl: data.actionUrl || null
      },
      include: {
        actor: { select: { fullName: true, avatarUrl: true, email: true } }
      }
    });

    // Fire real-time WebSocket event if user is connected
    const userSocket = global.connectedUsers?.get(data.userId);
    if (userSocket && userSocket.readyState === 1) {
      userSocket.send(JSON.stringify({
        event: 'NEW_NOTIFICATION',
        payload: notification
      }));
    }

    return notification;
  },

  async getUserNotifications(userId, limit = 50) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        actor: { select: { fullName: true, avatarUrl: true, email: true } }
      }
    });
  },

  async markAsRead(notificationId, userId) {
    // Keep this endpoint idempotent and avoid Prisma's hard failure when no record matches.
    await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true }
    });

    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
      include: {
        actor: { select: { fullName: true, avatarUrl: true, email: true } }
      }
    });

    if (!notification) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Notification not found');
    }

    return notification;
  },

  async markAllAsRead(userId) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true }
    });
  }
};