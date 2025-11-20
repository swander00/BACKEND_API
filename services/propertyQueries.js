// ===============================================================================================
// PROPERTY QUERY SERVICE
// ===============================================================================================
// Handles all queries against materialized views (PropertyView, RoomDetailsView, etc.)
// Enforces view-only access - never queries raw tables
// ===============================================================================================

import { initDB } from '../db/client.js';
import { NotFoundError, DatabaseError } from '../utils/errors.js';
import { getTimestampColumnForStatus, buildRemovedDateFilter } from '../utils/statusTimestampMapper.js';
import { logger } from '../utils/logger.js';

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
  // Note: Complex status filters (for_sale, for_lease) are handled with post-processing
  query = applyPropertyCardFilters(query, filters);

  // Apply map bounds if provided
  if (mapBounds) {
    query = applyMapBounds(query, mapBounds);
  }

  // Apply sorting
  query = applySorting(query, sortBy);

  // For complex status filters, fetch more data before pagination to account for post-processing
  const statusFilter = filters.status;
  const needsPostProcessing = statusFilter && (statusFilter === 'for_sale' || statusFilter === 'for_lease');
  
  // Extract pagination values at the start (needed for return statement)
  const { page = 1, pageSize = 12 } = pagination;
  
  let data, count;
  
  if (needsPostProcessing) {
    // Fetch larger dataset for post-processing, but limit to reasonable size
    // Fetch enough to fill current page + next page to account for filtering
    const fetchSize = Math.min(500, Math.max(pageSize * 5, 50)); // Fetch 5x pages worth, min 50, max 500
    query = query.limit(fetchSize);
    
    const queryStartTime = Date.now();
    const result = await query;
    const queryDuration = Date.now() - queryStartTime;
    
    if (queryDuration > 10000) {
      logger.warn(`Slow query detected: ${queryDuration}ms for post-processing filter`);
    }
    
    if (result.error) {
      throw new DatabaseError(`PropertyView query failed: ${result.error.message}`, result.error);
    }
    
    // Filter by TransactionType in memory
    const filtered = applyStatusFilterPostProcess(result.data || [], statusFilter);
    count = filtered.length;
    
    // Apply pagination after filtering
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    data = filtered.slice(from, to);
  } else {
    // Normal pagination for simple status filters
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
    
    const queryStartTime = Date.now();
    const result = await query;
    const queryDuration = Date.now() - queryStartTime;
    
    // Log slow queries for performance monitoring
    if (queryDuration > 10000) {
      logger.warn(`Slow query detected: ${queryDuration}ms for status filter: ${filters.status}`);
    }
    
    if (result.error) {
      logger.error('PropertyView query failed', { 
        error: result.error.message, 
        status: filters.status,
        code: result.error.code 
      });
      throw new DatabaseError(`PropertyView query failed: ${result.error.message}`, result.error);
    }
    data = result.data || [];
    count = result.count || 0;
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
 * Fallback query method for complex status filters
 * Fetches broader dataset and filters in memory
 */
async function queryPropertyCardsWithFallbackStatusFilter({ filters, pagination, sortBy, mapBounds, statusFilter }) {
  const db = initDB();
  let query = db.from('PropertyView').select('*', { count: 'exact' });

  // Apply all filters except status
  const otherFilters = { ...filters };
  delete otherFilters.status;
  query = applyPropertyCardFilters(query, otherFilters);

  // Apply broader status filter (just MlsStatus values, no TransactionType check)
  if (statusFilter === 'for_sale') {
    query = query.in('MlsStatus', ['For Sale', 'Sold Conditional', 'Sold Conditional Escape', 'Price Reduced', 'Price Change', 'Extension']);
  } else if (statusFilter === 'for_lease') {
    query = query.in('MlsStatus', ['For Lease', 'For Sub-Lease', 'For Lease Conditional', 'For Lease Conditional Escape', 'Price Reduced', 'Price Change', 'Extension']);
  }

  if (mapBounds) {
    query = applyMapBounds(query, mapBounds);
  }

  query = applySorting(query, sortBy);

  // Fetch more data than needed for post-processing
  const { page = 1, pageSize = 12 } = pagination;
  const fetchSize = pageSize * 3; // Fetch 3x to account for filtering
  query = query.limit(fetchSize);

  const { data, error } = await query;
  if (error) {
    throw new DatabaseError(`PropertyView query failed: ${error.message}`, error);
  }

  // Apply TransactionType filter in memory
  const filtered = applyStatusFilterPostProcess(data || [], statusFilter);

  // Apply pagination in memory
  const from = (page - 1) * pageSize;
  const to = from + pageSize;
  const paginated = filtered.slice(from, to);

  const totalPages = Math.ceil(filtered.length / pageSize);

  return {
    properties: paginated,
    totalCount: filtered.length,
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
 * Post-process results to apply TransactionType filtering for complex status cases
 */
function applyStatusFilterPostProcess(data, statusFilter) {
  if (!data || data.length === 0) return data;

  return data.filter(record => {
    const mlsStatus = record.MlsStatus;
    const transactionType = record.TransactionType;

    if (statusFilter === 'for_sale') {
      // Direct statuses
      if (['For Sale', 'Sold Conditional', 'Sold Conditional Escape'].includes(mlsStatus)) {
        return true;
      }
      // Special cases requiring TransactionType check
      if (['Price Reduced', 'Price Change', 'Extension'].includes(mlsStatus) && transactionType === 'For Sale') {
        return true;
      }
      return false;
    }

    if (statusFilter === 'for_lease') {
      // Direct statuses
      if (['For Lease', 'For Sub-Lease', 'For Lease Conditional', 'For Lease Conditional Escape'].includes(mlsStatus)) {
        return true;
      }
      // Special cases requiring TransactionType check
      if (['Price Reduced', 'Price Change', 'Extension'].includes(mlsStatus) && transactionType === 'For Lease') {
        return true;
      }
      return false;
    }

    return true; // Other statuses already filtered by query
  });
}

/**
 * Apply status filter with complex mapping rules
 * See FILTERS_API.md for detailed mapping rules
 * 
 * IMPORTANT: PropertyView.MlsStatus is transformed by status_display_logic CTE:
 * - If raw MlsStatus='New' → shows TransactionType ('For Sale' or 'For Lease')
 * - If price dropped → shows 'Price Reduced'
 * - Otherwise → shows raw MlsStatus
 * 
 * Strategy: Since PostgREST's .or() with nested .and. is unreliable,
 * we'll use a simpler approach: filter by MlsStatus first, then apply
 * TransactionType filter in memory for complex cases, OR use multiple
 * simple filters that PostgREST handles well.
 * 
 * @param {Object} query - Supabase query builder
 * @param {string} status - Status value (for_sale, for_lease, sold, leased, removed)
 * @returns {Object} - Modified query builder
 */
function applyStatusFilter(query, status) {
  switch (status) {
    case 'for_sale':
      // FOR SALE: Use PostgREST filter syntax
      // Format: or('condition1,condition2') where each condition is a filter expression
      // For values with spaces, use quotes: "For Sale"
      // For AND conditions: field1.eq.value1.and.field2.eq.value2
      return query.or(
        'MlsStatus.in.("For Sale","Sold Conditional","Sold Conditional Escape"),' +
        'MlsStatus.eq."Price Reduced".and.TransactionType.eq."For Sale",' +
        'MlsStatus.in.("Price Change","Extension").and.TransactionType.eq."For Sale"'
      );
      
    case 'for_lease':
      // FOR LEASE: Similar approach
      return query.or(
        'MlsStatus.in.("For Lease","For Sub-Lease","For Lease Conditional","For Lease Conditional Escape"),' +
        'MlsStatus.eq."Price Reduced".and.TransactionType.eq."For Lease",' +
        'MlsStatus.in.("Price Change","Extension").and.TransactionType.eq."For Lease"'
      );
      
    case 'sold':
      // SOLD: Simple equality
      return query.eq('MlsStatus', 'Sold');
      
    case 'leased':
      // LEASED: Simple equality
      return query.eq('MlsStatus', 'Leased');
      
    case 'removed':
      // REMOVED: Multiple statuses
      // Use .in() method directly - Supabase PostgREST supports this
      // Based on database: Terminated (963), Suspended (140), Expired (7)
      const removedStatuses = ['Terminated', 'Expired', 'Suspended', 'Cancelled', 'Withdrawn'];
      // Use .in() method - this creates: MlsStatus IN ('Terminated', 'Expired', 'Suspended', 'Cancelled', 'Withdrawn')
      return query.in('MlsStatus', removedStatuses);
      
    default:
      // Default to for_sale if invalid status
      return query.or(
        'MlsStatus.in.("For Sale","Sold Conditional","Sold Conditional Escape"),' +
        'MlsStatus.eq."Price Reduced".and.TransactionType.eq."For Sale",' +
        'MlsStatus.in.("Price Change","Extension").and.TransactionType.eq."For Sale"'
      );
  }
}

/**
 * Apply filter criteria to PropertyView query
 */
function applyPropertyCardFilters(query, filters) {
  // City filter (array support)
  // IMPORTANT: Multi-select must use OR logic (any of the selected cities)
  // Use .in() for arrays to create: City IN ('Brampton', 'Caledon', ...)
  if (filters.city && Array.isArray(filters.city) && filters.city.length > 0) {
    query = query.in('City', filters.city);
  } else if (filters.city) {
    query = query.eq('City', filters.city);
  }

  // Property type filter
  // IMPORTANT: Multi-select must use OR logic (any of the selected types)
  // Use .in() for arrays to create: PropertyType IN ('Type1', 'Type2', ...)
  if (filters.propertyType && Array.isArray(filters.propertyType) && filters.propertyType.length > 0) {
    query = query.in('PropertyType', filters.propertyType);
  } else if (filters.propertyType) {
    // Single value - use equality
    query = query.eq('PropertyType', filters.propertyType);
  }

  // Price range
  // NOTE: Use ListPriceRaw (numeric) instead of ListPrice (formatted string)
  // For removed status, skip price filters as removed properties may not have prices
  if (filters.minPrice && filters.status !== 'removed') {
    query = query.gte('ListPriceRaw', filters.minPrice);
  }
  if (filters.maxPrice && filters.status !== 'removed') {
    query = query.lte('ListPriceRaw', filters.maxPrice);
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

  // Status filter - complex mapping logic (see FILTERS_API.md)
  // Simple statuses use direct filters, complex ones (for_sale, for_lease) 
  // use broader filter + post-processing
  if (filters.status) {
    if (filters.status === 'for_sale' || filters.status === 'for_lease') {
      // For complex statuses, use broader MlsStatus filter
      // TransactionType filtering will be done in post-processing
      if (filters.status === 'for_sale') {
        query = query.in('MlsStatus', [
          'For Sale', 'Sold Conditional', 'Sold Conditional Escape',
          'Price Reduced', 'Price Change', 'Extension'
        ]);
      } else {
        query = query.in('MlsStatus', [
          'For Lease', 'For Sub-Lease', 'For Lease Conditional', 'For Lease Conditional Escape',
          'Price Reduced', 'Price Change', 'Extension'
        ]);
      }
    } else if (filters.status === 'removed') {
      // REMOVED: Apply .in() directly (same pattern as for_sale/for_lease above)
      const removedStatuses = ['Terminated', 'Expired', 'Suspended', 'Cancelled', 'Withdrawn'];
      // Apply .in() method directly (same pattern as for_sale/for_lease)
      query = query.in('MlsStatus', removedStatuses);
    } else {
      // Simple statuses: sold, leased (use applyStatusFilter)
      query = applyStatusFilter(query, filters.status);
    }
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

  // Date filter - apply based on status-specific column
  // Uses centralized statusTimestampMapper for consistent timestamp column mapping
  if (filters.dateFrom && filters.status) {
    const dateColumn = getTimestampColumnForStatus(filters.status);
    
    if (dateColumn === 'COALESCE_REMOVED') {
      // For removed status, use OR filter with multiple date columns
      // This approximates COALESCE behavior: match if any removal date is >= dateFrom
      const removedFilter = buildRemovedDateFilter(filters.dateFrom);
      query = query.or(removedFilter);
    } else if (dateColumn) {
      // For other statuses, use simple gte filter on the date column
      // Note: dateFrom is in YYYY-MM-DD format
      // For timestamptz (OriginalEntryTimestampRaw), PostgREST will handle date string conversion
      //   - It will convert YYYY-MM-DD to YYYY-MM-DD 00:00:00+00 for comparison
      // For date type (PurchaseContractDate), PostgREST will handle direct comparison
      query = query.gte(dateColumn, filters.dateFrom);
    }
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
      // Use raw timestamp field for proper chronological sorting (newest listings first)
      return query.order('ModificationTimestamp', { ascending: false });
    case 'oldest':
      // Use raw timestamp field for proper chronological sorting (oldest listings first)
      return query.order('ModificationTimestamp', { ascending: true });
    case 'price_asc':
      // Use raw numeric field for proper numeric sorting (lowest price first)
      return query.order('ListPriceRaw', { ascending: true });
    case 'price_desc':
      // Use raw numeric field for proper numeric sorting (highest price first)
      return query.order('ListPriceRaw', { ascending: false });
    case 'beds_desc':
      // Sort by bedrooms descending (most bedrooms first)
      return query.order('BedroomsAboveGrade', { ascending: false });
    case 'sqft_asc':
      // Sort by square footage ascending (smallest first)
      return query.order('LivingAreaMin', { ascending: true });
    case 'sqft_desc':
      // Sort by square footage descending (largest first)
      return query.order('LivingAreaMax', { ascending: false });
    default:
      // Use raw timestamp field for proper chronological sorting (newest listings first)
      return query.order('ModificationTimestamp', { ascending: false });
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

  // City filter (array support)
  if (filters.city && Array.isArray(filters.city) && filters.city.length > 0) {
    query = query.in('City', filters.city);
  } else if (filters.city) {
    query = query.eq('City', filters.city);
  }

  // Apply basic filters (status, price range)
  if (filters.status) {
    query = applyStatusFilter(query, filters.status);
  }
  
  // Date filter - apply based on status-specific column
  // Uses centralized statusTimestampMapper for consistent timestamp column mapping
  if (filters.dateFrom && filters.status) {
    const dateColumn = getTimestampColumnForStatus(filters.status);
    
    if (dateColumn === 'COALESCE_REMOVED') {
      // For removed status, use OR filter with multiple date columns
      // This approximates COALESCE behavior: match if any removal date is >= dateFrom
      const removedFilter = buildRemovedDateFilter(filters.dateFrom);
      query = query.or(removedFilter);
    } else if (dateColumn) {
      // For other statuses, use simple gte filter on the date column
      query = query.gte(dateColumn, filters.dateFrom);
    }
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

