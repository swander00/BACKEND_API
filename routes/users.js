// ===============================================================================================
// USER API ROUTES
// ===============================================================================================
// Endpoints for user profile and preferences management
// ===============================================================================================

import express from 'express';
import { verifyAuth } from '../middleware/auth.js';
import { UserService } from '../services/userService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const userService = new UserService();

// All routes require authentication
router.use(verifyAuth);

// ===============================================================================================
// [1] USER PROFILE
// ===============================================================================================

/**
 * GET /api/users/profile
 * Get current user's profile
 */
router.get('/profile', async (req, res, next) => {
  try {
    // Sync profile from auth first (to get latest avatar, etc.)
    userService.syncProfileFromAuth(req.userId).catch(err => {
      logger.warn('Failed to sync profile from auth', { userId: req.userId, error: err.message });
    });

    const profile = await userService.getProfile(req.userId);
    
    if (!profile) {
      return res.status(404).json({ 
        error: 'Profile not found',
        message: 'User profile does not exist. Please complete onboarding.' 
      });
    }

    // Update last login on profile fetch (non-blocking)
    userService.updateLastLogin(req.userId).catch(err => {
      logger.warn('Failed to update last login', { userId: req.userId, error: err.message });
    });

    res.json(profile);
  } catch (error) {
    logger.error('Error getting user profile', { userId: req.userId, error: error.message });
    next(error);
  }
});

/**
 * PUT /api/users/profile
 * Update current user's profile
 */
router.put('/profile', async (req, res, next) => {
  try {
    const updates = req.body;
    
    // Validate required fields are not being removed
    const allowedFields = ['FirstName', 'LastName', 'Phone', 'AvatarUrl'];
    const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));
    
    if (updateFields.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request',
        message: 'No valid fields to update' 
      });
    }

    const filteredUpdates = {};
    for (const field of updateFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }

    const profile = await userService.updateProfile(req.userId, filteredUpdates);
    res.json(profile);
  } catch (error) {
    logger.error('Error updating user profile', { userId: req.userId, error: error.message });
    next(error);
  }
});

// ===============================================================================================
// [2] BUYER PREFERENCES
// ===============================================================================================

/**
 * GET /api/users/preferences
 * Get current user's buyer preferences
 */
router.get('/preferences', async (req, res, next) => {
  try {
    const preferences = await userService.getPreferences(req.userId);
    res.json(preferences);
  } catch (error) {
    logger.error('Error getting buyer preferences', { userId: req.userId, error: error.message });
    next(error);
  }
});

/**
 * PUT /api/users/preferences
 * Upsert current user's buyer preferences
 */
router.put('/preferences', async (req, res, next) => {
  try {
    const preferences = req.body;
    
    // Validate allowed fields
    const allowedFields = ['FirstTimeBuyer', 'PreApproved', 'HasHouseToSell', 'PurchaseTimeframe'];
    const updateFields = Object.keys(preferences).filter(key => allowedFields.includes(key));
    
    if (updateFields.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request',
        message: 'No valid preference fields provided' 
      });
    }

    const filteredPreferences = {};
    for (const field of updateFields) {
      if (preferences[field] !== undefined) {
        filteredPreferences[field] = preferences[field];
      }
    }

    const result = await userService.upsertPreferences(req.userId, filteredPreferences);
    res.json(result);
  } catch (error) {
    logger.error('Error updating buyer preferences', { userId: req.userId, error: error.message });
    
    if (error.message.includes('Invalid PurchaseTimeframe')) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: error.message 
      });
    }
    
    next(error);
  }
});

// ===============================================================================================
// [3] ONBOARDING STATUS
// ===============================================================================================

/**
 * GET /api/users/onboarding-status
 * Get onboarding completion status
 */
router.get('/onboarding-status', async (req, res, next) => {
  try {
    const status = await userService.getOnboardingStatus(req.userId);
    res.json(status);
  } catch (error) {
    logger.error('Error getting onboarding status', { userId: req.userId, error: error.message });
    next(error);
  }
});

export default router;

