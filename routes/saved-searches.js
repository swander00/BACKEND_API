// ===============================================================================================
// SAVED SEARCHES API ROUTES
// ===============================================================================================
// Endpoints for saved searches management
// ===============================================================================================

import express from 'express';
import { verifyAuth } from '../middleware/auth.js';
import { SavedSearchesService } from '../services/savedSearchesService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const savedSearchesService = new SavedSearchesService();

// All routes require authentication
router.use(verifyAuth);

// ===============================================================================================
// [1] GET SAVED SEARCHES
// ===============================================================================================

/**
 * GET /api/saved-searches
 * Get all saved searches for current user
 */
router.get('/', async (req, res, next) => {
  try {
    const searches = await savedSearchesService.getSavedSearches(req.userId);
    res.json(searches);
  } catch (error) {
    logger.error('Error getting saved searches', { userId: req.userId, error: error.message });
    next(error);
  }
});

/**
 * GET /api/saved-searches/:id
 * Get a single saved search
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const search = await savedSearchesService.getSavedSearch(req.userId, id);

    if (!search) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Saved search not found',
      });
    }

    res.json(search);
  } catch (error) {
    logger.error('Error getting saved search', { userId: req.userId, error: error.message });
    next(error);
  }
});

// ===============================================================================================
// [2] CREATE/UPDATE SAVED SEARCH
// ===============================================================================================

/**
 * POST /api/saved-searches
 * Create a new saved search
 */
router.post('/', async (req, res, next) => {
  try {
    const { Name, Filters, AlertsEnabled, AlertFrequency } = req.body;

    if (!Name || !Filters) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Name and Filters are required',
      });
    }

    const search = await savedSearchesService.createSavedSearch(req.userId, {
      Name,
      Filters,
      AlertsEnabled,
      AlertFrequency,
    });

    res.status(201).json(search);
  } catch (error) {
    if (error.message.includes('must be one of')) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.message,
      });
    }
    logger.error('Error creating saved search', { userId: req.userId, error: error.message });
    next(error);
  }
});

/**
 * PUT /api/saved-searches/:id
 * Update a saved search
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { Name, Filters, AlertsEnabled, AlertFrequency } = req.body;

    const search = await savedSearchesService.updateSavedSearch(req.userId, id, {
      Name,
      Filters,
      AlertsEnabled,
      AlertFrequency,
    });

    res.json(search);
  } catch (error) {
    if (error.message === 'Saved search not found') {
      return res.status(404).json({
        error: 'Not found',
        message: error.message,
      });
    }
    if (error.message.includes('must be one of')) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.message,
      });
    }
    logger.error('Error updating saved search', { userId: req.userId, error: error.message });
    next(error);
  }
});

// ===============================================================================================
// [3] DELETE SAVED SEARCH
// ===============================================================================================

/**
 * DELETE /api/saved-searches/:id
 * Delete a saved search
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await savedSearchesService.deleteSavedSearch(req.userId, id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting saved search', { userId: req.userId, error: error.message });
    next(error);
  }
});

export default router;

