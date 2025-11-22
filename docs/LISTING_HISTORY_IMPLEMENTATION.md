# Listing History Implementation

## Overview
This document describes the implementation of listing history tracking for properties. The system tracks complete listing periods and price changes for properties, grouped by `UnparsedAddress` (same physical property).

## Database Schema

### Tables Created

#### 1. `ListingPeriods`
Tracks each complete listing period (from start to end) for a property.

**Key Fields:**
- `UnparsedAddress` - Groups all listings for the same physical property
- `ListingKey` - Unique MLS# for this listing period
- `DateStart` - When listing period began (OriginalEntryTimestamp or BackOnMarketEntryTimestamp)
- `DateEnd` - When listing period ended (null if still Active)
- `InitialPrice` - Original listing price
- `Status` - Final status: Sold, Terminated, Expired, Active, etc.
- `SoldPrice` - ClosePrice if Sold/Leased
- `CloseDate` - CloseDate if Sold/Leased

#### 2. `PriceChanges`
Tracks price adjustments within listing periods (current/active listing only).

**Key Fields:**
- `ListingKey` - References the ListingPeriod
- `ChangeDate` - When price changed
- `Price` - New price
- `PreviousPrice` - Previous price
- `ChangePercent` - Calculated percentage change
- `EventType` - "Listed", "Price Reduced", "Price Increased"

### Separate History Fields Table

**NEW TABLE: `ListingHistoryFields`** - Stores listing history-related fields separately to avoid modifying the existing Property table:
- `ListingKey` - Links to Property.ListingKey (Primary Key)
- `OriginalListPrice` - Original listing price when first listed
- `PreviousListPrice` - Previous price before current price change
- `PriceChangeTimestamp` - When price was last changed
- `BackOnMarketEntryTimestamp` - When property was relisted
- `LeasedEntryTimestamp` - When property was leased
- `LeasedConditionalEntryTimestamp` - When conditionally leased
- `DealFellThroughEntryTimestamp` - When deal fell through
- `ExtensionEntryTimestamp` - When listing was extended

**Why separate table?**
- Avoids modifying the existing Property table (which is working and critical)
- Keeps history fields isolated and safe
- Can be populated from feed data without touching Property table

## Database Migration

Run these SQL scripts in order:

1. **Create ListingHistoryFields table (separate from Property table):**
   ```sql
   -- Run in Supabase SQL Editor
   -- File: docs/Database scripts/ListingHistoryFieldsTable.sql
   ```

2. **Create ListingHistory tables:**
   ```sql
   -- Run in Supabase SQL Editor
   -- File: docs/Database scripts/ListingHistorySchema.sql
   ```

**Note:** We do NOT modify the Property table. All history-related fields are stored in the separate `ListingHistoryFields` table.

## Backend Implementation

### Service: `listingHistoryService.js`

**Functions:**
- `processListingPeriod(property)` - Creates/updates listing period entries
- `processPriceChange(property)` - Tracks price changes for current listing
- `processPropertyListingHistory(property)` - Processes both period and price changes
- `getListingHistory(identifier, isListingKey)` - Fetches history (past 3 years)

**Integration:**
- Integrated into sync process (`sync/sequential.js`)
- Automatically processes listing history when properties are synced

### API Endpoint

**GET `/api/properties/:listingKey/listing-history`**

Returns:
```json
{
  "propertyAddress": "123 Main St, Toronto, ON",
  "listingHistory": [
    {
      "dateStart": "2025-05-12T00:00:00Z",
      "dateEnd": "2025-09-02T00:00:00Z",
      "price": 450000,
      "event": "Sold",
      "listingId": "40701639",
      "soldPrice": 445000,
      "closeDate": "2025-09-02T00:00:00Z"
    }
  ],
  "priceChanges": [
    {
      "date": "2025-06-01T00:00:00Z",
      "price": 480000,
      "change": -4.0,
      "previousPrice": 499000,
      "event": "Price Reduced",
      "listingId": "40701639"
    }
  ]
}
```

**Features:**
- Filters to past 3 years automatically
- Price changes only for current/active listing period
- Returns empty arrays if no data available

## Frontend Implementation

### Component: `ListingHistoryCard.tsx`

**Features:**
- Two-tab interface:
  - **Listing History** - Shows complete listing periods
  - **Price Changes** - Shows price adjustments (with count badge)
- Responsive design:
  - Desktop: Table layout
  - Mobile: Card layout
- Clickable Listing IDs:
  - Blue links with search icon
  - Navigate to property details page
- Status badges:
  - Color-coded by status (Sold=green, Terminated=orange, Expired=gray, Active=blue)
- Price change indicators:
  - Green arrow up for increases
  - Red arrow down for decreases
  - Percentage displayed
- Date formatting:
  - Shows "Active" for listings without end date
  - Formatted as YYYY-MM-DD

### API Integration

**Types Added:**
- `ListingHistoryEntry`
- `PriceChangeEntry`
- `ListingHistoryResponse`

**Endpoint Added:**
- `api.properties.getListingHistory(listingKey)`

## Data Processing Logic

### Listing Period Detection

A new listing period starts when:
1. `OriginalEntryTimestamp` exists (first listing ever)
2. `BackOnMarketEntryTimestamp` exists (relisted after being off market)

### Status Determination

Terminal statuses (listing ended):
- Sold
- Leased
- Terminated
- Expired
- Suspended
- Withdrawn
- Cancelled

End date determination:
- Sold/Leased → `CloseDate`
- Terminated → `TerminatedDate` or `TerminatedEntryTimestamp`
- Expired → `ExpirationDate`
- Suspended → `SuspendedDate` or `SuspendedEntryTimestamp`
- Withdrawn/Cancelled → `UnavailableDate` or `ModificationTimestamp`

### Price Change Detection

Price changes are tracked when:
1. `PriceChangeTimestamp` exists AND `PreviousListPrice` is set
2. Initial listing (`OriginalEntryTimestamp` or `BackOnMarketEntryTimestamp`)

Change percentage calculation:
```javascript
changePercent = ((currentPrice - previousPrice) / previousPrice) * 100
```

Event type:
- Negative change → "Price Reduced"
- Positive change → "Price Increased"
- No previous price → "Listed"

## Usage

### Backend

Listing history is automatically processed during sync. No manual intervention needed.

### Frontend

The component automatically fetches data when expanded:

```tsx
<ListingHistoryCard 
  property={property} 
  expanded={historyExpanded} 
  onToggle={() => setHistoryExpanded((prev) => !prev)} 
/>
```

## Testing

### Manual Testing Steps

1. **Database Setup:**
   - Run migration scripts
   - Verify tables created
   - Verify Property table has new fields

2. **Sync Test:**
   - Run property sync
   - Verify ListingPeriods populated
   - Verify PriceChanges populated (for current listings)

3. **API Test:**
   ```bash
   curl http://localhost:8080/api/properties/X12391175/listing-history
   ```
   - Should return listing history and price changes
   - Should filter to past 3 years

4. **Frontend Test:**
   - Open property details modal
   - Expand Listing History card
   - Verify tabs work
   - Verify data displays correctly
   - Click Listing ID → should navigate to property page
   - Verify responsive design (mobile/desktop)

## Future Enhancements

- [ ] Add "Show More" pagination for long histories
- [ ] Add filtering by date range
- [ ] Add export functionality
- [ ] Add price trend visualization
- [ ] Add comparison with similar properties

## Notes

- Listing IDs are clickable and navigate to property details page
- Price changes only shown for current/active listing period
- History filtered to past 3 years automatically
- "Active" shown for listings without end date
- All timestamps stored in UTC

