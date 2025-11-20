# Status Filters API Documentation

**Version:** 2.0  
**Last Updated:** Status Filters Reset Implementation  
**Status:** ✅ Active

---

## Overview

The Status Filters API provides consistent, status-based timestamp filtering and display across all property endpoints. This implementation replaces the deprecated `ListingAge` calculation system with a centralized status→timestamp mapping.

---

## Core Principles

### 1. Status Determines Timestamp Column

Each status group uses a specific timestamp column for filtering and display:

| Status Group | Timestamp Column | Display Format |
|-------------|------------------|----------------|
| **For Sale** | `OriginalEntryTimestampRaw` | "Listed – <date>" |
| **For Lease** | `OriginalEntryTimestampRaw` | "Listed – <date>" |
| **Sold** | `PurchaseContractDate` | "Sold – <date>" |
| **Leased** | `PurchaseContractDate` | "Leased – <date>" |
| **Removed** | COALESCE(SuspendedDate, TerminatedDate, ExpirationDate, WithdrawnDate, UnavailableDate) | "<Status> – <date>" |

### 2. Centralized Mapping

All timestamp column mapping is handled by `utils/statusTimestampMapper.js`:
- `getTimestampColumnForStatus(statusGroup)` - Returns column name for filtering
- `buildRemovedDateFilter(filterDate)` - Builds OR filter for removed status

### 3. Raw Timestamps in API Responses

All API responses include:
- **Formatted timestamps**: For display (e.g., "10th Jun, 2025")
- **Raw timestamps**: For filtering/comparison (ISO format or date)

---

## API Endpoints

### GET `/api/properties`

Returns paginated list of properties with filters.

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Status group: `for-sale`, `for-lease`, `sold`, `leased`, `removed` |
| `dateFrom` | string | ISO date (YYYY-MM-DD) - filters by status-specific timestamp column |
| `city` | string[] | City filter (multi-select) |
| `minPrice` | number | Minimum price filter |
| `maxPrice` | number | Maximum price filter |
| ... | ... | Other standard filters |

#### Date Filtering

The `dateFrom` parameter filters properties based on the status-specific timestamp column:

- **For Sale/For Lease**: Filters by `OriginalEntryTimestampRaw >= dateFrom`
- **Sold/Leased**: Filters by `PurchaseContractDate >= dateFrom`
- **Removed**: Filters using OR logic: `(SuspendedDate >= dateFrom OR TerminatedDate >= dateFrom OR ...)`

#### Response Fields

```typescript
{
  properties: [{
    // ... standard property fields ...
    originalEntryTimestamp: string;        // Formatted: "10th Jun, 2025"
    originalEntryTimestampRaw?: string;   // Raw timestamp for filtering
    statusDates: {
      purchaseContractDate?: string;      // For Sold/Leased
      suspendedDate?: string;             // For Removed
      terminatedDate?: string;            // For Removed
      expirationDate?: string;            // For Removed
      withdrawnDate?: string;             // For Removed
      unavailableDate?: string;           // For Removed
    };
    listingAge?: string;                  // ⚠️ DEPRECATED - Use originalEntryTimestamp with prefix
    mlsStatus: string;                    // Current MLS status
    // ...
  }]
}
```

---

### GET `/api/properties/:listingKey`

Returns full property details.

#### Response Fields

Same timestamp fields as `/api/properties`, plus additional details.

---

### GET `/api/properties/map`

Returns properties for map display with bounds filtering.

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Status group filter |
| `dateFrom` | string | ISO date (YYYY-MM-DD) |
| `bounds` | JSON string | Map bounds `{northEast: {lat, lng}, southWest: {lat, lng}}` |

#### Date Filtering

Uses same status-specific timestamp column mapping as `/api/properties`.

---

### GET `/api/search`

Returns property suggestions for autocomplete.

#### Response Fields

```typescript
{
  listings: [{
    // ... suggestion fields ...
    originalEntryTimestamp?: string;      // Formatted timestamp
    originalEntryTimestampRaw?: string;    // Raw timestamp
    statusDates?: StatusDates;            // Status-specific dates
    listingAge?: string;                   // ⚠️ DEPRECATED
    // ...
  }]
}
```

---

## Date Filter Options

The frontend sends `dateFrom` parameter based on user selection:

| Option | `dateFrom` Value | Description |
|--------|------------------|-------------|
| All Time | `null` | No date filter applied |
| Today | `YYYY-MM-DD` (today) | Properties from today |
| Last 7 Days | `YYYY-MM-DD` (7 days ago) | Properties from last 7 days |
| Last 14 Days | `YYYY-MM-DD` (14 days ago) | Properties from last 14 days |
| Last 30 Days | `YYYY-MM-DD` (30 days ago) | Properties from last 30 days |
| Last 90 Days | `YYYY-MM-DD` (90 days ago) | Properties from last 90 days |
| Custom Date Range | `YYYY-MM-DD` (custom) | Properties from custom date |

---

## Status Groups

### For Sale (`for-sale`)

**Includes:**
- "For Sale"
- "Sold Conditional"
- "Sold Conditional Escape"
- "Price Reduced" (with TransactionType = "For Sale")
- "Price Change" (with TransactionType = "For Sale")
- "Extension" (with TransactionType = "For Sale")

**Timestamp:** `OriginalEntryTimestampRaw`  
**Display:** "Listed – <originalEntryTimestamp>"

---

### For Lease (`for-lease`)

**Includes:**
- "For Lease"
- "For Sub-Lease"
- "For Lease Conditional"
- "For Lease Conditional Escape"
- "Price Reduced" (with TransactionType = "For Lease")
- "Price Change" (with TransactionType = "For Lease")
- "Extension" (with TransactionType = "For Lease")

**Timestamp:** `OriginalEntryTimestampRaw`  
**Display:** "Listed – <originalEntryTimestamp>"

---

### Sold (`sold`)

**Includes:**
- "Sold"

**Timestamp:** `PurchaseContractDate`  
**Display:** "Sold – <purchaseContractDate>"

---

### Leased (`leased`)

**Includes:**
- "Leased"

**Timestamp:** `PurchaseContractDate`  
**Display:** "Leased – <purchaseContractDate>"

---

### Removed (`removed`)

**Includes:**
- "Terminated"
- "Cancelled"
- "Suspended"
- "Expired"
- "Withdrawn"
- "Unavailable"

**Timestamp:** COALESCE(SuspendedDate, TerminatedDate, ExpirationDate, WithdrawnDate, UnavailableDate)  
**Display:** "<MlsStatus> – <coalescedDate>"

**Note:** Uses OR logic in PostgREST queries (approximates COALESCE).

---

## Implementation Details

### Backend Helper Functions

#### `getTimestampColumnForStatus(statusGroup)`

Returns the timestamp column name for filtering based on status group.

```javascript
getTimestampColumnForStatus('for-sale')  // Returns 'OriginalEntryTimestampRaw'
getTimestampColumnForStatus('sold')      // Returns 'PurchaseContractDate'
getTimestampColumnForStatus('removed')   // Returns 'COALESCE_REMOVED' (special marker)
```

#### `buildRemovedDateFilter(filterDate)`

Builds PostgREST OR filter expression for removed status date filtering.

```javascript
buildRemovedDateFilter('2025-01-01')
// Returns: 'SuspendedDate.gte.2025-01-01,TerminatedDate.gte.2025-01-01,...'
```

### Frontend Helper Functions

#### `getStatusPrefix(status)`

Returns the prefix text for a given status.

```typescript
getStatusPrefix('For Sale')    // Returns 'Listed –'
getStatusPrefix('Sold')        // Returns 'Sold –'
getStatusPrefix('Terminated')  // Returns 'Terminated –'
```

#### `getStatusTimestampDisplay(property)`

Returns formatted display string with prefix and timestamp.

```typescript
getStatusTimestampDisplay(property)
// Returns: "Listed – 10th Jun, 2025" or "Sold – 15th Jun, 2025"
```

---

## Migration Notes

### Deprecated Fields

- `listingAge`: Still returned in API responses for backward compatibility, but should not be used for display or filtering. Use `originalEntryTimestamp` with status prefix instead.

### Breaking Changes

- Date filtering now uses status-specific timestamp columns instead of `ListingAge`
- Display format changed from age-based ("X days ago") to date-based ("Listed – <date>")

### Backward Compatibility

- `listingAge` field is still present in responses (marked deprecated)
- Old API clients will continue to work but should migrate to new timestamp fields

---

## Error Handling

### Missing Timestamps

- If `originalEntryTimestamp` is missing: Frontend falls back to `listedAt` or shows null
- If `purchaseContractDate` is missing (Sold/Leased): Shows null or fallback
- If all removal dates are missing (Removed): Shows null or fallback

### Invalid Status Values

- Unknown status: Falls back to "Listed –" prefix
- Null/undefined status: Falls back to "Listed –" prefix

---

## Performance Considerations

- Date filtering uses indexed columns for optimal performance
- Removed status OR logic may be slower than single-column filters
- Consider adding database indexes on timestamp columns if needed

---

## Testing

See `STATUS_FILTERS_TESTING_CHECKLIST.md` for comprehensive testing guide.

---

## Related Documentation

- `StatusFilters.md` - Reset plan and implementation rules
- `STATUS_FILTERS_TESTING_CHECKLIST.md` - Testing checklist
- Database views: `PropertyView.sql`, `PropertyCardView.sql`

---

**Last Updated:** Status Filters Reset Implementation  
**Maintained By:** Backend Team

