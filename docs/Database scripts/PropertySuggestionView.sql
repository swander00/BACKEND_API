-- =====================================================
-- PROPERTY SUGGESTION VIEW
-- =====================================================
-- Lightweight view for search/autocomplete suggestions
-- Based on PropertyView but includes only fields needed for search
-- =====================================================
-- 
-- PREREQUISITES:
-- - PropertyView must exist (this view depends on it)
-- - Run PropertyViewCalculationHelpers.sql FIRST
-- 
-- REFRESH STRATEGY:
-- - Refresh after PropertyView is refreshed
-- - Use REFRESH MATERIALIZED VIEW CONCURRENTLY for non-blocking updates
-- - Can be refreshed more frequently than PropertyView if needed
--

DROP MATERIALIZED VIEW IF EXISTS public."PropertySuggestionView" CASCADE;

CREATE MATERIALIZED VIEW public."PropertySuggestionView" AS
SELECT
  -- Identifiers
  pv."ListingKey",
  pv."MLSNumber",
  
  -- Address fields (for search)
  pv."FullAddress",
  pv."City",
  pv."StateOrProvince",
  pv."CityRegion",
  pv."PostalCode",
  
  -- Status
  pv."MlsStatus",
  pv."MlsStatus" AS "Status",
  
  -- Listing age (days on market)
  pv."DaysOnMarket" AS "ListingAge",
  
  -- Pricing
  pv."ListPriceRaw" AS "ListPrice",
  pv."OriginalListPrice",
  pv."IsPriceReduced",
  pv."PriceReductionAmount",
  pv."PriceReductionPercent",
  pv."ReductionNumber",
  
  -- Rooms
  pv."BedroomsAboveGrade",
  pv."BedroomsBelowGrade",
  pv."BathroomsTotalInteger",
  
  -- Living area
  pv."LivingAreaMin",
  pv."LivingAreaMax",
  
  -- Property type
  pv."PropertySubType",
  
  -- Primary image
  pv."PrimaryImageUrl"
  
FROM public."PropertyView" pv
WHERE pv."MlsStatus" NOT IN ('Sold', 'Expired', 'Cancelled', 'Withdrawn')
  AND pv."ListPriceRaw" IS NOT NULL
  AND (pv."ListPriceRaw"::numeric) > 0;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_psv_listingkey
  ON public."PropertySuggestionView" ("ListingKey");

-- Create indexes for search performance
-- Note: ILIKE searches work with regular indexes, but trigram indexes (pg_trgm) provide better performance
-- If pg_trgm extension is available, you can use: USING gin ("FullAddress" gin_trgm_ops)
CREATE INDEX IF NOT EXISTS idx_psv_fulladdress
  ON public."PropertySuggestionView" ("FullAddress");

CREATE INDEX IF NOT EXISTS idx_psv_city
  ON public."PropertySuggestionView" ("City");

CREATE INDEX IF NOT EXISTS idx_psv_mlsnumber
  ON public."PropertySuggestionView" ("MLSNumber");

-- Refresh the view
REFRESH MATERIALIZED VIEW public."PropertySuggestionView";

