/**
 * Status Timestamp Mapper
 * 
 * Centralized helper for mapping status groups to their correct timestamp columns.
 * This is the single source of truth for status→timestamp mapping across the entire API.
 * 
 * Based on StatusFilters.md reset plan:
 * - For Sale/For Lease → OriginalEntryTimestamp
 * - Sold/Leased → PurchaseContractDate
 * - Removed → COALESCE(SuspendedDate, TerminatedDate, ExpirationDate, WithdrawnDate, UnavailableDate)
 * 
 * @module utils/statusTimestampMapper
 */

/**
 * Get the timestamp column name to use for filtering based on status group
 * 
 * For filtering, we use the raw timestamp columns (OriginalEntryTimestampRaw for timestamptz,
 * or the date columns directly for date types).
 * 
 * @param {string} statusGroup - Status group value ('for-sale', 'for-lease', 'sold', 'leased', 'removed')
 * @returns {string|null} Column name for filtering, or null if status group is invalid
 * 
 * @example
 * getTimestampColumnForStatus('for-sale') // Returns 'OriginalEntryTimestampRaw'
 * getTimestampColumnForStatus('sold') // Returns 'PurchaseContractDate'
 * getTimestampColumnForStatus('removed') // Returns 'COALESCE_REMOVED' (special marker)
 */
function getTimestampColumnForStatus(statusGroup) {
  // Normalize status group (handle both 'for-sale' and 'for_sale' formats)
  const normalized = statusGroup?.toLowerCase().replace(/_/g, '-');
  
  switch (normalized) {
    case 'for-sale':
    case 'for-lease':
      // Use OriginalEntryTimestampRaw (raw timestamptz) for filtering
      // This allows proper date comparison in PostgREST queries
      return 'OriginalEntryTimestampRaw';
      
    case 'sold':
    case 'leased':
      // Use PurchaseContractDate (date type) for filtering
      return 'PurchaseContractDate';
      
    case 'removed':
      // For removed status, we need to use COALESCE with multiple columns
      // PostgREST doesn't support COALESCE in WHERE clauses directly,
      // so we return a special marker that the query builder will handle
      return 'COALESCE_REMOVED';
      
    default:
      return null;
  }
}

/**
 * Get the formatted timestamp column name for display purposes
 * 
 * This returns the formatted/display version of the timestamp column,
 * which is used in API responses for frontend display.
 * 
 * @param {string} statusGroup - Status group value
 * @returns {string|null} Formatted column name for display, or null if invalid
 * 
 * @example
 * getFormattedTimestampColumnForStatus('for-sale') // Returns 'OriginalEntryTimestamp'
 * getFormattedTimestampColumnForStatus('sold') // Returns 'PurchaseContractDate'
 */
function getFormattedTimestampColumnForStatus(statusGroup) {
  const normalized = statusGroup?.toLowerCase().replace(/_/g, '-');
  
  switch (normalized) {
    case 'for-sale':
    case 'for-lease':
      // Formatted timestamp string: "10th Jun, 2025"
      return 'OriginalEntryTimestamp';
      
    case 'sold':
    case 'leased':
      // Formatted date string: "10th Jun, 2025"
      return 'PurchaseContractDate';
      
    case 'removed':
      // For removed, we need to compute COALESCE in the query or return all columns
      // The frontend will handle selecting the appropriate one
      // For now, return null to indicate special handling needed
      return null;
      
    default:
      return null;
  }
}

/**
 * Get all removed date columns for COALESCE logic
 * 
 * Returns the list of date columns that should be used in COALESCE
 * for removed status filtering and display.
 * 
 * @returns {string[]} Array of column names in COALESCE order
 */
function getRemovedDateColumns() {
  return [
    'SuspendedDate',
    'TerminatedDate',
    'ExpirationDate',
    'WithdrawnDate',
    'UnavailableDate'
  ];
}

/**
 * Build PostgREST filter expression for removed status date filtering
 * 
 * Since PostgREST doesn't support COALESCE in WHERE clauses directly,
 * we use OR logic to approximate COALESCE behavior:
 * Match if any of the removal date columns is >= filterDate and not null
 * 
 * @param {string} filterDate - Date string in YYYY-MM-DD format
 * @returns {string} PostgREST OR filter expression
 * 
 * @example
 * buildRemovedDateFilter('2025-01-01')
 * // Returns: 'SuspendedDate.gte.2025-01-01,TerminatedDate.gte.2025-01-01,...'
 */
function buildRemovedDateFilter(filterDate) {
  const columns = getRemovedDateColumns();
  return columns.map(col => `${col}.gte.${filterDate}`).join(',');
}

export {
  getTimestampColumnForStatus,
  getFormattedTimestampColumnForStatus,
  getRemovedDateColumns,
  buildRemovedDateFilter
};

