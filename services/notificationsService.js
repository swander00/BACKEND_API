// ===============================================================================================
// NOTIFICATIONS SERVICE
// ===============================================================================================
// Business logic for notifications operations
// ===============================================================================================

import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';
import { logger } from '../utils/logger.js';

const admin = getSupabaseAdmin();

export class NotificationsService {
  /**
   * Get notifications for a user with pagination
   */
  async getNotifications(userId, options = {}) {
    const { unreadOnly = false, limit = 20, offset = 0 } = options;

    let query = admin
      .from('UserNotifications')
      .select('*', { count: 'exact' })
      .eq('UserId', userId)
      .order('CreatedAt', { ascending: false })
      .range(offset, offset + limit - 1);

    if (unreadOnly) {
      query = query.eq('IsRead', false);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('Failed to get notifications', { userId, error: error.message });
      throw new Error(`Failed to get notifications: ${error.message}`);
    }

    // Get unread count separately
    const { count: unreadCount } = await admin
      .from('UserNotifications')
      .select('*', { count: 'exact', head: true })
      .eq('UserId', userId)
      .eq('IsRead', false);

    return {
      notifications: data || [],
      total: count || 0,
      unreadCount: unreadCount || 0,
      limit,
      offset,
    };
  }

  /**
   * Get unread count only (lightweight)
   */
  async getUnreadCount(userId) {
    const { count, error } = await admin
      .from('UserNotifications')
      .select('*', { count: 'exact', head: true })
      .eq('UserId', userId)
      .eq('IsRead', false);

    if (error) {
      logger.error('Failed to get unread count', { userId, error: error.message });
      throw new Error(`Failed to get unread count: ${error.message}`);
    }

    return { count: count || 0 };
  }

  /**
   * Create a notification
   */
  async createNotification(userId, notificationData) {
    const { Type, Title, Message, Data = {} } = notificationData;

    // Validate Type
    const validTypes = ['saved_search', 'price_change', 'status_change', 'open_house', 'system'];
    if (!validTypes.includes(Type)) {
      throw new Error(`Type must be one of: ${validTypes.join(', ')}`);
    }

    const { data, error } = await admin
      .from('UserNotifications')
      .insert({
        UserId: userId,
        Type,
        Title,
        Message,
        Data,
        IsRead: false,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create notification', { userId, error: error.message });
      throw new Error(`Failed to create notification: ${error.message}`);
    }

    return data;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(userId, id) {
    const { data, error } = await admin
      .from('UserNotifications')
      .update({
        IsRead: true,
        ReadAt: new Date().toISOString(),
      })
      .eq('UserId', userId)
      .eq('Id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Notification not found');
      }
      logger.error('Failed to mark notification as read', { userId, id, error: error.message });
      throw new Error(`Failed to mark notification as read: ${error.message}`);
    }

    return data;
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId) {
    const { data, error, count } = await admin
      .from('UserNotifications')
      .update({
        IsRead: true,
        ReadAt: new Date().toISOString(),
      })
      .eq('UserId', userId)
      .eq('IsRead', false)
      .select();

    if (error) {
      logger.error('Failed to mark all notifications as read', { userId, error: error.message });
      throw new Error(`Failed to mark all notifications as read: ${error.message}`);
    }

    return { count: count || data?.length || 0 };
  }

  /**
   * Delete a notification
   */
  async deleteNotification(userId, id) {
    const { error } = await admin
      .from('UserNotifications')
      .delete()
      .eq('UserId', userId)
      .eq('Id', id);

    if (error) {
      logger.error('Failed to delete notification', { userId, id, error: error.message });
      throw new Error(`Failed to delete notification: ${error.message}`);
    }
  }
}

