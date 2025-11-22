-- ============================================================================
-- LISTING HISTORY SCHEMA
-- ============================================================================
-- Tables to track listing history and price changes for properties
-- Groups listings by UnparsedAddress (same physical property)
-- ============================================================================

-- ============================================================================
-- TABLE 1: ListingPeriods
-- ============================================================================
-- Tracks each listing period (from start to end) for a property
-- Each row represents one complete listing period with a unique ListingKey (MLS#)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public."ListingPeriods" (
    "Id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "UnparsedAddress" text NOT NULL,
    "ListingKey" text NOT NULL UNIQUE,  -- MLS# for this listing period
    
    -- Period dates
    "DateStart" timestamptz NOT NULL,     -- OriginalEntryTimestamp or BackOnMarketEntryTimestamp
    "DateEnd" timestamptz,                  -- CloseDate, ExpirationDate, TerminatedDate, SuspendedDate, etc.
    
    -- Pricing
    "InitialPrice" numeric NOT NULL,       -- OriginalListPrice or ListPrice at start
    "FinalPrice" numeric,                  -- ListPrice at end (if different from initial)
    
    -- Status
    "Status" text NOT NULL,                 -- Final MlsStatus: Sold, Terminated, Expired, Active, etc.
    "SoldPrice" numeric,                   -- ClosePrice if Sold/Leased
    "CloseDate" timestamptz,               -- CloseDate if Sold/Leased
    
    -- Metadata
    "CreatedAt" timestamptz DEFAULT NOW(),
    "UpdatedAt" timestamptz DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT "ListingPeriods_Status_check" 
        CHECK ("Status" IN ('Active', 'Sold', 'Leased', 'Terminated', 'Expired', 'Suspended', 'Withdrawn', 'Cancelled'))
);

-- ============================================================================
-- TABLE 2: PriceChanges
-- ============================================================================
-- Tracks price adjustments within listing periods
-- Only tracks price changes for the current/active listing period
-- ============================================================================

CREATE TABLE IF NOT EXISTS public."PriceChanges" (
    "Id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "ListingKey" text NOT NULL,             -- References ListingPeriods.ListingKey
    "UnparsedAddress" text NOT NULL,        -- For quick lookup
    
    "ChangeDate" timestamptz NOT NULL,      -- PriceChangeTimestamp or OriginalEntryTimestamp
    "Price" numeric NOT NULL,               -- New ListPrice
    "PreviousPrice" numeric,                -- PreviousListPrice (null for initial listing)
    "ChangePercent" numeric,                -- Calculated: ((Price - PreviousPrice) / PreviousPrice) * 100
    "EventType" text,                       -- "Listed", "Price Reduced", "Price Increased"
    
    "CreatedAt" timestamptz DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT "PriceChanges_EventType_check" 
        CHECK ("EventType" IN ('Listed', 'Price Reduced', 'Price Increased'))
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- ListingPeriods indexes
CREATE INDEX IF NOT EXISTS idx_listing_periods_unparsed_address 
    ON public."ListingPeriods" USING btree ("UnparsedAddress");

CREATE INDEX IF NOT EXISTS idx_listing_periods_date_start 
    ON public."ListingPeriods" USING btree ("DateStart" DESC);

CREATE INDEX IF NOT EXISTS idx_listing_periods_listing_key 
    ON public."ListingPeriods" USING btree ("ListingKey");

CREATE INDEX IF NOT EXISTS idx_listing_periods_status 
    ON public."ListingPeriods" USING btree ("Status");

-- PriceChanges indexes
CREATE INDEX IF NOT EXISTS idx_price_changes_listing_key 
    ON public."PriceChanges" USING btree ("ListingKey");

CREATE INDEX IF NOT EXISTS idx_price_changes_unparsed_address 
    ON public."PriceChanges" USING btree ("UnparsedAddress");

CREATE INDEX IF NOT EXISTS idx_price_changes_change_date 
    ON public."PriceChanges" USING btree ("ChangeDate" DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update UpdatedAt timestamp for ListingPeriods
CREATE TRIGGER update_listing_periods_updated_at
    BEFORE UPDATE ON public."ListingPeriods"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS (Optional - can be added if needed)
-- ============================================================================
-- Note: We don't add FK constraint to Property table because:
-- 1. ListingKey might reference historical listings no longer in Property table
-- 2. We want to preserve history even if property is deleted
-- ============================================================================

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public."ListingPeriods" IS 'Tracks complete listing periods for properties grouped by UnparsedAddress';
COMMENT ON TABLE public."PriceChanges" IS 'Tracks price adjustments within listing periods (current/active listing only)';

COMMENT ON COLUMN public."ListingPeriods"."UnparsedAddress" IS 'Groups all listings for the same physical property';
COMMENT ON COLUMN public."ListingPeriods"."ListingKey" IS 'Unique MLS# for this listing period';
COMMENT ON COLUMN public."ListingPeriods"."DateStart" IS 'When listing period began (OriginalEntryTimestamp or BackOnMarketEntryTimestamp)';
COMMENT ON COLUMN public."ListingPeriods"."DateEnd" IS 'When listing period ended (null if still Active)';
COMMENT ON COLUMN public."ListingPeriods"."Status" IS 'Final status: Sold, Terminated, Expired, Active, etc.';

COMMENT ON COLUMN public."PriceChanges"."ListingKey" IS 'References the ListingPeriod this price change belongs to';
COMMENT ON COLUMN public."PriceChanges"."ChangePercent" IS 'Percentage change: positive = increase, negative = decrease';
COMMENT ON COLUMN public."PriceChanges"."EventType" IS 'Type of event: Listed, Price Reduced, Price Increased';

-- ============================================================================
-- END OF LISTING HISTORY SCHEMA
-- ============================================================================

