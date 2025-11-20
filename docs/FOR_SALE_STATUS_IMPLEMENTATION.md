# For Sale Status Group - Backend Implementation

## Overview

This document describes the backend implementation for the "For Sale" status group, focusing on date filtering and timestamp handling.

## Date Filtering Logic

### Date Column Selection

The `getDateColumnForStatus()` function in `services/propertyQueries.js` determines which date column to use for filtering based on status:

```javascript
function getDateColumnForStatus(status) {
  switch (status) {
    case 'for_sale':
    case 'for_lease':
      // Use OriginalEntryTimestampRaw (raw timestamptz) for filtering
      return 'OriginalEntryTimestampRaw';
    case 'sold':
    case 'leased':
      return 'PurchaseContractDate';
    case 'removed':
      return 'COALESCE_REMOVED'; // Special handling for multiple date columns
    default:
      return null;
  }
}
```

**Key Point**: For `for_sale` status, date filtering uses `OriginalEntryTimestampRaw` (the raw timestamp field), not the formatted display column.

### Date Filter Application

Date filtering is applied in `applyPropertyCardFilters()` function:

```javascript
// Date filter - apply based on status-specific column
if (filters.dateFrom && filters.status) {
  const dateColumn = getDateColumnForStatus(filters.status);
  
  if (dateColumn === 'COALESCE_REMOVED') {
    // Special handling for removed status
    query = query.or(
      `SuspendedDate.gte.${filters.dateFrom},` +
      `TerminatedDate.gte.${filters.dateFrom},` +
      // ... other date columns
    );
  } else if (dateColumn) {
    // For for_sale, uses OriginalEntryTimestampRaw
    query = query.gte(dateColumn, filters.dateFrom);
  }
}
```

**Date Format**: The `dateFrom` parameter is in `YYYY-MM-DD` format. PostgREST automatically converts this to `YYYY-MM-DD 00:00:00+00` for timestamptz comparison.

## API Response Structure

### Timestamp Fields in Response

The `mapToPropertyCardResponse()` function in `routes/properties.js` maps database fields to API response:

```javascript
{
  // ... other fields ...
  
  // Status and listing info
  status: record.MlsStatus,
  mlsStatus: record.MlsStatus,
  transactionType: record.TransactionType,
  isNewListing: record.isNewListing || false,
  listingAge: record.ListingAge, // Calculated by database view
  
  // Timestamp fields
  listedAt: record.OriginalEntryTimestamp, // Formatted: "10th Jun, 2025"
  originalEntryTimestamp: record.OriginalEntryTimestamp, // Formatted: "10th Jun, 2025"
  originalEntryTimestampRaw: record.OriginalEntryTimestampRaw, // Raw timestamp for filtering
  
  modificationTimestamp: record.ModificationTimestamp,
}
```

### Field Descriptions

1. **`originalEntryTimestamp`** (formatted)
   - **Source**: `PropertyView.OriginalEntryTimestamp`
   - **Format**: "10th Jun, 2025" (formatted in EST timezone)
   - **Purpose**: Display on Property Card as "Listed – <OriginalEntryTimestamp>"
   - **Database**: Calculated by `format_timestamp_display_est()` helper function

2. **`originalEntryTimestampRaw`** (raw)
   - **Source**: `PropertyView.OriginalEntryTimestampRaw`
   - **Format**: Raw PostgreSQL `timestamptz`
   - **Purpose**: Used for date filtering and sorting
   - **Database**: Direct mapping from `Property.OriginalEntryTimestamp`

3. **`listingAge`** (calculated)
   - **Source**: `PropertyView.ListingAge`
   - **Format**: Dynamic string like "Listed 5 days ago" or "Sold 10 days ago"
   - **Purpose**: Currently included but should NOT be displayed for For Sale properties
   - **Database**: Calculated by `calculate_listing_age()` helper function
   - **Note**: For For Sale properties, frontend should ignore this field and use `originalEntryTimestamp` instead

## Database View Fields

### PropertyView Schema

The `PropertyView` materialized view includes:

```sql
-- Formatted timestamp for display
public.format_timestamp_display_est(p."OriginalEntryTimestamp") AS "OriginalEntryTimestamp",

-- Raw timestamp for filtering/sorting
p."OriginalEntryTimestamp" AS "OriginalEntryTimestampRaw",

-- Calculated listing age (should not be used for For Sale)
public.calculate_listing_age(
  p."MlsStatus",
  p."OriginalEntryTimestamp",
  p."PurchaseContractDate",
  p."TerminatedDate",
  p."SuspendedDate",
  p."ExpirationDate"
) AS "ListingAge",
```

## Date Filtering Flow

### Request Flow

1. **Frontend Request**: 
   - User selects "For Sale" status
   - User selects date filter (Today, 7 Days, 14 Days, 30 Days, 90 Days, Custom)
   - Frontend converts to `dateFrom` parameter: `YYYY-MM-DD` format

2. **Backend Processing**:
   - `validateStatus()` ensures status is `for_sale`
   - `getDateColumnForStatus('for_sale')` returns `'OriginalEntryTimestampRaw'`
   - `applyPropertyCardFilters()` applies: `query.gte('OriginalEntryTimestampRaw', filters.dateFrom)`

3. **Database Query**:
   - PostgREST converts `YYYY-MM-DD` to `YYYY-MM-DD 00:00:00+00`
   - Filters properties where `OriginalEntryTimestampRaw >= dateFrom`
   - Returns matching properties with all fields including timestamps

### Response Flow

1. **Database Returns**: All fields from `PropertyView` including:
   - `OriginalEntryTimestamp` (formatted)
   - `OriginalEntryTimestampRaw` (raw)
   - `ListingAge` (calculated)

2. **Backend Mapping**: `mapToPropertyCardResponse()` maps to API response:
   - `originalEntryTimestamp`: Formatted timestamp for display
   - `originalEntryTimestampRaw`: Raw timestamp (available for frontend use)
   - `listingAge`: Calculated age (should be ignored for For Sale)

3. **Frontend Display**: (Not implemented yet)
   - Should display: "Listed – <originalEntryTimestamp>"
   - Should NOT display: `<listingAge>`

## Status Filter Logic

### For Sale Status Filtering

The `applyStatusFilter()` function handles For Sale status:

```javascript
case 'for_sale':
  return query.or(
    'MlsStatus.in.("For Sale","Sold Conditional","Sold Conditional Escape"),' +
    'MlsStatus.eq."Price Reduced".and.TransactionType.eq."For Sale",' +
    'MlsStatus.in.("Price Change","Extension").and.TransactionType.eq."For Sale"'
  );
```

This matches properties with:
- Direct statuses: "For Sale", "Sold Conditional", "Sold Conditional Escape"
- Special cases: "Price Reduced" with TransactionType="For Sale"
- Special cases: "Price Change" or "Extension" with TransactionType="For Sale"

## Summary

### Backend Implementation Status

✅ **Date Filtering**: Uses `OriginalEntryTimestampRaw` for `for_sale` status  
✅ **Response Fields**: Includes both `originalEntryTimestamp` (formatted) and `originalEntryTimestampRaw` (raw)  
✅ **Query Selection**: All fields from `PropertyView` are selected (`.select('*')`)  
✅ **Mapping**: Response mapping includes all required timestamp fields  

### Frontend Requirements (Not Yet Implemented)

- Display "Listed – <originalEntryTimestamp>" instead of `<listingAge>`
- Use `originalEntryTimestamp` for display (formatted timestamp)
- Use `originalEntryTimestampRaw` if needed for client-side filtering/sorting
- Do NOT display `listingAge` for For Sale properties
- Badge should show "For Sale"

### Database Fields Available

- `OriginalEntryTimestamp`: Formatted timestamp ("10th Jun, 2025")
- `OriginalEntryTimestampRaw`: Raw timestamp (for filtering/sorting)
- `ListingAge`: Calculated age string (should be ignored for For Sale)

## Testing

To verify the implementation:

1. **Date Filtering Test**:
   ```bash
   GET /api/properties?status=for_sale&dateFrom=2025-01-01
   ```
   Should filter properties where `OriginalEntryTimestampRaw >= 2025-01-01 00:00:00+00`

2. **Response Structure Test**:
   ```bash
   GET /api/properties?status=for_sale&pageSize=1
   ```
   Response should include:
   - `originalEntryTimestamp`: Formatted string
   - `originalEntryTimestampRaw`: ISO timestamp string
   - `listingAge`: Calculated string (to be ignored by frontend)

3. **Verify Timestamp Format**:
   - `originalEntryTimestamp` should be formatted like "10th Jun, 2025"
   - `originalEntryTimestampRaw` should be ISO format like "2025-06-10T12:34:56.789Z"

