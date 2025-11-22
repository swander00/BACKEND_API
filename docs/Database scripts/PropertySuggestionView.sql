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
  pv."UnitNumber",
  pv."StreetNumber",
  pv."StreetNumberText",
  pv."StreetName",
  pv."City",
  pv."StateOrProvince",
  pv."CityRegion",
  pv."Community",
  pv."PostalCode",
  
  -- Searchable text fields
  pv."PublicRemarks",
  pv."PropertyFeatures",
  pv."InteriorFeatures",
  pv."ExteriorFeatures",
  
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
-- Note: No status filtering - search suggestions should show all statuses
-- Only filter out properties without valid prices
WHERE pv."ListPriceRaw" IS NOT NULL
  AND (pv."ListPriceRaw"::numeric) > 0;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_psv_listingkey
  ON public."PropertySuggestionView" ("ListingKey");

-- Create indexes for search performance
-- Regular B-tree indexes for exact/range queries
CREATE INDEX IF NOT EXISTS idx_psv_fulladdress
  ON public."PropertySuggestionView" ("FullAddress");

CREATE INDEX IF NOT EXISTS idx_psv_city
  ON public."PropertySuggestionView" ("City");

CREATE INDEX IF NOT EXISTS idx_psv_mlsnumber
  ON public."PropertySuggestionView" ("MLSNumber");

-- Trigram indexes (GIN) for fuzzy search performance
-- These indexes enable fast similarity() queries using pg_trgm extension
-- Note: pg_trgm extension must be enabled (already enabled in schema.sql)
CREATE INDEX IF NOT EXISTS idx_psv_fulladdress_trgm 
  ON public."PropertySuggestionView" USING gin ("FullAddress" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_psv_city_trgm 
  ON public."PropertySuggestionView" USING gin ("City" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_psv_mlsnumber_trgm 
  ON public."PropertySuggestionView" USING gin ("MLSNumber" gin_trgm_ops);

-- Additional trigram indexes for new search fields
CREATE INDEX IF NOT EXISTS idx_psv_unitnumber_trgm 
  ON public."PropertySuggestionView" USING gin (COALESCE("UnitNumber", '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_psv_streetnumber_trgm 
  ON public."PropertySuggestionView" USING gin (COALESCE("StreetNumber"::text, COALESCE("StreetNumberText", '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_psv_streetname_trgm 
  ON public."PropertySuggestionView" USING gin (COALESCE("StreetName", '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_psv_community_trgm 
  ON public."PropertySuggestionView" USING gin (COALESCE("Community", '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_psv_publicremarks_trgm 
  ON public."PropertySuggestionView" USING gin (COALESCE("PublicRemarks", '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_psv_propertyfeatures_trgm 
  ON public."PropertySuggestionView" USING gin (COALESCE("PropertyFeatures", '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_psv_interiorfeatures_trgm 
  ON public."PropertySuggestionView" USING gin (COALESCE("InteriorFeatures", '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_psv_exteriorfeatures_trgm 
  ON public."PropertySuggestionView" USING gin (COALESCE("ExteriorFeatures", '') gin_trgm_ops);

-- Refresh the view
REFRESH MATERIALIZED VIEW public."PropertySuggestionView";

