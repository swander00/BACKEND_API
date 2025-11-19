// ===============================================================================================
// SAVED LISTINGS API ROUTES
// ===============================================================================================
// Endpoints for saved listings management
// ===============================================================================================

import express from 'express';
import { verifyAuth } from '../middleware/auth.js';
import { SavedListingsService } from '../services/savedListingsService.js';
import { parseNumber } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const savedListingsService = new SavedListingsService();

// All routes require authentication
router.use(verifyAuth);

// ===============================================================================================
// [1] GET SAVED LISTINGS
// ===============================================================================================

/**
 * GET /api/saved-listings
 * Get saved listings with pagination and optional tag filter
 */
router.get('/', async (req, res, next) => {
  try {
    const page = parseNumber(req.query.page, 1, 1000, 'page') || 1;
    const limit = parseNumber(req.query.limit, 1, 100, 'limit') || 20;
    const tag = req.query.tag;

    const result = await savedListingsService.getSavedListings(req.userId, {
      page,
      limit,
      tag: tag || undefined,
    });

    res.json(result);
  } catch (error) {
    logger.error('Error getting saved listings', { userId: req.userId, error: error.message });
    next(error);
  }
});

/**
 * GET /api/saved-listings/tags
 * Get all unique tags for current user
 */
router.get('/tags', async (req, res, next) => {
  try {
    const tags = await savedListingsService.getUserTags(req.userId);
    res.json({ tags });
  } catch (error) {
    logger.error('Error getting tags', { userId: req.userId, error: error.message });
    next(error);
  }
});

/**
 * GET /api/saved-listings/:id
 * Get a single saved listing
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const listing = await savedListingsService.getSavedListing(req.userId, id);

    if (!listing) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Saved listing not found',
      });
    }

    res.json(listing);
  } catch (error) {
    logger.error('Error getting saved listing', { userId: req.userId, error: error.message });
    next(error);
  }
});

// ===============================================================================================
// [2] SAVE/UPDATE LISTING
// ===============================================================================================

/**
 * POST /api/saved-listings
 * Save a listing (upsert by MLS number)
 */
router.post('/', async (req, res, next) => {
  try {
    const { mlsNumber, Notes, Tags } = req.body;

    if (!mlsNumber || typeof mlsNumber !== 'string') {
      return res.status(400).json({
        error: 'Validation error',
        message: 'mlsNumber is required and must be a string',
      });
    }

    // Validate Tags is an array if provided
    if (Tags !== undefined && !Array.isArray(Tags)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Tags must be an array',
      });
    }

    const listing = await savedListingsService.saveListing(req.userId, mlsNumber, {
      Notes,
      Tags,
    });

    res.json(listing);
  } catch (error) {
    logger.error('Error saving listing', { userId: req.userId, error: error.message });
    next(error);
  }
});

/**
 * PUT /api/saved-listings/:id
 * Update a saved listing
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { Notes, Tags } = req.body;

    // Validate Tags is an array if provided
    if (Tags !== undefined && !Array.isArray(Tags)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Tags must be an array',
      });
    }

    const listing = await savedListingsService.updateSavedListing(req.userId, id, {
      Notes,
      Tags,
    });

    res.json(listing);
  } catch (error) {
    if (error.message === 'Saved listing not found') {
      return res.status(404).json({
        error: 'Not found',
        message: error.message,
      });
    }
    logger.error('Error updating saved listing', { userId: req.userId, error: error.message });
    next(error);
  }
});

// ===============================================================================================
// [3] DELETE LISTING
// ===============================================================================================

/**
 * DELETE /api/saved-listings/:id
 * Delete a saved listing
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await savedListingsService.deleteSavedListing(req.userId, id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting saved listing', { userId: req.userId, error: error.message });
    next(error);
  }
});

export default router;

