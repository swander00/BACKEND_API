// ===============================================================================================
// AUTHENTICATION MIDDLEWARE
// ===============================================================================================
// Verifies JWT tokens from Supabase Auth and attaches user to request
// ===============================================================================================

import { verifyAuthToken } from '../utils/supabaseAdmin.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware to verify JWT token and attach user to request
 * Requires Authorization: Bearer <token> header
 */
export async function verifyAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'No valid authorization token provided' 
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { user, userId } = await verifyAuthToken(token);

    // Attach user info to request
    req.user = user;
    req.userId = userId;

    next();
  } catch (error) {
    logger.warn('Authentication failed', { error: error.message, path: req.path });
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: error.message || 'Invalid or expired token' 
    });
  }
}

/**
 * Optional auth middleware - doesn't fail if no token, but attaches user if present
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { user, userId } = await verifyAuthToken(token);
      req.user = user;
      req.userId = userId;
    }
    
    next();
  } catch (error) {
    // Silently fail for optional auth
    next();
  }
}

