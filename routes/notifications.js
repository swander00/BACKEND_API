// ===============================================================================================
// NOTIFICATIONS API ROUTES
// ===============================================================================================
// Endpoints for notifications management
// ===============================================================================================

import express from 'express';
import { verifyAuth } from '../middleware/auth.js';
import { NotificationsService } from '../services/notificationsService.js';
import { parseNumber, parseBoolean } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const notificationsService = new NotificationsService();

// All routes require authentication
router.use(verifyAuth);

// ===============================================================================================
// [1] GET NOTIFICATIONS
// ===============================================================================================

/**
 * GET /api/notifications
 * Get notifications with pagination and optional unread filter
 */
router.get('/', async (req, res, next) => {
  try {
    const unreadOnly = parseBoolean(req.query.unreadOnly) || false;
    const limit = parseNumber(req.query.limit, 1, 100, 'limit') || 20;
    const offset = parseNumber(req.query.offset, 0, 10000, 'offset') || 0;

    const result = await notificationsService.getNotifications(req.userId, {
      unreadOnly,
      limit,
      offset,
    });

    res.json(result);
  } catch (error) {
    logger.error('Error getting notifications', { userId: req.userId, error: error.message });
    next(error);
  }
});

/**
 * GET /api/notifications/unread-count
 * Get unread count only (lightweight endpoint)
 */
router.get('/unread-count', async (req, res, next) => {
  try {
    const result = await notificationsService.getUnreadCount(req.userId);
    res.json(result);
  } catch (error) {
    logger.error('Error getting unread count', { userId: req.userId, error: error.message });
    next(error);
  }
});

// ===============================================================================================
// [2] MARK AS READ
// ===============================================================================================

/**
 * PUT /api/notifications/:id/read
 * Mark a notification as read
 */
router.put('/:id/read', async (req, res, next) => {
  try {
    const { id } = req.params;
    const notification = await notificationsService.markAsRead(req.userId, id);
    res.json(notification);
  } catch (error) {
    if (error.message === 'Notification not found') {
      return res.status(404).json({
        error: 'Not found',
        message: error.message,
      });
    }
    logger.error('Error marking notification as read', { userId: req.userId, error: error.message });
    next(error);
  }
});

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read
 */
router.put('/read-all', async (req, res, next) => {
  try {
    const result = await notificationsService.markAllAsRead(req.userId);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Error marking all notifications as read', { userId: req.userId, error: error.message });
    next(error);
  }
});

// ===============================================================================================
// [3] DELETE NOTIFICATION
// ===============================================================================================

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await notificationsService.deleteNotification(req.userId, id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting notification', { userId: req.userId, error: error.message });
    next(error);
  }
});

export default router;

