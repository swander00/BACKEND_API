// ===============================================================================================
// MEDIA API ROUTES
// ===============================================================================================
// Endpoint for fetching property media/images directly from Media table
// ===============================================================================================

import express from 'express';
import { queryPropertyMedia } from '../services/propertyQueries.js';
import { validateListingKey } from '../utils/validation.js';
import { NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/media/:listingKey
 * Returns all media/images for a property, fetched directly from Media table
 * Primary photo should be first (based on PreferredPhotoYN and Order)
 * 
 * Response:
 * {
 *   media: [
 *     {
 *       id: string,
 *       url: string,
 *       alt: string | null,
 *       order: number | null,
 *       caption: string | null
 *     }
 *   ],
 *   mediaCount: number
 * }
 */
router.get('/:listingKey', async (req, res, next) => {
  try {
    // Validate listing key
    const listingKey = validateListingKey(req.params.listingKey);

    // Fetch media directly from Media table
    const startTime = Date.now();
    const media = await queryPropertyMedia(listingKey);
    const duration = Date.now() - startTime;
    
    logger.debug('Media query completed', { requestId: req.id, listingKey, duration: `${duration}ms`, count: media.length });

    // Map media to response format
    const mediaArray = media.map(m => ({
      id: m.MediaKey,
      url: m.MediaURL,
      alt: m.ShortDescription || null,
      order: m.Order || null,
      caption: m.ShortDescription || null,
      dimensions: null // TODO: Add when stored
    }));

    // Set cache headers (media doesn't change as frequently)
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300'); // 5 minutes

    res.json({
      media: mediaArray,
      mediaCount: mediaArray.length
    });
  } catch (error) {
    logger.error(`GET /api/media/${req.params.listingKey} error`, { 
      requestId: req.id, 
      listingKey: req.params.listingKey,
      error: error.message, 
      stack: error.stack 
    });
    next(error);
  }
});

export default router;

