// ===============================================================================================
// SECURITY MIDDLEWARE
// ===============================================================================================

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
 * Input sanitization helper
 */
export function sanitizeString(input, maxLength = 1000) {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, ''); // Remove potential HTML tags
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

