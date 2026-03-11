import httpStatus from 'http-status';
import { NotificationService } from '../services/notification.service.js';

export const getNotifications = async (req, res) => {
  const notifications = await NotificationService.getUserNotifications(req.user.id);
  res.status(httpStatus.OK).json(notifications);
};

export const markAsRead = async (req, res) => {
  const notification = await NotificationService.markAsRead(req.params.notificationId, req.user.id);
  res.status(httpStatus.OK).json(notification);
};

export const markAllAsRead = async (req, res) => {
  const result = await NotificationService.markAllAsRead(req.user.id);
  res.status(httpStatus.OK).json({ success: true, updatedCount: result.count });
};