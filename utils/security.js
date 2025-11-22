// ===============================================================================================
// SECURITY MIDDLEWARE
// ===============================================================================================

import { logger } from './logger.js';

/**
 * Security headers middleware
 */
export function securityHeaders(req, res, next) {
  // Basic security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Remove server header (don't expose server info)
  res.removeHeader('X-Powered-By');
  
  next();
}

/**
 * Rate limiting configuration (already exists in utils/rateLimit.js)
 * This is just for reference
 */

/**
 * Input sanitization middleware
 * Sanitizes query parameters and request body to prevent injection attacks
 * Note: Very lenient - only removes script tags, preserves all valid input
 */
export function sanitizeInput(req, res, next) {
  try {
    // Sanitize query parameters (very lenient - only remove script tags)
    if (req.query && typeof req.query === 'object') {
      for (const [key, value] of Object.entries(req.query)) {
        if (typeof value === 'string' && value.includes('<script')) {
          // Only sanitize if it contains script tags
          req.query[key] = sanitizeString(value, 1000);
        } else if (Array.isArray(value)) {
          req.query[key] = value.map(v => 
            typeof v === 'string' && v.includes('<script') ? sanitizeString(v, 1000) : v
          );
        }
      }
    }

    // Sanitize request body (for POST/PUT/PATCH requests) - only if body exists and contains scripts
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      const bodyStr = JSON.stringify(req.body);
      if (bodyStr.includes('<script')) {
        try {
          req.body = sanitizeJson(req.body, 20);
        } catch (err) {
          // If sanitization fails, log but don't reject
          logger.warn('Body sanitization warning', { error: err.message, path: req.path });
        }
      }
    }

    next();
  } catch (error) {
    // If sanitization fails, log but don't reject - let route handlers validate
    logger.error('Sanitization error', { error: error.message, path: req.path });
    next();
  }
}

/**
 * Input sanitization helper
 */
export function sanitizeString(input, maxLength = 1000) {
  if (typeof input !== 'string') return input;
  
  // Only remove script tags, preserve everything else (including < > for valid use cases)
  return input
    .slice(0, maxLength)
    .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags only
    .replace(/javascript:/gi, ''); // Remove javascript: protocol
}

/**
 * Validate and sanitize JSON input
 */
export function sanitizeJson(input, maxDepth = 10) {
  if (typeof input !== 'object' || input === null) {
    return input;
  }
  
  if (maxDepth <= 0) {
    throw new Error('JSON depth limit exceeded');
  }
  
  if (Array.isArray(input)) {
    return input.map(item => sanitizeJson(item, maxDepth - 1));
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(input)) {
    // Sanitize keys
    const cleanKey = sanitizeString(key, 100);
    if (!cleanKey) continue;
    
    // Sanitize values
    if (typeof value === 'string') {
      sanitized[cleanKey] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[cleanKey] = sanitizeJson(value, maxDepth - 1);
    } else {
      sanitized[cleanKey] = value;
    }
  }
  
  return sanitized;
}

