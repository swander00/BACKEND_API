-- ============================================================================
-- ADD MISSING FIELDS TO PROPERTY TABLE FOR LISTING HISTORY
-- ============================================================================
-- Adds fields needed to track listing history and price changes
-- ============================================================================

-- Add OriginalListPrice (original listing price when first listed)
ALTER TABLE public."Property" 
ADD COLUMN IF NOT EXISTS "OriginalListPrice" numeric;

-- Add PreviousListPrice (previous price before current price change)
ALTER TABLE public."Property" 
ADD COLUMN IF NOT EXISTS "PreviousListPrice" numeric;

-- Add PriceChangeTimestamp (when price was last changed)
ALTER TABLE public."Property" 
ADD COLUMN IF NOT EXISTS "PriceChangeTimestamp" timestamptz;

-- Add BackOnMarketEntryTimestamp (when property was relisted)
ALTER TABLE public."Property" 
ADD COLUMN IF NOT EXISTS "BackOnMarketEntryTimestamp" timestamptz;

-- Add LeasedEntryTimestamp (when property was leased)
ALTER TABLE public."Property" 
ADD COLUMN IF NOT EXISTS "LeasedEntryTimestamp" timestamptz;

-- Add LeasedConditionalEntryTimestamp (when property was conditionally leased)
ALTER TABLE public."Property" 
ADD COLUMN IF NOT EXISTS "LeasedConditionalEntryTimestamp" timestamptz;

-- Add DealFellThroughEntryTimestamp (when deal fell through)
ALTER TABLE public."Property" 
ADD COLUMN IF NOT EXISTS "DealFellThroughEntryTimestamp" timestamptz;

-- Add ExtensionEntryTimestamp (when listing was extended)
ALTER TABLE public."Property" 
ADD COLUMN IF NOT EXISTS "ExtensionEntryTimestamp" timestamptz;

-- ============================================================================
-- INDEXES FOR NEW FIELDS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_property_price_change_timestamp 
    ON public."Property" USING btree ("PriceChangeTimestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_property_back_on_market 
    ON public."Property" USING btree ("BackOnMarketEntryTimestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_property_original_list_price 
    ON public."Property" USING btree ("OriginalListPrice") 
    WHERE ("OriginalListPrice" IS NOT NULL);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN public."Property"."OriginalListPrice" IS 'Original listing price when property was first listed';
COMMENT ON COLUMN public."Property"."PreviousListPrice" IS 'Previous price before current price change';
COMMENT ON COLUMN public."Property"."PriceChangeTimestamp" IS 'Timestamp when price was last changed';
COMMENT ON COLUMN public."Property"."BackOnMarketEntryTimestamp" IS 'Timestamp when property was relisted after being off market';
COMMENT ON COLUMN public."Property"."LeasedEntryTimestamp" IS 'Timestamp when property was leased';
COMMENT ON COLUMN public."Property"."LeasedConditionalEntryTimestamp" IS 'Timestamp when property was conditionally leased';
COMMENT ON COLUMN public."Property"."DealFellThroughEntryTimestamp" IS 'Timestamp when deal fell through';
COMMENT ON COLUMN public."Property"."ExtensionEntryTimestamp" IS 'Timestamp when listing was extended';

-- ============================================================================
-- END
-- ============================================================================

