// ===============================================================================================
// LIKES API ROUTES
// ===============================================================================================
// Endpoints for property likes management
// ===============================================================================================

import express from 'express';
import { verifyAuth } from '../middleware/auth.js';
import { LikesService } from '../services/likesService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const likesService = new LikesService();

// All routes require authentication
router.use(verifyAuth);

// ===============================================================================================
// [1] GET LIKES
// ===============================================================================================

/**
 * GET /api/likes
 * Get all liked MLS numbers for current user
 */
router.get('/', async (req, res, next) => {
  try {
    const mlsNumbers = await likesService.getLikedProperties(req.userId);
    res.json({ mlsNumbers });
  } catch (error) {
    logger.error('Error getting likes', { userId: req.userId, error: error.message });
    next(error);
  }
});

// ===============================================================================================
// [2] LIKE/UNLIKE PROPERTY
// ===============================================================================================

/**
 * POST /api/likes
 * Like a property
 */
router.post('/', async (req, res, next) => {
  try {
    const { mlsNumber } = req.body;

    if (!mlsNumber || typeof mlsNumber !== 'string') {
      return res.status(400).json({
        error: 'Validation error',
        message: 'mlsNumber is required and must be a string',
      });
    }

    await likesService.likeProperty(req.userId, mlsNumber);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error liking property', { userId: req.userId, error: error.message });
    next(error);
  }
});

/**
 * DELETE /api/likes/:mlsNumber
 * Unlike a property
 */
router.delete('/:mlsNumber', async (req, res, next) => {
  try {
    const { mlsNumber } = req.params;

    if (!mlsNumber) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'mlsNumber is required',
      });
    }

    await likesService.unlikeProperty(req.userId, mlsNumber);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error unliking property', { userId: req.userId, error: error.message });
    next(error);
  }
});

// ===============================================================================================
// [3] BULK OPERATIONS
// ===============================================================================================

/**
 * POST /api/likes/bulk
 * Bulk like properties
 */
router.post('/bulk', async (req, res, next) => {
  try {
    const { mlsNumbers } = req.body;

    if (!Array.isArray(mlsNumbers)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'mlsNumbers must be an array',
      });
    }

    const result = await likesService.bulkLikeProperties(req.userId, mlsNumbers);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Error bulk liking properties', { userId: req.userId, error: error.message });
    next(error);
  }
});

export default router;

