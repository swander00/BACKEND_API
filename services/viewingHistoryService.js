// ===============================================================================================
// VIEWING HISTORY SERVICE
// ===============================================================================================
// Business logic for viewing history operations
// ===============================================================================================

import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';
import { logger } from '../utils/logger.js';

const admin = getSupabaseAdmin();

export class ViewingHistoryService {
  /**
   * Track a property view (upsert, incrementing view count)
   */
  async trackView(userId, mlsNumber) {
    // Check if record exists
    const { data: existing } = await admin
      .from('UserViewingHistory')
      .select('Id, ViewCount')
      .eq('UserId', userId)
      .eq('MlsNumber', mlsNumber)
      .single();

    if (existing) {
      // Update existing record
      const { error } = await admin
        .from('UserViewingHistory')
        .update({
          ViewCount: (existing.ViewCount || 1) + 1,
          LastViewedAt: new Date().toISOString(),
        })
        .eq('Id', existing.Id);

      if (error) {
        logger.error('Failed to update viewing history', { userId, mlsNumber, error: error.message });
        throw new Error(`Failed to track view: ${error.message}`);
      }
    } else {
      // Create new record
      const { error } = await admin
        .from('UserViewingHistory')
        .insert({
          UserId: userId,
          MlsNumber: mlsNumber,
          ViewCount: 1,
          FirstViewedAt: new Date().toISOString(),
          LastViewedAt: new Date().toISOString(),
        });

      if (error) {
        logger.error('Failed to create viewing history', { userId, mlsNumber, error: error.message });
        throw new Error(`Failed to track view: ${error.message}`);
      }
    }
  }

  /**
   * Get viewing history with pagination
   */
  async getViewingHistory(userId, options = {}) {
    const { limit = 20, offset = 0 } = options;

    const { data, error, count } = await admin
      .from('UserViewingHistory')
      .select('*', { count: 'exact' })
      .eq('UserId', userId)
      .order('LastViewedAt', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error('Failed to get viewing history', { userId, error: error.message });
      throw new Error(`Failed to get viewing history: ${error.message}`);
    }

    return {
      history: data || [],
      total: count || 0,
      limit,
      offset,
    };
  }

  /**
   * Delete a viewing history entry
   */
  async deleteViewingHistory(userId, id) {
    const { error } = await admin
      .from('UserViewingHistory')
      .delete()
      .eq('UserId', userId)
      .eq('Id', id);

    if (error) {
      logger.error('Failed to delete viewing history', { userId, id, error: error.message });
      throw new Error(`Failed to delete viewing history: ${error.message}`);
    }
  }

  /**
   * Clear all viewing history for a user
   */
  async clearViewingHistory(userId) {
    const { error } = await admin
      .from('UserViewingHistory')
      .delete()
      .eq('UserId', userId);

    if (error) {
      logger.error('Failed to clear viewing history', { userId, error: error.message });
      throw new Error(`Failed to clear viewing history: ${error.message}`);
    }
  }
}

