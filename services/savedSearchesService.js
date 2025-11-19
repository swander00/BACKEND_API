// ===============================================================================================
// SAVED SEARCHES SERVICE
// ===============================================================================================
// Business logic for saved searches operations
// ===============================================================================================

import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';
import { logger } from '../utils/logger.js';

const admin = getSupabaseAdmin();

export class SavedSearchesService {
  /**
   * Get all saved searches for a user
   */
  async getSavedSearches(userId) {
    const { data, error } = await admin
      .from('UserSavedSearches')
      .select('*')
      .eq('UserId', userId)
      .order('CreatedAt', { ascending: false });

    if (error) {
      logger.error('Failed to get saved searches', { userId, error: error.message });
      throw new Error(`Failed to get saved searches: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get a single saved search
   */
  async getSavedSearch(userId, id) {
    const { data, error } = await admin
      .from('UserSavedSearches')
      .select('*')
      .eq('UserId', userId)
      .eq('Id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Failed to get saved search', { userId, id, error: error.message });
      throw new Error(`Failed to get saved search: ${error.message}`);
    }

    return data;
  }

  /**
   * Create a saved search
   */
  async createSavedSearch(userId, searchData) {
    const { Name, Filters, AlertsEnabled = true, AlertFrequency = 'daily' } = searchData;

    // Validate required fields
    if (!Name || typeof Name !== 'string' || Name.trim().length === 0) {
      throw new Error('Name is required and must be a non-empty string');
    }

    if (!Filters || typeof Filters !== 'object') {
      throw new Error('Filters is required and must be an object');
    }

    // Validate AlertFrequency
    const validFrequencies = ['instant', 'daily', 'weekly', 'never'];
    if (!validFrequencies.includes(AlertFrequency)) {
      throw new Error(`AlertFrequency must be one of: ${validFrequencies.join(', ')}`);
    }

    const { data, error } = await admin
      .from('UserSavedSearches')
      .insert({
        UserId: userId,
        Name: Name.trim(),
        Filters: Filters,
        AlertsEnabled: AlertsEnabled !== false,
        AlertFrequency: AlertFrequency,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create saved search', { userId, error: error.message });
      throw new Error(`Failed to create saved search: ${error.message}`);
    }

    return data;
  }

  /**
   * Update a saved search
   */
  async updateSavedSearch(userId, id, updates) {
    const allowedFields = ['Name', 'Filters', 'AlertsEnabled', 'AlertFrequency'];
    const filteredUpdates = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }

    // Validate AlertFrequency if provided
    if (filteredUpdates.AlertFrequency) {
      const validFrequencies = ['instant', 'daily', 'weekly', 'never'];
      if (!validFrequencies.includes(filteredUpdates.AlertFrequency)) {
        throw new Error(`AlertFrequency must be one of: ${validFrequencies.join(', ')}`);
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      throw new Error('No valid fields to update');
    }

    filteredUpdates.UpdatedAt = new Date().toISOString();

    const { data, error } = await admin
      .from('UserSavedSearches')
      .update(filteredUpdates)
      .eq('UserId', userId)
      .eq('Id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Saved search not found');
      }
      logger.error('Failed to update saved search', { userId, id, error: error.message });
      throw new Error(`Failed to update saved search: ${error.message}`);
    }

    return data;
  }

  /**
   * Delete a saved search
   */
  async deleteSavedSearch(userId, id) {
    const { error } = await admin
      .from('UserSavedSearches')
      .delete()
      .eq('UserId', userId)
      .eq('Id', id);

    if (error) {
      logger.error('Failed to delete saved search', { userId, id, error: error.message });
      throw new Error(`Failed to delete saved search: ${error.message}`);
    }
  }

  /**
   * Update search execution stats
   */
  async updateSearchStats(id, stats) {
    const { NewResultsCount, LastRunAt } = stats;

    const updates = {
      UpdatedAt: new Date().toISOString(),
    };

    if (NewResultsCount !== undefined) {
      updates.NewResultsCount = NewResultsCount;
    }

    if (LastRunAt !== undefined) {
      updates.LastRunAt = LastRunAt;
    }

    const { error } = await admin
      .from('UserSavedSearches')
      .update(updates)
      .eq('Id', id);

    if (error) {
      logger.error('Failed to update search stats', { id, error: error.message });
      throw new Error(`Failed to update search stats: ${error.message}`);
    }
  }

  /**
   * Get all active saved searches (with alerts enabled)
   */
  async getActiveSearches() {
    const { data, error } = await admin
      .from('UserSavedSearches')
      .select('*')
      .eq('AlertsEnabled', true)
      .neq('AlertFrequency', 'never');

    if (error) {
      logger.error('Failed to get active searches', { error: error.message });
      throw new Error(`Failed to get active searches: ${error.message}`);
    }

    return data || [];
  }
}

