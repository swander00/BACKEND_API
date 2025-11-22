# How to Run Listing History Migrations in Supabase

## Step-by-Step Instructions

### 1. Open Supabase Dashboard
- Go to https://app.supabase.com
- Select your project

### 2. Open SQL Editor
- Click **"SQL Editor"** in the left sidebar
- Click **"New query"** button

### 3. Run Script 1: Create ListingHistoryFields Table

Copy and paste this entire script:

```sql
-- ============================================================================
-- LISTING HISTORY FIELDS TABLE
-- Separate table to store listing history-related fields from feed data
-- This avoids modifying the existing Property table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public."ListingHistoryFields" (
    "ListingKey" text NOT NULL PRIMARY KEY,
    "OriginalListPrice" numeric,
    "PreviousListPrice" numeric,
    "PriceChangeTimestamp" timestamptz,
    "BackOnMarketEntryTimestamp" timestamptz,
    "LeasedEntryTimestamp" timestamptz,
    "LeasedConditionalEntryTimestamp" timestamptz,
    "DealFellThroughEntryTimestamp" timestamptz,
    "ExtensionEntryTimestamp" timestamptz,
    "CreatedAt" timestamptz DEFAULT NOW(),
    "UpdatedAt" timestamptz DEFAULT NOW(),
    CONSTRAINT fk_listing_history_fields_property 
        FOREIGN KEY ("ListingKey") 
        REFERENCES public."Property"("ListingKey") 
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_listing_history_fields_price_change_timestamp 
    ON public."ListingHistoryFields" USING btree ("PriceChangeTimestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_listing_history_fields_back_on_market 
    ON public."ListingHistoryFields" USING btree ("BackOnMarketEntryTimestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_listing_history_fields_original_list_price 
    ON public."ListingHistoryFields" USING btree ("OriginalListPrice") 
    WHERE ("OriginalListPrice" IS NOT NULL);

CREATE TRIGGER update_listing_history_fields_updated_at
    BEFORE UPDATE ON public."ListingHistoryFields"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

- Click **"Run"** (or press Ctrl+Enter / Cmd+Enter)
- You should see: **"Success. No rows returned"**

### 4. Run Script 2: Create ListingPeriods and PriceChanges Tables

In a **new query** (or clear the editor), copy and paste this entire script:

```sql
-- ============================================================================
-- LISTING HISTORY SCHEMA
-- Tables to track listing history and price changes for properties
-- ============================================================================

CREATE TABLE IF NOT EXISTS public."ListingPeriods" (
    "Id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "UnparsedAddress" text NOT NULL,
    "ListingKey" text NOT NULL UNIQUE,
    "DateStart" timestamptz NOT NULL,
    "DateEnd" timestamptz,
    "InitialPrice" numeric NOT NULL,
    "FinalPrice" numeric,
    "Status" text NOT NULL,
    "SoldPrice" numeric,
    "CloseDate" timestamptz,
    "CreatedAt" timestamptz DEFAULT NOW(),
    "UpdatedAt" timestamptz DEFAULT NOW(),
    CONSTRAINT "ListingPeriods_Status_check" 
        CHECK ("Status" IN ('Active', 'Sold', 'Leased', 'Terminated', 'Expired', 'Suspended', 'Withdrawn', 'Cancelled'))
);

CREATE TABLE IF NOT EXISTS public."PriceChanges" (
    "Id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "ListingKey" text NOT NULL,
    "UnparsedAddress" text NOT NULL,
    "ChangeDate" timestamptz NOT NULL,
    "Price" numeric NOT NULL,
    "PreviousPrice" numeric,
    "ChangePercent" numeric,
    "EventType" text,
    "CreatedAt" timestamptz DEFAULT NOW(),
    CONSTRAINT "PriceChanges_EventType_check" 
        CHECK ("EventType" IN ('Listed', 'Price Reduced', 'Price Increased'))
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_listing_periods_unparsed_address 
    ON public."ListingPeriods" USING btree ("UnparsedAddress");

CREATE INDEX IF NOT EXISTS idx_listing_periods_date_start 
    ON public."ListingPeriods" USING btree ("DateStart" DESC);

CREATE INDEX IF NOT EXISTS idx_listing_periods_listing_key 
    ON public."ListingPeriods" USING btree ("ListingKey");

CREATE INDEX IF NOT EXISTS idx_listing_periods_status 
    ON public."ListingPeriods" USING btree ("Status");

CREATE INDEX IF NOT EXISTS idx_price_changes_listing_key 
    ON public."PriceChanges" USING btree ("ListingKey");

CREATE INDEX IF NOT EXISTS idx_price_changes_unparsed_address 
    ON public."PriceChanges" USING btree ("UnparsedAddress");

CREATE INDEX IF NOT EXISTS idx_price_changes_change_date 
    ON public."PriceChanges" USING btree ("ChangeDate" DESC);

-- TRIGGER
CREATE TRIGGER update_listing_periods_updated_at
    BEFORE UPDATE ON public."ListingPeriods"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

- Click **"Run"**
- You should see: **"Success. No rows returned"**

### 5. Verify Tables Were Created

- Click **"Table Editor"** in the left sidebar
- You should see these new tables:
  - ✅ `ListingHistoryFields`
  - ✅ `ListingPeriods`
  - ✅ `PriceChanges`

## What This Does

1. **ListingHistoryFields** - Stores history-related fields separately (doesn't touch Property table)
2. **ListingPeriods** - Tracks complete listing periods for each property
3. **PriceChanges** - Tracks price adjustments within listing periods

## Important Notes

- ✅ **Property table is NOT modified** - All changes are in separate tables
- ✅ Safe to run - Uses `IF NOT EXISTS` so won't break if run multiple times
- ✅ Tables will be empty until you run a property sync (which populates them automatically)

## After Running Migrations

1. Restart your backend server (if running)
2. Run a property sync to populate the tables
3. Test the listing history endpoint in your frontend

