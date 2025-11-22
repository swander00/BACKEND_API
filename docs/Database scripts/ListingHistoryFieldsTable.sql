-- ============================================================================
-- LISTING HISTORY FIELDS TABLE
-- ============================================================================
-- Separate table to store listing history-related fields from feed data
-- This avoids modifying the existing Property table
-- Links to Property table via ListingKey
-- ============================================================================

CREATE TABLE IF NOT EXISTS public."ListingHistoryFields" (
    "ListingKey" text NOT NULL PRIMARY KEY,  -- Links to Property.ListingKey
    
    -- Price tracking fields
    "OriginalListPrice" numeric,              -- Original listing price when first listed
    "PreviousListPrice" numeric,              -- Previous price before current price change
    
    -- Timestamp fields for history tracking
    "PriceChangeTimestamp" timestamptz,       -- When price was last changed
    "BackOnMarketEntryTimestamp" timestamptz, -- When property was relisted
    "LeasedEntryTimestamp" timestamptz,       -- When property was leased
    "LeasedConditionalEntryTimestamp" timestamptz, -- When conditionally leased
    "DealFellThroughEntryTimestamp" timestamptz,    -- When deal fell through
    "ExtensionEntryTimestamp" timestamptz,    -- When listing was extended
    
    -- Metadata
    "CreatedAt" timestamptz DEFAULT NOW(),
    "UpdatedAt" timestamptz DEFAULT NOW(),
    
    -- Foreign key reference (optional, for data integrity)
    CONSTRAINT fk_listing_history_fields_property 
        FOREIGN KEY ("ListingKey") 
        REFERENCES public."Property"("ListingKey") 
        ON DELETE CASCADE
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_listing_history_fields_price_change_timestamp 
    ON public."ListingHistoryFields" USING btree ("PriceChangeTimestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_listing_history_fields_back_on_market 
    ON public."ListingHistoryFields" USING btree ("BackOnMarketEntryTimestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_listing_history_fields_original_list_price 
    ON public."ListingHistoryFields" USING btree ("OriginalListPrice") 
    WHERE ("OriginalListPrice" IS NOT NULL);

-- ============================================================================
-- TRIGGER
-- ============================================================================

CREATE TRIGGER update_listing_history_fields_updated_at
    BEFORE UPDATE ON public."ListingHistoryFields"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public."ListingHistoryFields" IS 'Stores listing history-related fields from feed data, separate from Property table to avoid modifications';
COMMENT ON COLUMN public."ListingHistoryFields"."ListingKey" IS 'Links to Property.ListingKey';
COMMENT ON COLUMN public."ListingHistoryFields"."OriginalListPrice" IS 'Original listing price when property was first listed';
COMMENT ON COLUMN public."ListingHistoryFields"."PreviousListPrice" IS 'Previous price before current price change';
COMMENT ON COLUMN public."ListingHistoryFields"."PriceChangeTimestamp" IS 'Timestamp when price was last changed';
COMMENT ON COLUMN public."ListingHistoryFields"."BackOnMarketEntryTimestamp" IS 'Timestamp when property was relisted after being off market';

-- ============================================================================
-- END
-- ============================================================================

