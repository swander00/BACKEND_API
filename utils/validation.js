// ===============================================================================================
// INPUT VALIDATION UTILITIES
// ===============================================================================================

import { ValidationError } from './errors.js';

/**
 * Parse and validate number parameter
 */
export function parseNumber(value, min = null, max = null, fieldName = 'value') {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  
  const num = Number(value);
  if (isNaN(num)) {
    throw new ValidationError(`Invalid ${fieldName}: must be a number`, fieldName, value);
  }
  
  if (min !== null && num < min) {
    throw new ValidationError(`Invalid ${fieldName}: must be >= ${min}`, fieldName, value);
  }
  
  if (max !== null && num > max) {
    throw new ValidationError(`Invalid ${fieldName}: must be <= ${max}`, fieldName, value);
  }
  
  return num;
}

/**
 * Parse and validate array parameter (comma-separated)
 */
export function parseArrayParam(value, maxItems = 50) {
  if (!value) return undefined;
  
  if (typeof value === 'string') {
    const items = value.split(',').map(s => s.trim()).filter(Boolean);
    if (items.length > maxItems) {
      throw new ValidationError(`Too many items: maximum ${maxItems} allowed`, 'array', value);
    }
    return items.length > 0 ? items : undefined;
  }
  
  if (Array.isArray(value)) {
    if (value.length > maxItems) {
      throw new ValidationError(`Too many items: maximum ${maxItems} allowed`, 'array', value);
    }
    return value.map(s => String(s).trim()).filter(Boolean);
  }
  
  return undefined;
}

/**
 * Parse and validate boolean parameter
 */
export function parseBoolean(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
  }
  
  return undefined;
}

/**
 * Validate pagination parameters (clamps values instead of throwing)
 */
export function validatePagination(page, pageSize) {
  // Clamp page: min 1, max 10000
  let parsedPage = 1;
  if (page !== undefined && page !== null && page !== '') {
    const num = Number(page);
    if (!isNaN(num)) {
      parsedPage = Math.max(1, Math.min(10000, Math.floor(num)));
    }
  }
  
  // Clamp pageSize: min 1, max 100
  let parsedPageSize = 12;
  if (pageSize !== undefined && pageSize !== null && pageSize !== '') {
    const num = Number(pageSize);
    if (!isNaN(num)) {
      parsedPageSize = Math.max(1, Math.min(100, Math.floor(num)));
    }
  }
  
  return { page: parsedPage, pageSize: parsedPageSize };
}

/**
 * Validate and sanitize search term
 */
export function validateSearchTerm(term, maxLength = 100) {
  if (!term || typeof term !== 'string') {
    return undefined;
  }
  
  // Trim and limit length
  const sanitized = term.trim().slice(0, maxLength);
  
  // Remove potentially dangerous characters (basic sanitization)
  // Allow letters, numbers, spaces, hyphens, apostrophes
  const cleaned = sanitized.replace(/[^a-zA-Z0-9\s\-']/g, '');
  
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Validate map bounds
 */
export function validateMapBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') {
    return null;
  }
  
  const { northEast, southWest } = bounds;
  
  if (!northEast || !southWest) {
    throw new ValidationError('Bounds must include northEast and southWest', 'bounds', bounds);
  }
  
  const neLat = parseNumber(northEast.lat, -90, 90, 'northEast.lat');
  const neLng = parseNumber(northEast.lng, -180, 180, 'northEast.lng');
  const swLat = parseNumber(southWest.lat, -90, 90, 'southWest.lat');
  const swLng = parseNumber(southWest.lng, -180, 180, 'southWest.lng');
  
  if (neLat <= swLat || neLng <= swLng) {
    throw new ValidationError('Invalid bounds: northEast must be greater than southWest', 'bounds', bounds);
  }
  
  return {
    northEast: { lat: neLat, lng: neLng },
    southWest: { lat: swLat, lng: swLng }
  };
}

/**
 * Validate listing key format
 */
export function validateListingKey(listingKey) {
  if (!listingKey || typeof listingKey !== 'string') {
    throw new ValidationError('Listing key is required', 'listingKey', listingKey);
  }
  
  // Basic format validation (adjust based on your actual format)
  if (listingKey.length < 1 || listingKey.length > 100) {
    throw new ValidationError('Invalid listing key format', 'listingKey', listingKey);
  }
  
  // Sanitize to prevent injection
  if (!/^[a-zA-Z0-9\-_]+$/.test(listingKey)) {
    throw new ValidationError('Invalid listing key format: only alphanumeric, hyphens, and underscores allowed', 'listingKey', listingKey);
  }
  
  return listingKey;
}

/**
 * Validate and normalize status filter parameter
 * Returns normalized status value or 'for_sale' as default
 * 
 * Accepts both formats:
 * - Frontend format: "For Sale", "Sold", "For Lease", "Leased", "Removed"
 * - Backend format: "for_sale", "sold", "for_lease", "leased", "removed"
 * 
 * @param {string|undefined} status - Status value from query parameter
 * @returns {string} - Normalized status value (snake_case)
 */
export function validateStatus(status) {
  // Default to 'for_sale' if not provided
  if (!status || typeof status !== 'string') {
    return 'for_sale';
  }
  
  // Map frontend format to backend format
  const statusMap = {
    'for sale': 'for_sale',
    'for lease': 'for_lease',
    'sold': 'sold',
    'leased': 'leased',
    'removed': 'removed',
    // Also accept snake_case format directly
    'for_sale': 'for_sale',
    'for_lease': 'for_lease',
  };
  
  // Normalize: trim whitespace and convert to lowercase
  const normalized = status.trim().toLowerCase();
  
  // Check if it's a known status
  const mappedStatus = statusMap[normalized];
  
  if (!mappedStatus) {
    throw new ValidationError(
      `Invalid status: "${status}". Must be one of: For Sale, For Lease, Sold, Leased, Removed`,
      'status',
      status
    );
  }
  
  return mappedStatus;
}

