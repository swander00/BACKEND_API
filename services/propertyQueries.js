// ===============================================================================================
// PROPERTY QUERY SERVICE
// ===============================================================================================
// Handles all queries against materialized views (PropertyView, RoomDetailsView, etc.)
// Enforces view-only access - never queries raw tables
// ===============================================================================================

import { initDB } from '../db/client.js';
import { NotFoundError, DatabaseError } from '../utils/errors.js';

// ===============================================================================================
// [1] PROPERTY CARD QUERIES (List/Grid/Map)
// ===============================================================================================

/**
 * Build and execute query against PropertyView with filters, sorting, and pagination
 * @param {Object} filters - Filter criteria (city, price, bedrooms, etc.)
 * @param {Object} pagination - { page, pageSize }
 * @param {string} sortBy - Sort field and direction
 * @param {Object} mapBounds - Optional { northEast, southWest } for map queries
 * @returns {Promise<{properties: Array, totalCount: number, pagination: Object}>}
 */
export async function queryPropertyCards({ filters = {}, pagination = {}, sortBy = 'newest', mapBounds = null }) {
  const db = initDB();
  let query = db.from('PropertyView').select('*', { count: 'exact' });

  // Apply filters
  query = applyPropertyCardFilters(query, filters);

  // Apply map bounds if provided
  if (mapBounds) {
    query = applyMapBounds(query, mapBounds);
  }

  // Apply sorting
  query = applySorting(query, sortBy);

  // Apply pagination
  const { page = 1, pageSize = 12 } = pagination;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  // Execute query
  const { data, error, count } = await query;

  if (error) {
    throw new DatabaseError(`PropertyView query failed: ${error.message}`, error);
  }

  const totalPages = Math.ceil((count || 0) / pageSize);

  return {
    properties: data || [],
    totalCount: count || 0,
    pagination: {
      page,
      pageSize,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
}

/**
 * Apply filter criteria to PropertyView query
 */
function applyPropertyCardFilters(query, filters) {
  // City filter (array support)
  if (filters.city && Array.isArray(filters.city) && filters.city.length > 0) {
    query = query.in('City', filters.city);
  } else if (filters.city) {
    query = query.eq('City', filters.city);
  }

  // Property type filter
  if (filters.propertyType && Array.isArray(filters.propertyType) && filters.propertyType.length > 0) {
    query = query.in('PropertyType', filters.propertyType);
  } else if (filters.propertyType) {
    query = query.eq('PropertyType', filters.propertyType);
  }

  // Price range
  if (filters.minPrice) {
    query = query.gte('ListPrice', filters.minPrice);
  }
  if (filters.maxPrice) {
    query = query.lte('ListPrice', filters.maxPrice);
  }

  // Bedrooms
  if (filters.minBedrooms !== undefined) {
    query = query.gte('BedroomsAboveGrade', filters.minBedrooms);
  }
  if (filters.maxBedrooms !== undefined) {
    query = query.lte('BedroomsAboveGrade', filters.maxBedrooms);
  }

  // Bathrooms
  if (filters.minBathrooms !== undefined) {
    query = query.gte('BathroomsTotalInteger', filters.minBathrooms);
  }
  if (filters.maxBathrooms !== undefined) {
    query = query.lte('BathroomsTotalInteger', filters.maxBathrooms);
  }

  // Square footage
  if (filters.minSquareFeet) {
    query = query.gte('LivingAreaMax', filters.minSquareFeet);
  }
  if (filters.maxSquareFeet) {
    query = query.lte('LivingAreaMin', filters.maxSquareFeet);
  }

  // Status filter (use MlsStatus instead of Status)
  if (filters.status) {
    query = query.eq('MlsStatus', filters.status);
  }

  // Open house
  if (filters.hasOpenHouse === true) {
    query = query.eq('HasOpenHouse', true);
  }

  // Virtual tour
  if (filters.hasVirtualTour === true) {
    query = query.eq('HasVirtualTour', true);
  }

  // Parking
  if (filters.minGarageSpaces) {
    query = query.gte('GarageSpaces', filters.minGarageSpaces);
  }
  if (filters.minTotalParking) {
    query = query.gte('ParkingTotal', filters.minTotalParking);
  }

  // Search term (full-text search on address/city)
  if (filters.searchTerm) {
    const searchTerm = `%${filters.searchTerm.toLowerCase()}%`;
    // Supabase PostgREST doesn't support OR directly, so we'll filter client-side or use a different approach
    // For now, search on FullAddress (most common use case)
    query = query.ilike('FullAddress', searchTerm);
  }

  return query;
}

/**
 * Apply map bounds filter
 */
function applyMapBounds(query, bounds) {
  if (bounds.northEast && bounds.southWest) {
    query = query
      .gte('Latitude', bounds.southWest.lat)
      .lte('Latitude', bounds.northEast.lat)
      .gte('Longitude', bounds.southWest.lng)
      .lte('Longitude', bounds.northEast.lng);
  }
  return query;
}

/**
 * Apply sorting to query
 */
function applySorting(query, sortBy) {
  switch (sortBy) {
    case 'newest':
      return query.order('OriginalEntryTimestamp', { ascending: false });
    case 'oldest':
      return query.order('OriginalEntryTimestamp', { ascending: true });
    case 'price_asc':
      return query.order('ListPrice', { ascending: true });
    case 'price_desc':
      return query.order('ListPrice', { ascending: false });
    case 'sqft_asc':
      return query.order('LivingAreaMin', { ascending: true });
    case 'sqft_desc':
      return query.order('LivingAreaMax', { ascending: false });
    default:
      return query.order('OriginalEntryTimestamp', { ascending: false });
  }
}

// ===============================================================================================
// [2] PROPERTY DETAIL QUERIES
// ===============================================================================================

/**
 * Fetch single property detail by ListingKey
 * @param {string} listingKey
 * @returns {Promise<Object>}
 */
export async function queryPropertyDetails(listingKey) {
  const db = initDB();
  
  const { data, error } = await db
    .from('PropertyView')
    .select('*')
    .eq('ListingKey', listingKey)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new NotFoundError('Property', listingKey);
    }
    throw new DatabaseError(`PropertyView query failed: ${error.message}`, error);
  }

  return data;
}

/**
 * Fetch rooms for a property
 * @param {string} listingKey
 * @returns {Promise<Array>}
 */
export async function queryPropertyRooms(listingKey) {
  const db = initDB();
  
  const { data, error } = await db
    .from('RoomDetailsView')
    .select('*')
    .eq('ListingKey', listingKey)
    .order('RoomSortOrder', { ascending: true });

  if (error) {
    throw new DatabaseError(`RoomDetailsView query failed: ${error.message}`, error);
  }

  return data || [];
}

/**
 * Fetch media for a property
 * @param {string} listingKey
 * @returns {Promise<Array>}
 */
export async function queryPropertyMedia(listingKey) {
  const db = initDB();
  
  const { data, error } = await db
    .from('Media')
    .select('*')
    .eq('ResourceRecordKey', listingKey)
    .eq('MediaStatus', 'Active')
    .eq('MediaCategory', 'Photo')
    .order('PreferredPhotoYN', { ascending: false })
    .order('Order', { ascending: true });

  if (error) {
    throw new DatabaseError(`Media query failed: ${error.message}`, error);
  }

  return data || [];
}

// ===============================================================================================
// [3] SEARCH SUGGESTIONS
// ===============================================================================================

/**
 * Search for property suggestions (autocomplete)
 * @param {string} searchTerm
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function queryPropertySuggestions(searchTerm, limit = 10) {
  const db = initDB();
  
  if (!searchTerm || searchTerm.trim().length === 0) {
    return [];
  }

  const term = `%${searchTerm.toLowerCase().trim()}%`;
  
  // Query multiple fields - Supabase PostgREST limitation: do separate queries or use text search
  // For now, search on FullAddress and City separately, then combine
  const [addressResults, cityResults, mlsResults] = await Promise.all([
    db.from('PropertySuggestionView').select('*').ilike('FullAddress', term).limit(limit),
    db.from('PropertySuggestionView').select('*').ilike('City', term).limit(limit),
    db.from('PropertySuggestionView').select('*').ilike('MLSNumber', term).limit(limit)
  ]);

  // Combine and deduplicate by ListingKey
  const allResults = [
    ...(addressResults.data || []),
    ...(cityResults.data || []),
    ...(mlsResults.data || [])
  ];
  
  const uniqueResults = Array.from(
    new Map(allResults.map(item => [item.ListingKey, item])).values()
  ).slice(0, limit);

  const firstError = addressResults.error || cityResults.error || mlsResults.error;
  if (firstError) {
    throw new DatabaseError(`PropertySuggestionView query failed: ${firstError.message}`, firstError);
  }

  return uniqueResults;
}

// ===============================================================================================
// [4] MAP POPUP QUERIES
// ===============================================================================================

/**
 * Fetch properties for map popup display
 * @param {Object} filters
 * @param {Object} mapBounds
 * @returns {Promise<Array>}
 */
export async function queryMapPopupProperties(filters = {}, mapBounds) {
  const db = initDB();
  let query = db.from('PropertyInfoPopupView').select('*');

  // Apply map bounds (required for map queries)
  if (mapBounds && mapBounds.northEast && mapBounds.southWest) {
    query = query
      .gte('Latitude', mapBounds.southWest.lat)
      .lte('Latitude', mapBounds.northEast.lat)
      .gte('Longitude', mapBounds.southWest.lng)
      .lte('Longitude', mapBounds.northEast.lng);
  }

  // Apply basic filters (status, price range)
  if (filters.status) {
    query = query.eq('MlsStatus', filters.status);
  }
  if (filters.minPrice) {
    query = query.gte('ListPrice', filters.minPrice);
  }
  if (filters.maxPrice) {
    query = query.lte('ListPrice', filters.maxPrice);
  }

  const { data, error } = await query.limit(500); // Reasonable limit for map display

  if (error) {
    throw new DatabaseError(`PropertyInfoPopupView query failed: ${error.message}`, error);
  }

  return data || [];
}

// ===============================================================================================
// [END]
// ===============================================================================================

