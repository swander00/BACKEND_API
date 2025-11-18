// ===============================================================================================
// PROPERTY API ROUTES
// ===============================================================================================
// Frontend-facing endpoints that read exclusively from materialized views
// ===============================================================================================

import express from 'express';
import {
  queryPropertyCards,
  queryPropertyDetails,
  queryPropertyRooms,
  queryPropertyMedia,
  queryPropertySuggestions,
  queryMapPopupProperties
} from '../services/propertyQueries.js';
import { buildCacheKey, getCache, setCache } from '../utils/cache.js';
import { parseNumber, parseArrayParam, parseBoolean, validatePagination, validateSearchTerm, validateMapBounds, validateListingKey } from '../utils/validation.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// ===============================================================================================
// [1] PROPERTY SEARCH & LISTING
// ===============================================================================================

/**
 * GET /api/properties/map
 * Returns properties for map display with bounds filtering
 * NOTE: Must be defined BEFORE /:listingKey route
 */
router.get('/map', async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      minPrice: parseNumber(req.query.minPrice, 0, 100000000, 'minPrice'),
      maxPrice: parseNumber(req.query.maxPrice, 0, 100000000, 'maxPrice')
    };

    // Parse map bounds
    let mapBounds = null;
    if (req.query.bounds) {
      try {
        const parsed = JSON.parse(req.query.bounds);
        mapBounds = validateMapBounds(parsed);
      } catch (e) {
        if (e instanceof ValidationError) {
          return next(e);
        }
        return next(new ValidationError('Invalid bounds parameter: must be valid JSON', 'bounds', req.query.bounds));
      }
    }

    const startTime = Date.now();
    const properties = await queryMapPopupProperties(filters, mapBounds);
    const duration = Date.now() - startTime;
    
    logger.debug('Map query completed', { requestId: req.id, duration: `${duration}ms`, count: properties.length });

    // Map to MapPopupPropertyResponse format
    const mapped = properties.map(mapToMapPopupResponse);

    // Short TTL cache headers for map responses
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
    res.json({
      properties: mapped
    });
  } catch (error) {
    logger.error('GET /api/properties/map error', { requestId: req.id, error: error.message, stack: error.stack });
    next(error);
  }
});

/**
 * GET /api/properties
 * Returns paginated list of properties for grid/list views
 * Query params: filters, pagination, sorting
 */
router.get('/', async (req, res, next) => {
  try {
    // Parse query parameters with validation
    const filters = {
      city: parseArrayParam(req.query.city, 20),
      propertyType: parseArrayParam(req.query.propertyType, 20),
      minPrice: parseNumber(req.query.minPrice, 0, 100000000, 'minPrice'),
      maxPrice: parseNumber(req.query.maxPrice, 0, 100000000, 'maxPrice'),
      minBedrooms: parseNumber(req.query.minBedrooms, 0, 20, 'minBedrooms'),
      maxBedrooms: parseNumber(req.query.maxBedrooms, 0, 20, 'maxBedrooms'),
      minBathrooms: parseNumber(req.query.minBathrooms, 0, 20, 'minBathrooms'),
      maxBathrooms: parseNumber(req.query.maxBathrooms, 0, 20, 'maxBathrooms'),
      minSquareFeet: parseNumber(req.query.minSquareFeet, 0, 100000, 'minSquareFeet'),
      maxSquareFeet: parseNumber(req.query.maxSquareFeet, 0, 100000, 'maxSquareFeet'),
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      hasOpenHouse: parseBoolean(req.query.hasOpenHouse),
      hasVirtualTour: parseBoolean(req.query.hasVirtualTour),
      minGarageSpaces: parseNumber(req.query.minGarageSpaces, 0, 20, 'minGarageSpaces'),
      minTotalParking: parseNumber(req.query.minTotalParking, 0, 20, 'minTotalParking'),
      searchTerm: validateSearchTerm(req.query.searchTerm, 80)
    };

    const pagination = validatePagination(req.query.page, req.query.pageSize);
    const sortBy = sanitizeSortBy(req.query.sortBy);

    // Cache key
    const cacheKey = buildCacheKey('properties:list', { filters, pagination, sortBy });
    const cached = getCache(cacheKey);
    if (cached) {
      logger.debug('Cache hit', { requestId: req.id, key: cacheKey });
      return res.json(cached);
    }

    // Query PropertyView
    const startTime = Date.now();
    const result = await queryPropertyCards({ filters, pagination, sortBy });
    const duration = Date.now() - startTime;
    
    logger.debug('Properties query completed', { requestId: req.id, duration: `${duration}ms`, count: result.properties.length });

    // Map to PropertyCardResponse format
    const properties = result.properties.map(mapToPropertyCardResponse);

    const payload = {
      properties,
      pagination: result.pagination,
      totalCount: result.totalCount
    };

    // Set cache (30s TTL)
    setCache(cacheKey, payload, 30000);

    // Cache headers for list responses
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
    res.json(payload);
  } catch (error) {
    logger.error('GET /api/properties error', { requestId: req.id, error: error.message, stack: error.stack });
    next(error);
  }
});

// ===============================================================================================
// [2] PROPERTY DETAILS
// ===============================================================================================

/**
 * GET /api/properties/:listingKey
 * Returns full property details for desktop/mobile modal
 */
router.get('/:listingKey', async (req, res, next) => {
  try {
    // Validate listing key
    const listingKey = validateListingKey(req.params.listingKey);

    // Fetch property details, rooms, and media in parallel
    const startTime = Date.now();
    const [property, rooms, media] = await Promise.all([
      queryPropertyDetails(listingKey),
      queryPropertyRooms(listingKey),
      queryPropertyMedia(listingKey)
    ]);
    const duration = Date.now() - startTime;
    
    logger.debug('Property details query completed', { requestId: req.id, listingKey, duration: `${duration}ms` });

    if (!property) {
      return next(new NotFoundError('Property', listingKey));
    }

    // Map to PropertyDetailsResponse format
    const response = mapToPropertyDetailsResponse(property, rooms, media);

    // Conditional caching (ETag / Last-Modified)
    const lastModifiedIso = property.ModificationTimestamp || property.OriginalEntryTimestamp || new Date().toISOString();
    const lastModified = new Date(lastModifiedIso).toUTCString();
    const weakEtag = `W/"${Buffer.from(`${property.ListingKey}:${property.ModificationTimestamp || ''}:${property.ListPrice || ''}`).toString('base64')}"`;

    // Set cache headers
    res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
    res.setHeader('Last-Modified', lastModified);
    res.setHeader('ETag', weakEtag);

    // Handle validators
    const ifNoneMatch = req.headers['if-none-match'];
    const ifModifiedSince = req.headers['if-modified-since'];
    const isEtagMatch = ifNoneMatch && ifNoneMatch === weakEtag;
    const isNotModifiedSince = (() => {
      if (!ifModifiedSince) return false;
      const since = new Date(ifModifiedSince).getTime();
      const lm = new Date(lastModified).getTime();
      return !isNaN(since) && !isNaN(lm) && lm <= since;
    })();

    if (isEtagMatch || isNotModifiedSince) {
      return res.status(304).end();
    }

    res.json(response);
  } catch (error) {
    logger.error(`GET /api/properties/${req.params.listingKey} error`, { 
      requestId: req.id, 
      listingKey: req.params.listingKey,
      error: error.message, 
      stack: error.stack 
    });
    next(error);
  }
});

// ===============================================================================================
// [3] RESPONSE MAPPERS
// ===============================================================================================

/**
 * Map PropertyView record to PropertyCardResponse
 * Returns structure compatible with frontend Property type
 */
function mapToPropertyCardResponse(record) {
  // Parse price reduction amount from string to number if needed
  const parsePriceReduction = (amount) => {
    if (!amount) return undefined;
    if (typeof amount === 'number') return amount;
    // Remove currency symbols and commas, parse as number
    const cleaned = String(amount).replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? undefined : parsed;
  };

  // Build images array - include primary image if available
  const images = [];
  if (record.PrimaryImageUrl) {
    images.push(record.PrimaryImageUrl);
  }

  // Parse address components from FullAddress
  const fullAddress = record.FullAddress || '';
  const addressParts = fullAddress.split(',').map(s => s.trim());
  const street = addressParts[0] || '';
  const city = record.City || addressParts[1] || '';
  const province = record.StateOrProvince || addressParts[2] || '';

  // Calculate driveway parking (total - garage - covered)
  const drivewayParking = Math.max(0, 
    (record.ParkingTotal || 0) - (record.GarageSpaces || 0) - (record.CoveredSpaces || 0)
  );

  return {
    // Required fields for frontend Property type
    id: record.ListingKey, // Use listingKey as id
    listingKey: record.ListingKey,
    mlsNumber: record.MLSNumber,
    
    // Price fields
    price: record.ListPrice || 0,
    listPrice: record.ListPrice, // Keep for backward compatibility
    originalListPrice: record.OriginalListPrice,
    isPriceReduced: record.IsPriceReduced || false,
    priceReductionAmount: parsePriceReduction(record.PriceReductionAmount),
    priceReductionPercent: record.PriceReductionPercent,
    reductionNumber: record.ReductionNumber,
    
    // Nested address object (frontend expects this)
    address: {
      street: street,
      city: city,
      province: province,
      unparsedAddress: fullAddress,
      countyOrParish: record.CountyOrParish
    },
    
    // Keep flat fields for backward compatibility
    fullAddress: fullAddress,
    city: city,
    stateOrProvince: province,
    
    // Nested location object (frontend expects this)
    location: {
      neighborhood: record.CityRegion || record.Community || city,
      tagColor: 'yellow', // Default tag color
      cityRegion: record.CityRegion
    },
    
    // Property type fields
    propertyType: record.PropertyType,
    propertySubType: record.PropertySubType,
    
    // Nested bedrooms object (frontend expects this)
    bedrooms: {
      above: record.BedroomsAboveGrade || 0,
      below: record.BedroomsBelowGrade || 0,
      total: (record.BedroomsAboveGrade || 0) + (record.BedroomsBelowGrade || 0)
    },
    bedroomsDisplay: record.BedroomsDisplay, // Keep for display
    
    // Bathrooms (frontend expects number, not nested)
    bathrooms: record.BathroomsTotalInteger || 0,
    bathroomsDisplay: record.BathroomsDisplay, // Keep for display
    bathroomsTotalInteger: record.BathroomsTotalInteger, // Keep for backward compatibility
    
    // Nested squareFootage object (frontend expects this)
    squareFootage: {
      min: record.LivingAreaMin || 0,
      max: record.LivingAreaMax || record.LivingAreaMin || 0
    },
    livingAreaMin: record.LivingAreaMin, // Keep for backward compatibility
    livingAreaMax: record.LivingAreaMax, // Keep for backward compatibility
    
    // Nested parking object (frontend expects this)
    parking: {
      garage: record.GarageSpaces || 0,
      driveway: drivewayParking,
      total: record.ParkingTotal || 0
    },
    parkingDisplay: record.ParkingDisplay, // Formatted display string "2+4" (garage+driveway)
    parkingTotal: record.ParkingTotal, // Keep for backward compatibility
    coveredSpaces: record.CoveredSpaces, // Keep for backward compatibility
    parkingSpaces: record.ParkingSpaces, // Keep for backward compatibility
    garageSpaces: record.GarageSpaces, // Keep for backward compatibility
    
    // Media fields
    primaryImageUrl: record.PrimaryImageUrl,
    images: images, // Array with primary image
    mediaCount: record.MediaCount || 0,
    hasVirtualTour: record.HasVirtualTour || false,
    virtualTourUrl: record.VirtualTourUrl,
    
    // Status and listing info (use MlsStatus only, StatusDisplay and Status removed)
    status: record.MlsStatus,
    mlsStatus: record.MlsStatus,
    transactionType: record.TransactionType,
    isNewListing: record.isNewListing || false,
    listingAge: record.ListingAge,
    listedAt: record.OriginalEntryTimestamp, // Frontend expects listedAt
    originalEntryTimestamp: record.OriginalEntryTimestamp, // Keep for backward compatibility
    modificationTimestamp: record.ModificationTimestamp,
    
    // Open house fields
    openHouseDisplay: record.OpenHouseDisplay,
    hasOpenHouseToday: record.HasOpenHouseToday || false,
    hasOpenHouseTomorrow: record.HasOpenHouseTomorrow || false,
    hasNextWeekendOpenHouse: record.HasNextWeekendOpenHouse || false,
    openHouseFlags: {
      hasOpenHouseToday: record.HasOpenHouseToday || false,
      hasOpenHouseTomorrow: record.HasOpenHouseTomorrow || false,
      hasNextWeekendOpenHouse: record.HasNextWeekendOpenHouse || false
    },
    
    // Coordinates (for map view)
    coordinates: record.Latitude && record.Longitude ? {
      lat: record.Latitude,
      lng: record.Longitude
    } : undefined,
    latitude: record.Latitude, // Keep for backward compatibility
    longitude: record.Longitude, // Keep for backward compatibility
    
    // Legacy fields for backward compatibility
    media: [] // Empty array for backward compatibility
  };
}

/**
 * Map PropertyView + Rooms + Media to PropertyDetailsResponse
 */
function mapToPropertyDetailsResponse(property, rooms, media) {
  // Map media array
  const mediaArray = media.map(m => ({
    id: m.MediaKey,
    url: m.MediaURL,
    alt: m.ShortDescription || null,
    order: m.Order || null,
    caption: m.ShortDescription || null,
    dimensions: null // TODO: Add when stored
  }));

  // Map rooms array
  const roomsArray = rooms.map(r => ({
    id: r.RoomKey,
    roomType: r.RoomType,
    level: r.RoomLevel,
    dimensions: r.RoomMeasurements,
    features: r.RoomFeaturesArray || []
  }));

  // Parse price reduction amount
  const parsePriceReduction = (amount) => {
    if (!amount) return undefined;
    if (typeof amount === 'number') return amount;
    const cleaned = String(amount).replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? undefined : parsed;
  };

  // Build images array from media
  const images = mediaArray.map(m => m.url);

  // Calculate driveway parking
  const drivewayParking = Math.max(0, 
    (property.ParkingTotal || 0) - (property.GarageSpaces || 0) - (property.CoveredSpaces || 0)
  );

  // Build address components
  const fullAddress = property.FullAddress || '';
  const addressParts = fullAddress.split(',').map(s => s.trim());
  const street = property.StreetName 
    ? `${property.StreetNumber || ''} ${property.StreetName} ${property.StreetSuffix || ''}`.trim()
    : addressParts[0] || '';

  return {
    // Required fields for frontend Property type
    id: property.ListingKey, // Use listingKey as id
    listingKey: property.ListingKey,
    mlsNumber: property.MLSNumber,
    
    // Price fields
    price: property.ListPrice || 0,
    listPrice: property.ListPrice, // Keep for backward compatibility
    originalListPrice: property.OriginalListPrice,
    closePrice: property.ClosePrice,
    isPriceReduced: property.IsPriceReduced || false,
    priceReductionAmount: parsePriceReduction(property.PriceReductionAmount),
    priceReductionPercent: property.PriceReductionPercent,
    reductionNumber: property.ReductionNumber,
    
    // Nested address object (frontend expects this)
    address: {
      street: street,
      streetNumber: property.StreetNumber,
      streetName: property.StreetName,
      streetSuffix: property.StreetSuffix,
      unitNumber: property.UnitNumber,
      city: property.City,
      province: property.StateOrProvince,
      postalCode: property.PostalCode,
      countyOrParish: property.CountyOrParish,
      unparsedAddress: fullAddress
    },
    // Keep flat fields for backward compatibility
    fullAddress: fullAddress,
    streetNumber: property.StreetNumber,
    streetName: property.StreetName,
    streetSuffix: property.StreetSuffix,
    unitNumber: property.UnitNumber,
    city: property.City,
    community: property.Community,
    countyOrParish: property.CountyOrParish,
    stateOrProvince: property.StateOrProvince,
    postalCode: property.PostalCode,
    
    // Nested location object (frontend expects this)
    location: {
      neighborhood: property.Community || property.City || '',
      tagColor: 'yellow',
      cityRegion: property.Community
    },
    
    // Coordinates (frontend expects lat/lng)
    coordinates: property.Latitude && property.Longitude ? {
      lat: property.Latitude,
      lng: property.Longitude
    } : undefined,
    latitude: property.Latitude, // Keep for backward compatibility
    longitude: property.Longitude, // Keep for backward compatibility
    
    // Status and listing info (use MlsStatus only, StatusDisplay and Status removed)
    status: property.MlsStatus,
    mlsStatus: property.MlsStatus,
    transactionType: property.TransactionType,
    statusDates: {
      purchaseContractDate: property.PurchaseContractDate,
      suspendedDate: property.SuspendedDate,
      terminatedDate: property.TerminatedDate,
      expirationDate: property.ExpirationDate
    },
    daysOnMarket: property.DaysOnMarket,
    isNewListing: property.isNewListing || false,
    listingAge: property.ListingAge,
    listedAt: property.OriginalEntryTimestamp, // Frontend expects listedAt
    originalEntryTimestamp: property.OriginalEntryTimestamp, // Keep for backward compatibility
    listDate: property.OriginalEntryTimestamp, // Keep for backward compatibility
    modificationTimestamp: property.ModificationTimestamp,
    
    // Stats
    stats: {
      views: property.ViewCount || 0,
      bookmarks: property.SaveCount || 0,
      favorites: property.SaveCount || 0
    },
    viewCount: property.ViewCount || 0, // Keep for backward compatibility
    saveCount: property.SaveCount || 0, // Keep for backward compatibility
    todayViews: property.TodayViewCount || null,
    todaySaves: property.TodaySaveCount || null,
    
    // Media fields
    media: mediaArray, // Full media array with metadata
    primaryImageUrl: mediaArray[0]?.url || null,
    images: images, // Simple array of image URLs for frontend
    mediaCount: mediaArray.length,
    hasVirtualTour: property.HasVirtualTour || false,
    virtualTourUrl: property.VirtualTourUrl,
    
    // Nested bedrooms object (frontend expects this)
    bedrooms: {
      above: property.BedroomsAboveGrade || 0,
      below: property.BedroomsBelowGrade || 0,
      total: (property.BedroomsAboveGrade || 0) + (property.BedroomsBelowGrade || 0)
    },
    bedroomsDisplay: property.BedroomsDisplay, // Keep for display
    bedroomsAboveGrade: property.BedroomsAboveGrade, // Keep for backward compatibility
    bedroomsBelowGrade: property.BedroomsBelowGrade, // Keep for backward compatibility
    
    // Bathrooms (frontend expects number)
    bathrooms: property.BathroomsTotalInteger || 0,
    bathroomsDisplay: property.BathroomsDisplay, // Keep for display
    bathroomsTotalInteger: property.BathroomsTotalInteger, // Keep for backward compatibility
    
    // Kitchens
    kitchens: {
      aboveGrade: property.KitchensAboveGrade,
      belowGrade: property.KitchensBelowGrade,
      total: (property.KitchensAboveGrade || 0) + (property.KitchensBelowGrade || 0)
    },
    kitchensAboveGrade: property.KitchensAboveGrade, // Keep for backward compatibility
    kitchensBelowGrade: property.KitchensBelowGrade, // Keep for backward compatibility
    
    // Nested squareFootage object (frontend expects this)
    squareFootage: {
      min: property.LivingAreaMin || 0,
      max: property.LivingAreaMax || property.LivingAreaMin || 0
    },
    livingAreaMin: property.LivingAreaMin, // Keep for backward compatibility
    livingAreaMax: property.LivingAreaMax, // Keep for backward compatibility
    
    // Nested parking object (frontend expects this)
    parking: {
      garage: property.GarageSpaces || 0,
      driveway: drivewayParking,
      total: property.ParkingTotal || 0
    },
    parkingDisplay: property.ParkingDisplay, // Formatted display string "2+4" (garage+driveway)
    parkingTotal: property.ParkingTotal, // Keep for backward compatibility
    coveredSpaces: property.CoveredSpaces, // Keep for backward compatibility
    parkingSpaces: property.ParkingSpaces, // Keep for backward compatibility
    garageSpaces: property.GarageSpaces, // Keep for backward compatibility
    
    // Lot size
    lotSize: {
      width: property.LotWidth,
      depth: property.LotDepth,
      acres: property.LotSizeAcres,
      units: property.LotSizeUnits
    },
    lotSizeWidth: property.LotWidth, // Keep for backward compatibility
    lotSizeDepth: property.LotDepth, // Keep for backward compatibility
    lotSizeAcres: property.LotSizeAcres, // Keep for backward compatibility
    lotSizeUnits: property.LotSizeUnits, // Keep for backward compatibility
    
    // Age
    age: {
      display: property.PropertyAge,
      approximate: property.ApproximateAge || property.PropertyAge
    },
    approximateAge: property.ApproximateAge || property.PropertyAge, // Keep for backward compatibility
    propertyAge: property.PropertyAge, // Keep for backward compatibility
    
    // Property type
    propertyType: property.PropertyType,
    propertySubType: property.PropertySubType,
    propertyClass: property.PropertyClass, // Add PropertyClass
    architecturalStyle: property.ArchitecturalStyle, // Fix: Use ArchitecturalStyle field, not PropertySubType
    
    // Basement
    basement: property.BasementStatus,
    basementDetails: {
      status: property.BasementStatus,
      entrance: property.BasementEntrance,
      hasKitchen: property.BasementKitchen || false,
      rentalPotential: property.BasementRental || false
    },
    basementStatus: property.BasementStatus, // Keep for backward compatibility
    basementEntrance: property.BasementEntrance, // Keep for backward compatibility
    basementKitchen: property.BasementKitchen, // Keep for backward compatibility
    basementRental: property.BasementRental, // Keep for backward compatibility
    
    // Utilities
    utilities: {
      heatType: property.HeatType,
      cooling: property.Cooling,
      sewer: property.Sewer,
      fireplace: property.FireplaceYN || false
    },
    cooling: property.Cooling, // Keep for backward compatibility
    heatType: property.HeatType, // Keep for backward compatibility
    sewer: property.Sewer, // Keep for backward compatibility
    fireplaceYN: property.FireplaceYN, // Keep for backward compatibility
    
    // Association
    association: {
      fee: property.AssociationFee,
      additionalMonthlyFee: property.AdditionalMonthlyFee,
      feeIncludes: property.AssociationFeeIncludes,
      amenities: property.AssociationAmenities
    },
    associationFee: property.AssociationFee, // Keep for backward compatibility
    associationFeeIncludes: property.AssociationFeeIncludes, // Keep for backward compatibility
    additionalMonthlyFee: property.AdditionalMonthlyFee, // Keep for backward compatibility
    associationAmenities: property.AssociationAmenities, // Keep for backward compatibility
    
    // Features (convert to arrays if they're strings)
    exteriorFeatures: typeof property.ExteriorFeatures === 'string' 
      ? property.ExteriorFeatures.split(',').map(s => s.trim()).filter(Boolean)
      : property.ExteriorFeatures,
    interiorFeatures: typeof property.InteriorFeatures === 'string'
      ? property.InteriorFeatures.split(',').map(s => s.trim()).filter(Boolean)
      : property.InteriorFeatures,
    propertyFeatures: property.PropertyFeatures,
    
    // Waterfront
    waterfront: {
      waterBodyName: property.WaterBodyName,
      waterfrontYN: property.WaterfrontYN,
      waterView: property.WaterView,
      features: property.WaterfrontFeatures
    },
    waterBodyName: property.WaterBodyName, // Keep for backward compatibility
    waterfrontYN: property.WaterfrontYN, // Keep for backward compatibility
    waterView: property.WaterView, // Keep for backward compatibility
    waterfrontFeatures: property.WaterfrontFeatures, // Keep for backward compatibility
    
    // Other fields
    possession: property.Possession,
    publicRemarks: property.PublicRemarks,
    description: property.PublicRemarks, // Alias for frontend
    poolFeatures: property.PoolFeatures,
    petsAllowed: property.PetsAllowed,
    rentIncludes: property.RentIncludes,
    furnished: property.Furnished,
    locker: property.Locker,
    balconyType: property.BalconyType,
    
    // Tax
    tax: property.TaxAnnualAmount && property.TaxYear ? {
      amount: property.TaxAnnualAmount,
      year: property.TaxYear
    } : undefined,
    taxes: property.TaxAnnualAmount && property.TaxYear ? {
      annualAmount: property.TaxAnnualAmount,
      year: property.TaxYear
    } : undefined,
    taxAnnualAmount: property.TaxAnnualAmount, // Keep for backward compatibility
    taxYear: property.TaxYear, // Keep for backward compatibility
    
    // Rooms - provide both formats
    rooms: roomsArray, // Flat array for frontend Property type
    roomsSummary: { // Nested structure for PropertyDetailsResponse type
      summary: {
        totalBedrooms: (property.BedroomsAboveGrade || 0) + (property.BedroomsBelowGrade || 0),
        totalBathrooms: property.BathroomsTotalInteger || 0,
        squareFootage: property.LivingAreaMax || property.LivingAreaMin,
        roomCount: roomsArray.length
      },
      rooms: roomsArray
    },
    
    // Open house
    openHouse: property.OpenHouseDisplay ? {
      display: property.OpenHouseDisplay
    } : undefined,
    openHouseDisplay: property.OpenHouseDisplay, // Keep for backward compatibility
    openHouseEvents: null, // TODO: Future enhancement
    
    // Maintenance and POTL fees (mapped from AssociationFee and AdditionalMonthlyFee)
    maintenanceFee: property.AssociationFee || property.AdditionalMonthlyFee || null,
    maintenanceFeeSchedule: (property.AssociationFee || property.AdditionalMonthlyFee) ? "Monthly" : null,
    potl: property.AdditionalMonthlyFee || null,
    
    // Other TODO fields
    aiSummary: null, // TODO: Integrate AI service
    agent: null, // TODO: Integrate agent CRM
    waterSource: null // TODO: Add to view if needed (not currently in PropertyDetailsView)
  };
}

/**
 * Map PropertyInfoPopupView to MapPopupPropertyResponse
 * Returns structure compatible with frontend Property type
 */
function mapToMapPopupResponse(record) {
  // Parse address components
  const fullAddress = record.FullAddress || '';
  const addressParts = fullAddress.split(',').map(s => s.trim());
  const street = addressParts[0] || '';
  const city = record.City || addressParts[1] || '';
  const province = record.StateOrProvince || addressParts[2] || '';

  return {
    // Required fields
    id: record.ListingKey, // Use listingKey as id
    listingKey: record.ListingKey,
    mlsNumber: record.MLSNumber,
    
    // Price
    price: record.ListPrice || 0,
    listPrice: record.ListPrice, // Keep for backward compatibility
    
    // Address (nested structure)
    address: {
      street: street,
      city: city,
      province: province,
      unparsedAddress: fullAddress
    },
    fullAddress: fullAddress, // Keep for backward compatibility
    city: city,
    stateOrProvince: province,
    
    // Location
    location: {
      neighborhood: city,
      tagColor: 'yellow'
    },
    
    // Property type
    propertySubType: record.PropertySubType,
    
    // Coordinates (frontend expects lat/lng, not latitude/longitude)
    coordinates: record.Latitude && record.Longitude ? {
      lat: record.Latitude,
      lng: record.Longitude
    } : undefined,
    
    // Keep old format for backward compatibility
    latitude: record.Latitude,
    longitude: record.Longitude,
    
    // Status (use MlsStatus only)
    status: record.MlsStatus,
    
    // Media
    primaryImageUrl: record.PrimaryImageUrl,
    images: record.PrimaryImageUrl ? [record.PrimaryImageUrl] : [],
    
    // Listing info
    listedAt: record.ListedAt || record.OriginalEntryTimestamp,
    
    // Property details
    bedroomsDisplay: record.BedroomsDisplay,
    bathroomsDisplay: record.BathroomsDisplay,
    // Note: PropertyInfoPopupView doesn't have BathroomsTotalInteger, so we can't provide bathrooms number
    squareFootage: {
      min: record.LivingAreaMin || 0,
      max: record.LivingAreaMax || record.LivingAreaMin || 0
    },
    parking: {
      total: record.ParkingTotal || 0,
      garage: 0, // PropertyInfoPopupView doesn't have GarageSpaces
      driveway: Math.max(0, (record.ParkingTotal || 0) - (record.CoveredSpaces || 0))
    },
    
    // Keep flat fields for backward compatibility
    parkingTotal: record.ParkingTotal,
    coveredSpaces: record.CoveredSpaces,
    parkingSpaces: record.ParkingSpaces,
    livingAreaMin: record.LivingAreaMin,
    livingAreaMax: record.LivingAreaMax
  };
}

// ===============================================================================================
// [5] HELPER FUNCTIONS
// ===============================================================================================

// Validation functions moved to utils/validation.js

function sanitizeSortBy(value) {
  const allowed = new Set(['newest','oldest','price_asc','price_desc','sqft_asc','sqft_desc']);
  return allowed.has(value) ? value : 'newest';
}

export default router;

