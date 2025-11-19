// ===============================================================================================
// SAVED LISTINGS SERVICE
// ===============================================================================================
// Business logic for saved listings operations
// ===============================================================================================

import { getSupabaseAdmin } from '../utils/supabaseAdmin.js';
import { logger } from '../utils/logger.js';

const admin = getSupabaseAdmin();

export class SavedListingsService {
  /**
   * Get saved listings for a user with pagination
   */
  async getSavedListings(userId, options = {}) {
    const { page = 1, limit = 20, tag } = options;
    const offset = (page - 1) * limit;

    let query = admin
      .from('UserSavedListings')
      .select('*')
      .eq('UserId', userId)
      .order('SavedAt', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by tag if provided
    if (tag) {
      query = query.contains('Tags', [tag]);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('Failed to get saved listings', { userId, error: error.message });
      throw new Error(`Failed to get saved listings: ${error.message}`);
    }

    // Get total count
    let countQuery = admin
      .from('UserSavedListings')
      .select('*', { count: 'exact', head: true })
      .eq('UserId', userId);

    if (tag) {
      countQuery = countQuery.contains('Tags', [tag]);
    }

    const { count: total } = await countQuery;

    return {
      listings: data || [],
      total: total || 0,
      page,
      limit,
      totalPages: Math.ceil((total || 0) / limit),
    };
  }

  /**
   * Get a single saved listing
   */
  async getSavedListing(userId, id) {
    const { data, error } = await admin
      .from('UserSavedListings')
      .select('*')
      .eq('UserId', userId)
      .eq('Id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Failed to get saved listing', { userId, id, error: error.message });
      throw new Error(`Failed to get saved listing: ${error.message}`);
    }

    return data;
  }

  /**
   * Get saved listing by MLS number
   */
  async getSavedListingByMls(userId, mlsNumber) {
    const { data, error } = await admin
      .from('UserSavedListings')
      .select('*')
      .eq('UserId', userId)
      .eq('MlsNumber', mlsNumber)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('Failed to get saved listing by MLS', { userId, mlsNumber, error: error.message });
      throw new Error(`Failed to get saved listing: ${error.message}`);
    }

    return data;
  }

  /**
   * Save a listing (upsert)
   */
  async saveListing(userId, mlsNumber, options = {}) {
    const { Notes, Tags } = options;

    const { data, error } = await admin
      .from('UserSavedListings')
      .upsert({
        UserId: userId,
        MlsNumber: mlsNumber,
        Notes: Notes || null,
        Tags: Tags || null,
        SavedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      }, {
        onConflict: 'UserId,MlsNumber',
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to save listing', { userId, mlsNumber, error: error.message });
      throw new Error(`Failed to save listing: ${error.message}`);
    }

    return data;
  }

  /**
   * Update a saved listing
   */
  async updateSavedListing(userId, id, updates) {
    const allowedFields = ['Notes', 'Tags'];
    const filteredUpdates = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      throw new Error('No valid fields to update');
    }

    filteredUpdates.UpdatedAt = new Date().toISOString();

    const { data, error } = await admin
      .from('UserSavedListings')
      .update(filteredUpdates)
      .eq('UserId', userId)
      .eq('Id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Saved listing not found');
      }
      logger.error('Failed to update saved listing', { userId, id, error: error.message });
      throw new Error(`Failed to update saved listing: ${error.message}`);
    }

    return data;
  }

  /**
   * Delete a saved listing
   */
  async deleteSavedListing(userId, id) {
    const { error } = await admin
      .from('UserSavedListings')
      .delete()
      .eq('UserId', userId)
      .eq('Id', id);

    if (error) {
      logger.error('Failed to delete saved listing', { userId, id, error: error.message });
      throw new Error(`Failed to delete saved listing: ${error.message}`);
    }
  }

  /**
   * Get all unique tags for a user
   */
  async getUserTags(userId) {
    const { data, error } = await admin
      .from('UserSavedListings')
      .select('Tags')
      .eq('UserId', userId)
      .not('Tags', 'is', null);

    if (error) {
      logger.error('Failed to get user tags', { userId, error: error.message });
      throw new Error(`Failed to get user tags: ${error.message}`);
    }

    // Flatten and deduplicate tags
    const allTags = new Set();
    (data || []).forEach(listing => {
      if (listing.Tags && Array.isArray(listing.Tags)) {
        listing.Tags.forEach(tag => allTags.add(tag));
      }
    });

    return Array.from(allTags).sort();
  }
}

