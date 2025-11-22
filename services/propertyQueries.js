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
        'MlsStatus.in.("For Sale","Sold Conditional","Sold Conditional Escape"),MlsStatus.eq."Price Reduced".and.TransactionType.eq."For Sale",MlsStatus.in.("Price Change","Extension").and.TransactionType.eq."For Sale"'
      );
      
    case 'for_lease':
      // FOR LEASE: Similar approach
      return query.or(
        'MlsStatus.in.("For Lease","For Sub-Lease","For Lease Conditional","For Lease Conditional Escape"),MlsStatus.eq."Price Reduced".and.TransactionType.eq."For Lease",MlsStatus.in.("Price Change","Extension").and.TransactionType.eq."For Lease"'
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
        'MlsStatus.in.("For Sale","Sold Conditional","Sold Conditional Escape"),MlsStatus.eq."Price Reduced".and.TransactionType.eq."For Sale",MlsStatus.in.("Price Change","Extension").and.TransactionType.eq."For Sale"'
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

  // Property class filter
  // IMPORTANT: Multi-select must use OR logic (any of the selected classes)
  // Use .in() for arrays to create: PropertyClass IN ('Residential Freehold', 'Residential Condo & Other', ...)
  // Note: Frontend sends mapped values: 'Freehold only' → 'Residential Freehold', 'Condo only' → 'Residential Condo & Other'
  // This filter is EXCLUSIVE: selecting 'Residential Freehold' will EXCLUDE 'Residential Condo & Other' and vice versa
  logger.debug('PropertyClass filter check', { 
    hasPropertyClass: !!filters.propertyClass,
    isArray: Array.isArray(filters.propertyClass),
    value: filters.propertyClass,
    type: typeof filters.propertyClass
  });
  
  if (filters.propertyClass && Array.isArray(filters.propertyClass) && filters.propertyClass.length > 0) {
    // Filter to only show properties matching the selected property class(es)
    // This excludes all other property classes
    query = query.in('PropertyClass', filters.propertyClass);
    logger.debug('PropertyClass filter applied (IN)', { 
      propertyClasses: filters.propertyClass,
      filterType: 'IN',
      willExclude: 'All property classes not in the array'
    });
  } else if (filters.propertyClass) {
    // Single value - use equality (shouldn't happen with parseMultiValueParam, but handle it)
    query = query.eq('PropertyClass', filters.propertyClass);
    logger.debug('PropertyClass filter applied (EQ)', { 
      propertyClass: filters.propertyClass,
      filterType: 'EQ'
    });
  } else {
    logger.debug('PropertyClass filter NOT applied - no propertyClass in filters');
  }

  // Architectural style (house style) filter
  // IMPORTANT: Multi-select must use OR logic (any of the selected styles)
  // Frontend sends raw database values (mapped from display names)
  if (filters.architecturalStyle && Array.isArray(filters.architecturalStyle) && filters.architecturalStyle.length > 0) {
    query = query.in('ArchitecturalStyle', filters.architecturalStyle);
    logger.debug('ArchitecturalStyle filter applied', { 
      styles: filters.architecturalStyle,
      count: filters.architecturalStyle.length
    });
  } else if (filters.architecturalStyle) {
    // Single value - use equality
    query = query.eq('ArchitecturalStyle', filters.architecturalStyle);
    logger.debug('ArchitecturalStyle filter applied (single)', { 
      style: filters.architecturalStyle
    });
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

  // Lot frontage (LotWidth)
  // Frontend sends strings like "0-30 ft", "31-50 ft", "120+ ft", etc.
  if (filters.lotFrontage) {
    logger.debug('Lot frontage filter received', { 
      lotFrontage: filters.lotFrontage,
      type: typeof filters.lotFrontage
    });
    
    // Remove "ft" suffix and trim whitespace
    const cleaned = filters.lotFrontage.replace(/\s*ft\s*$/i, '').trim();
    
    // Check for range format: "0-30" or "31-50" or "81-120"
    const rangeMatch = cleaned.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const minFrontage = parseInt(rangeMatch[1], 10);
      const maxFrontage = parseInt(rangeMatch[2], 10);
      // Explicitly exclude nulls and apply range filters
      query = query.not('LotWidth', 'is', null)
                    .gte('LotWidth', minFrontage)
                    .lte('LotWidth', maxFrontage);
      logger.debug('Lot frontage filter applied (range)', { 
        lotFrontage: filters.lotFrontage,
        cleaned,
        minFrontage,
        maxFrontage,
        filter: `LotWidth IS NOT NULL AND LotWidth >= ${minFrontage} AND LotWidth <= ${maxFrontage}`
      });
    } 
    // Check for "plus" format: "120+" or "200+"
    else if (cleaned.endsWith('+')) {
      const minFrontage = parseInt(cleaned.replace('+', ''), 10);
      if (!isNaN(minFrontage)) {
        query = query.not('LotWidth', 'is', null)
                      .gte('LotWidth', minFrontage);
        logger.debug('Lot frontage filter applied (plus)', { 
          lotFrontage: filters.lotFrontage,
          cleaned,
          minFrontage,
          filter: `LotWidth IS NOT NULL AND LotWidth >= ${minFrontage}`
        });
      }
    }
    // Single number format: "25"
    else {
      const numValue = parseInt(cleaned, 10);
      if (!isNaN(numValue)) {
        query = query.not('LotWidth', 'is', null)
                      .gte('LotWidth', numValue);
        logger.debug('Lot frontage filter applied (single)', { 
          lotFrontage: filters.lotFrontage,
          cleaned,
          numValue,
          filter: `LotWidth IS NOT NULL AND LotWidth >= ${numValue}`
        });
      } else {
        logger.warn('Lot frontage filter could not parse value', { 
          lotFrontage: filters.lotFrontage,
          cleaned
        });
      }
    }
  }

  // Lot depth (LotDepth)
  // Frontend sends strings like "0-75 ft", "76-100 ft", "200+ ft", etc.
  if (filters.lotDepth) {
    logger.debug('Lot depth filter received', { 
      lotDepth: filters.lotDepth,
      type: typeof filters.lotDepth
    });
    
    // Remove "ft" suffix and trim whitespace
    const cleaned = filters.lotDepth.replace(/\s*ft\s*$/i, '').trim();
    
    // Check for range format: "0-75" or "76-100"
    const rangeMatch = cleaned.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const minDepth = parseInt(rangeMatch[1], 10);
      const maxDepth = parseInt(rangeMatch[2], 10);
      // Explicitly exclude nulls and apply range filters
      query = query.not('LotDepth', 'is', null)
                    .gte('LotDepth', minDepth)
                    .lte('LotDepth', maxDepth);
      logger.debug('Lot depth filter applied (range)', { 
        lotDepth: filters.lotDepth,
        cleaned,
        minDepth,
        maxDepth,
        filter: `LotDepth IS NOT NULL AND LotDepth >= ${minDepth} AND LotDepth <= ${maxDepth}`
      });
    } 
    // Check for "plus" format: "200+"
    else if (cleaned.endsWith('+')) {
      const minDepth = parseInt(cleaned.replace('+', ''), 10);
      if (!isNaN(minDepth)) {
        query = query.not('LotDepth', 'is', null)
                      .gte('LotDepth', minDepth);
        logger.debug('Lot depth filter applied (plus)', { 
          lotDepth: filters.lotDepth,
          cleaned,
          minDepth,
          filter: `LotDepth IS NOT NULL AND LotDepth >= ${minDepth}`
        });
      }
    }
    // Single number format: "100"
    else {
      const numValue = parseInt(cleaned, 10);
      if (!isNaN(numValue)) {
        query = query.not('LotDepth', 'is', null)
                      .gte('LotDepth', numValue);
        logger.debug('Lot depth filter applied (single)', { 
          lotDepth: filters.lotDepth,
          cleaned,
          numValue,
          filter: `LotDepth IS NOT NULL AND LotDepth >= ${numValue}`
        });
      } else {
        logger.warn('Lot depth filter could not parse value', { 
          lotDepth: filters.lotDepth,
          cleaned
        });
      }
    }
  }

  // Maintenance fee (AssociationFee or AdditionalMonthlyFee)
  // Filter on AssociationFee primarily (most common field)
  // Note: For exact COALESCE behavior (use AssociationFee if available, else AdditionalMonthlyFee),
  // we would need a database view or computed column. For now, filter on AssociationFee.
  // If AdditionalMonthlyFee filtering is needed, it can be added as a separate filter.
  if (filters.minMaintenanceFee !== undefined) {
    query = query.gte('AssociationFee', filters.minMaintenanceFee);
  }
  if (filters.maxMaintenanceFee !== undefined) {
    query = query.lte('AssociationFee', filters.maxMaintenanceFee);
  }

  // Property tax (TaxAnnualAmount)
  // Explicitly exclude nulls when filtering (similar to lot depth/frontage)
  if (filters.minPropertyTax !== undefined || filters.maxPropertyTax !== undefined) {
    // Ensure values are numbers (parseNumber already returns numbers, but double-check)
    const minTax = filters.minPropertyTax !== undefined && filters.minPropertyTax !== null 
      ? parseFloat(filters.minPropertyTax) 
      : undefined;
    const maxTax = filters.maxPropertyTax !== undefined && filters.maxPropertyTax !== null 
      ? parseFloat(filters.maxPropertyTax) 
      : undefined;
    
    logger.info('Property tax filter received', {
      minPropertyTax: filters.minPropertyTax,
      maxPropertyTax: filters.maxPropertyTax,
      minTax,
      maxTax,
      minTaxType: typeof minTax,
      maxTaxType: typeof maxTax,
      minTaxIsNaN: isNaN(minTax),
      maxTaxIsNaN: isNaN(maxTax),
    });
    
    // Exclude nulls - use same pattern as lot filters (this syntax works for other filters)
    query = query.not('TaxAnnualAmount', 'is', null);
    
    if (minTax !== undefined && !isNaN(minTax) && isFinite(minTax)) {
      query = query.gte('TaxAnnualAmount', minTax);
      logger.info('Property tax filter applied (min)', {
        minPropertyTax: filters.minPropertyTax,
        minTax,
        type: typeof minTax,
        filter: `TaxAnnualAmount IS NOT NULL AND TaxAnnualAmount >= ${minTax}`
      });
    }
    if (maxTax !== undefined && !isNaN(maxTax) && isFinite(maxTax)) {
      query = query.lte('TaxAnnualAmount', maxTax);
      logger.info('Property tax filter applied (max)', {
        maxPropertyTax: filters.maxPropertyTax,
        maxTax,
        type: typeof maxTax,
        filter: `TaxAnnualAmount IS NOT NULL AND TaxAnnualAmount <= ${maxTax}`
      });
    }
  }

  // Days on market (DaysOnMarket)
  if (filters.minDaysOnMarket !== undefined) {
    query = query.gte('DaysOnMarket', filters.minDaysOnMarket);
  }
  if (filters.maxDaysOnMarket !== undefined) {
    query = query.lte('DaysOnMarket', filters.maxDaysOnMarket);
  }

  // Basement features (multi-select array)
  // Maps frontend display values to database fields:
  // "Apartment" -> BasementStatus contains apartment-related values
  // "Finished" -> BasementStatus = 'Finished'
  // "Walk-Out" -> BasementEntrance contains walk-out related values
  // "Separate Entrance" -> BasementEntrance = 'Separate Entrance'
  // "Kitchen: Yes" -> BasementKitchen = true
  // "Kitchen: No" -> BasementKitchen = false
  // "None" -> BasementStatus = 'None' or null
  if (filters.basementFeatures && Array.isArray(filters.basementFeatures) && filters.basementFeatures.length > 0) {
    const basementConditions = [];
    
    filters.basementFeatures.forEach((feature) => {
      switch (feature) {
        case 'Finished':
          basementConditions.push('BasementStatus.eq.Finished');
          break;
        case 'Walk-Out':
          basementConditions.push('BasementEntrance.ilike.%Walk-Out%');
          break;
        case 'Separate Entrance':
          basementConditions.push('BasementEntrance.eq.Separate Entrance');
          break;
        case 'Kitchen: Yes':
          basementConditions.push('BasementKitchen.eq.true');
          break;
        case 'Kitchen: No':
          basementConditions.push('BasementKitchen.eq.false');
          break;
        case 'None':
          basementConditions.push('BasementStatus.eq.None');
          break;
        case 'Apartment':
          // Apartment typically means finished basement with separate entrance
          basementConditions.push('BasementStatus.ilike.%Apartment%');
          break;
      }
    });
    
    if (basementConditions.length > 0) {
      // Use OR logic: any of the selected features should match
      query = query.or(basementConditions.join(','));
    }
  }

  // Property age (PropertyAge)
  // Frontend sends string like "New", "0-5", "6-10", etc.
  // PropertyAge column contains normalized exact values, so use exact matching
  if (filters.propertyAge && filters.propertyAge !== null && filters.propertyAge !== '') {
    logger.debug('Property age filter applied', { 
      propertyAge: filters.propertyAge,
      type: typeof filters.propertyAge,
      filtersObject: JSON.stringify(filters)
    });
    query = query.eq('PropertyAge', filters.propertyAge);
  }

  // Swimming pool (PoolFeatures)
  // PoolFeatures is stored as text/array - check if it exists and is not empty/null
  if (filters.hasSwimmingPool === true) {
    // Property has a pool - PoolFeatures should not be null/empty
    query = query.not('PoolFeatures', 'is', null);
  } else if (filters.hasSwimmingPool === false) {
    // Property does not have a pool - filter for null or empty PoolFeatures
    // Note: Supabase doesn't easily support "is null OR equals empty" in one query
    // For now, filter for null (most common case for no pool)
    query = query.is('PoolFeatures', null);
  }

  // Waterfront (WaterfrontYN)
  // WaterfrontYN is typically 'Y' for yes, null or other values for no
  if (filters.waterfront === true) {
    query = query.eq('WaterfrontYN', 'Y');
  } else if (filters.waterfront === false) {
    // Not waterfront - WaterfrontYN is not 'Y' (could be null, 'N', or empty)
    query = query.neq('WaterfrontYN', 'Y');
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
 * Search for property suggestions (autocomplete) using fuzzy search
 * Uses PostgreSQL trigram similarity for fuzzy matching on addresses, cities, and MLS numbers
 * @param {string} searchTerm
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function queryPropertySuggestions(searchTerm, limit = 10) {
  const db = initDB();
  
  if (!searchTerm || searchTerm.trim().length === 0) {
    return [];
  }

  const trimmedTerm = searchTerm.trim();
  
  try {
    // Use PostgreSQL function for fuzzy search with trigram similarity
    // This provides better fuzzy matching than simple ILIKE queries
    const { data, error } = await db.rpc('search_property_suggestions', {
      search_term: trimmedTerm,
      result_limit: limit
    });

    if (error) {
      // Fallback to ILIKE if RPC function doesn't exist (for backward compatibility)
      logger.warn('Fuzzy search RPC function not available, falling back to ILIKE', {
        error: error.message,
        searchTerm: trimmedTerm
      });
      
      return await queryPropertySuggestionsFallback(trimmedTerm, limit);
    }

    // Remove similarity_score from results (it's only for sorting)
    const results = (data || []).map(({ similarity_score, ...rest }) => rest);
    
    logger.debug('Fuzzy search completed', {
      searchTerm: trimmedTerm,
      resultCount: results.length,
      usedFuzzySearch: true
    });

    return results;
  } catch (error) {
    // Fallback to ILIKE if RPC call fails
    logger.warn('Fuzzy search failed, falling back to ILIKE', {
      error: error.message,
      searchTerm: trimmedTerm
    });
    
    return await queryPropertySuggestionsFallback(trimmedTerm, limit);
  }
}

/**
 * Fallback search using ILIKE (substring matching)
 * Used when fuzzy search function is not available
 * @param {string} searchTerm
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function queryPropertySuggestionsFallback(searchTerm, limit = 10) {
  const db = initDB();
  const term = `%${searchTerm.toLowerCase()}%`;
  
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

  logger.debug('ILIKE fallback search completed', {
    searchTerm,
    resultCount: uniqueResults.length,
    usedFuzzySearch: false
  });

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

