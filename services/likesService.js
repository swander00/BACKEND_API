// ===============================================================================================
// LIKES SERVICE
// ===============================================================================================
// Business logic for user likes operations
// ===============================================================================================

import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';
import { logger } from '../utils/logger.js';

export class LikesService {
  /**
   * Get all liked MLS numbers for a user
   */
  async getLikedProperties(userId) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('UserLikedProperties')
      .select('MlsNumber')
      .eq('UserId', userId)
      .order('LikedAt', { ascending: false });

    if (error) {
      logger.error('Failed to get liked properties', { userId, error: error.message });
      throw new Error(`Failed to get liked properties: ${error.message}`);
    }

    return data.map(row => row.MlsNumber);
  }

  /**
   * Check if a property is liked
   */
  async isLiked(userId, mlsNumber) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('UserLikedProperties')
      .select('Id')
      .eq('UserId', userId)
      .eq('MlsNumber', mlsNumber)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('Failed to check like status', { userId, mlsNumber, error: error.message });
      throw new Error(`Failed to check like status: ${error.message}`);
    }

    return !!data;
  }

  /**
   * Like a property (idempotent)
   */
  async likeProperty(userId, mlsNumber) {
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from('UserLikedProperties')
      .upsert({
        UserId: userId,
        MlsNumber: mlsNumber,
        LikedAt: new Date().toISOString(),
      }, {
        onConflict: 'UserId,MlsNumber',
      });

    if (error) {
      logger.error('Failed to like property', { userId, mlsNumber, error: error.message });
      throw new Error(`Failed to like property: ${error.message}`);
    }
  }

  /**
   * Unlike a property (idempotent)
   */
  async unlikeProperty(userId, mlsNumber) {
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from('UserLikedProperties')
      .delete()
      .eq('UserId', userId)
      .eq('MlsNumber', mlsNumber);

    if (error) {
      logger.error('Failed to unlike property', { userId, mlsNumber, error: error.message });
      throw new Error(`Failed to unlike property: ${error.message}`);
    }
  }

  /**
   * Bulk like properties
   */
  async bulkLikeProperties(userId, mlsNumbers) {
    if (!Array.isArray(mlsNumbers) || mlsNumbers.length === 0) {
      return { count: 0 };
    }

    const now = new Date().toISOString();
    const records = mlsNumbers.map(mlsNumber => ({
      UserId: userId,
      MlsNumber: mlsNumber,
      LikedAt: now,
    }));

    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from('UserLikedProperties')
      .upsert(records, {
        onConflict: 'UserId,MlsNumber',
      });

    if (error) {
      logger.error('Failed to bulk like properties', { userId, count: mlsNumbers.length, error: error.message });
      throw new Error(`Failed to bulk like properties: ${error.message}`);
    }

    return { count: mlsNumbers.length };
  }
}

