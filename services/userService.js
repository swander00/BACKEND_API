// ===============================================================================================
// USER SERVICE
// ===============================================================================================
// Business logic for user domain operations
// ===============================================================================================

import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';
import { logger } from '../utils/logger.js';

const admin = getSupabaseAdmin();

export class UserService {
  /**
   * Get user profile
   */
  async getProfile(userId) {
    const { data, error } = await admin
      .from('UserProfiles')
      .select('*')
      .eq('Id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Profile doesn't exist yet
        return null;
      }
      logger.error('Failed to get user profile', { userId, error: error.message });
      throw new Error(`Failed to get user profile: ${error.message}`);
    }

    return data;
  }

  /**
   * Update user profile
   */
  async updateProfile(userId, updates) {
    // Validate that email cannot be changed
    if (updates.Email) {
      delete updates.Email;
    }

    // Validate that Id cannot be changed
    if (updates.Id) {
      delete updates.Id;
    }

    const { data, error } = await admin
      .from('UserProfiles')
      .update({ 
        ...updates, 
        UpdatedAt: new Date().toISOString() 
      })
      .eq('Id', userId)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update user profile', { userId, error: error.message });
      throw new Error(`Failed to update user profile: ${error.message}`);
    }

    return data;
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(userId) {
    try {
      await admin
        .from('UserProfiles')
        .update({ LastLoginAt: new Date().toISOString() })
        .eq('Id', userId);
    } catch (error) {
      // Log but don't throw - last login update is non-critical
      logger.warn('Failed to update last login', { userId, error: error.message });
    }
  }

  /**
   * Sync profile from auth user metadata (for avatar, name updates from OAuth)
   */
  async syncProfileFromAuth(userId) {
    try {
      // Get user from auth
      const { data: { user }, error: authError } = await admin.auth.admin.getUserById(userId);
      
      if (authError || !user) {
        logger.warn('Failed to get auth user for sync', { userId, error: authError?.message });
        return;
      }

      const updates = {
        Email: user.email || undefined,
        FirstName: user.user_metadata?.first_name || user.user_metadata?.name?.split(' ')[0] || undefined,
        LastName: user.user_metadata?.last_name || user.user_metadata?.name?.split(' ').slice(1).join(' ') || undefined,
        AvatarUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture || user.user_metadata?.image || undefined,
        LastLoginAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      };

      // Remove undefined values
      Object.keys(updates).forEach(key => {
        if (updates[key] === undefined) {
          delete updates[key];
        }
      });

      if (Object.keys(updates).length > 0) {
        await admin
          .from('UserProfiles')
          .update(updates)
          .eq('Id', userId);
        
        logger.info('Synced profile from auth', { userId });
      }
    } catch (error) {
      // Log but don't throw - sync is non-critical
      logger.warn('Failed to sync profile from auth', { userId, error: error.message });
    }
  }

  /**
   * Get buyer preferences
   */
  async getPreferences(userId) {
    const { data, error } = await admin
      .from('UserBuyerPreferences')
      .select('*')
      .eq('UserId', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Failed to get buyer preferences', { userId, error: error.message });
      throw new Error(`Failed to get buyer preferences: ${error.message}`);
    }

    return data;
  }

  /**
   * Upsert buyer preferences
   */
  async upsertPreferences(userId, preferences) {
    // Validate PurchaseTimeframe if provided
    if (preferences.PurchaseTimeframe) {
      const validTimeframes = ['0-3', '3-6', '6-12', '12+'];
      if (!validTimeframes.includes(preferences.PurchaseTimeframe)) {
        throw new Error(`Invalid PurchaseTimeframe. Must be one of: ${validTimeframes.join(', ')}`);
      }
    }

    const { data, error } = await admin
      .from('UserBuyerPreferences')
      .upsert({
        UserId: userId,
        ...preferences,
        UpdatedAt: new Date().toISOString(),
      }, {
        onConflict: 'UserId',
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to upsert buyer preferences', { userId, error: error.message });
      throw new Error(`Failed to save buyer preferences: ${error.message}`);
    }

    return data;
  }

  /**
   * Get onboarding status
   */
  async getOnboardingStatus(userId) {
    const [profile, preferences] = await Promise.all([
      this.getProfile(userId),
      this.getPreferences(userId),
    ]);

    return {
      profileComplete: profile && profile.FirstName && profile.Phone,
      preferencesComplete: preferences !== null,
      completedAt: preferences?.CreatedAt || null,
    };
  }
}

