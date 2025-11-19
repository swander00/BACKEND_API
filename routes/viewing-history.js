// ===============================================================================================
// VIEWING HISTORY API ROUTES
// ===============================================================================================
// Endpoints for viewing history management
// ===============================================================================================

import express from 'express';
import { verifyAuth } from '../middleware/auth.js';
import { ViewingHistoryService } from '../services/viewingHistoryService.js';
import { parseNumber } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const viewingHistoryService = new ViewingHistoryService();

// All routes require authentication
router.use(verifyAuth);

// ===============================================================================================
// [1] TRACK VIEW
// ===============================================================================================

/**
 * POST /api/viewing-history/track
 * Track a property view (idempotent - increments view count)
 */
router.post('/track', async (req, res, next) => {
  try {
    const { mlsNumber } = req.body;

    if (!mlsNumber || typeof mlsNumber !== 'string') {
      return res.status(400).json({
        error: 'Validation error',
        message: 'mlsNumber is required and must be a string',
      });
    }

    await viewingHistoryService.trackView(req.userId, mlsNumber);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error tracking view', { userId: req.userId, error: error.message });
    next(error);
  }
});

// ===============================================================================================
// [2] GET VIEWING HISTORY
// ===============================================================================================

/**
 * GET /api/viewing-history
 * Get viewing history with pagination
 */
router.get('/', async (req, res, next) => {
  try {
    const limit = parseNumber(req.query.limit, 1, 100, 'limit') || 20;
    const offset = parseNumber(req.query.offset, 0, 10000, 'offset') || 0;

    const result = await viewingHistoryService.getViewingHistory(req.userId, {
      limit,
      offset,
    });

    res.json(result);
  } catch (error) {
    logger.error('Error getting viewing history', { userId: req.userId, error: error.message });
    next(error);
  }
});

// ===============================================================================================
// [3] DELETE VIEWING HISTORY
// ===============================================================================================

/**
 * DELETE /api/viewing-history/:id
 * Delete a viewing history entry
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await viewingHistoryService.deleteViewingHistory(req.userId, id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting viewing history', { userId: req.userId, error: error.message });
    next(error);
  }
});

/**
 * DELETE /api/viewing-history/clear
 * Clear all viewing history
 */
router.delete('/clear', async (req, res, next) => {
  try {
    await viewingHistoryService.clearViewingHistory(req.userId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error clearing viewing history', { userId: req.userId, error: error.message });
    next(error);
  }
});

export default router;

