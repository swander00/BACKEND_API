-- =====================================================
-- FUZZY SEARCH FUNCTION
-- =====================================================
-- PostgreSQL function for fuzzy property search using trigram similarity
-- This enables fuzzy matching on addresses, cities, and MLS numbers
-- =====================================================
-- 
-- PREREQUISITES:
-- - pg_trgm extension must be enabled (already enabled in schema.sql)
-- - PropertySuggestionView must exist
--
-- USAGE:
-- SELECT * FROM search_property_suggestions('toronto', 10);
-- SELECT * FROM search_property_suggestions('123 main st', 10);
-- SELECT * FROM search_property_suggestions('C1234567', 10);
--

-- Drop function if exists
DROP FUNCTION IF EXISTS public.search_property_suggestions(text, integer);

-- Create fuzzy search function using trigram similarity
CREATE OR REPLACE FUNCTION public.search_property_suggestions(
  search_term text,
  result_limit integer DEFAULT 10
)
RETURNS TABLE (
  "ListingKey" text,
  "MLSNumber" text,
  "FullAddress" text,
  "City" text,
  "StateOrProvince" text,
  "CityRegion" text,
  "PostalCode" text,
  "MlsStatus" text,
  "Status" text,
  "ListingAge" integer,
  "ListPrice" numeric,
  "OriginalListPrice" numeric,
  "IsPriceReduced" boolean,
  "PriceReductionAmount" text,
  "PriceReductionPercent" numeric,
  "ReductionNumber" integer,
  "BedroomsAboveGrade" integer,
  "BedroomsBelowGrade" integer,
  "BathroomsTotalInteger" integer,
  "LivingAreaMin" integer,
  "LivingAreaMax" integer,
  "PropertySubType" text,
  "PrimaryImageUrl" text,
  similarity_score real
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  normalized_term text;
  similarity_threshold real := 0.2; -- Minimum similarity threshold (0.0 to 1.0)
BEGIN
  -- Normalize search term: lowercase and trim
  normalized_term := lower(trim(search_term));
  
  -- If search term is too short, use ILIKE instead of similarity
  IF length(normalized_term) < 2 THEN
    RETURN;
  END IF;
  
  -- Use trigram similarity for fuzzy matching
  -- Search across FullAddress, City, and MLSNumber fields
  -- Order by similarity score (highest first)
  RETURN QUERY
  SELECT 
    psv."ListingKey",
    psv."MLSNumber",
    psv."FullAddress",
    psv."City",
    psv."StateOrProvince",
    psv."CityRegion",
    psv."PostalCode",
    psv."MlsStatus",
    psv."Status",
    psv."ListingAge",
    psv."ListPrice",
    psv."OriginalListPrice",
    psv."IsPriceReduced",
    psv."PriceReductionAmount",
    psv."PriceReductionPercent",
    psv."ReductionNumber",
    psv."BedroomsAboveGrade",
    psv."BedroomsBelowGrade",
    psv."BathroomsTotalInteger",
    psv."LivingAreaMin",
    psv."LivingAreaMax",
    psv."PropertySubType",
    psv."PrimaryImageUrl",
    GREATEST(
      similarity(lower(psv."FullAddress"), normalized_term),
      similarity(lower(psv."City"), normalized_term),
      similarity(lower(psv."MLSNumber"), normalized_term)
    ) AS similarity_score
  FROM public."PropertySuggestionView" psv
  WHERE 
    -- Use similarity for fuzzy matching
    (
      similarity(lower(psv."FullAddress"), normalized_term) >= similarity_threshold
      OR similarity(lower(psv."City"), normalized_term) >= similarity_threshold
      OR similarity(lower(psv."MLSNumber"), normalized_term) >= similarity_threshold
    )
    -- Also include exact substring matches (ILIKE) for better coverage
    OR lower(psv."FullAddress") ILIKE '%' || normalized_term || '%'
    OR lower(psv."City") ILIKE '%' || normalized_term || '%'
    OR lower(psv."MLSNumber") ILIKE '%' || normalized_term || '%'
  ORDER BY 
    -- Prioritize exact matches and prefix matches over substring matches
    -- This CASE statement ensures prefix matches ALWAYS rank above substring matches
    CASE 
      -- Exact matches (highest priority)
      WHEN lower(psv."FullAddress") = normalized_term THEN 1
      WHEN lower(psv."City") = normalized_term THEN 2
      WHEN lower(psv."MLSNumber") = normalized_term THEN 3
      -- Prefix matches (address starts with search term) - CRITICAL for numeric searches like "331"
      -- For "331", this matches "331 Elmwood Ave" but NOT "1331 Gerrard St" or "2-1331 Gerrard St"
      WHEN lower(psv."FullAddress") LIKE normalized_term || '%' THEN 4
      WHEN lower(psv."City") LIKE normalized_term || '%' THEN 5
      WHEN lower(psv."MLSNumber") LIKE normalized_term || '%' THEN 6
      -- Substring matches (lowest priority) - these should rank below prefix matches
      -- For "331", this matches "1331 Gerrard St" (contains "331" but street number doesn't start with it)
      ELSE 7
    END,
    -- Boost similarity score for prefix matches significantly
    -- Reference the GREATEST expression directly instead of the alias
    CASE 
      WHEN lower(psv."FullAddress") LIKE normalized_term || '%' THEN 
        GREATEST(
          similarity(lower(psv."FullAddress"), normalized_term),
          similarity(lower(psv."City"), normalized_term),
          similarity(lower(psv."MLSNumber"), normalized_term)
        ) + 1.0
      WHEN lower(psv."City") LIKE normalized_term || '%' THEN 
        GREATEST(
          similarity(lower(psv."FullAddress"), normalized_term),
          similarity(lower(psv."City"), normalized_term),
          similarity(lower(psv."MLSNumber"), normalized_term)
        ) + 0.8
      WHEN lower(psv."MLSNumber") LIKE normalized_term || '%' THEN 
        GREATEST(
          similarity(lower(psv."FullAddress"), normalized_term),
          similarity(lower(psv."City"), normalized_term),
          similarity(lower(psv."MLSNumber"), normalized_term)
        ) + 0.8
      ELSE 
        GREATEST(
          similarity(lower(psv."FullAddress"), normalized_term),
          similarity(lower(psv."City"), normalized_term),
          similarity(lower(psv."MLSNumber"), normalized_term)
        )
    END DESC,
    psv."FullAddress" ASC
  LIMIT result_limit;
END;
$$;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.search_property_suggestions(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_property_suggestions(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_property_suggestions(text, integer) TO anon;

-- Create index for better performance (if not already exists)
-- Trigram indexes are already mentioned in PropertySuggestionView.sql but not created
-- We'll add them here for better fuzzy search performance
CREATE INDEX IF NOT EXISTS idx_psv_fulladdress_trgm 
  ON public."PropertySuggestionView" USING gin ("FullAddress" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_psv_city_trgm 
  ON public."PropertySuggestionView" USING gin ("City" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_psv_mlsnumber_trgm 
  ON public."PropertySuggestionView" USING gin ("MLSNumber" gin_trgm_ops);

