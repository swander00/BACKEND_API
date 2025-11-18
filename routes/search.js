// ===============================================================================================
// SEARCH API ROUTES
// ===============================================================================================
// Autocomplete/suggestion endpoints
// ===============================================================================================

import express from 'express';
import { queryPropertySuggestions } from '../services/propertyQueries.js';
import { validateSearchTerm } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/search?q={query}
 * Returns property suggestions for autocomplete
 * Note: Location suggestions (cities/communities) remain frontend-managed
 */
router.get('/', async (req, res, next) => {
  try {
    const queryRaw = req.query.q || '';
    const limitRaw = parseInt(req.query.limit) || 10;
    const limit = Math.min(Math.max(1, limitRaw), 50); // Clamp between 1 and 50

    // Validate and sanitize search term
    const query = validateSearchTerm(queryRaw, 100);

    if (!query || query.trim().length === 0) {
      return res.json({
        listings: [],
        meta: {
          totalCount: 0,
          query: ''
        }
      });
    }

    // Query PropertyView for suggestions
    const startTime = Date.now();
    const suggestions = await queryPropertySuggestions(query, limit);
    const duration = Date.now() - startTime;
    
    logger.debug('Search query completed', { requestId: req.id, duration: `${duration}ms`, query, count: suggestions.length });

    // Map to PropertySuggestionResponse format (slimmed PropertyCardResponse)
    const listings = suggestions.map(s => ({
      listingKey: s.ListingKey,
      mlsNumber: s.MLSNumber,
      fullAddress: s.FullAddress,
      city: s.City,
      stateOrProvince: s.StateOrProvince,
      cityRegion: s.CityRegion,
      status: s.Status,
      mlsStatus: s.MlsStatus,
      listingAge: s.ListingAge,
      listPrice: s.ListPrice,
      originalListPrice: s.OriginalListPrice,
      isPriceReduced: s.IsPriceReduced,
      priceReductionAmount: s.PriceReductionAmount,
      priceReductionPercent: s.PriceReductionPercent,
      reductionNumber: s.ReductionNumber,
      bedroomsAboveGrade: s.BedroomsAboveGrade,
      bedroomsBelowGrade: s.BedroomsBelowGrade,
      bathroomsTotalInteger: s.BathroomsTotalInteger,
      livingAreaMin: s.LivingAreaMin,
      livingAreaMax: s.LivingAreaMax,
      propertySubType: s.PropertySubType,
      primaryImageUrl: s.PrimaryImageUrl
    }));

    res.json({
      listings,
      meta: {
        totalCount: listings.length,
        query: query.trim()
      }
    });
  } catch (error) {
    logger.error('GET /api/search error', { requestId: req.id, error: error.message, stack: error.stack });
    next(error);
  }
});

export default router;

