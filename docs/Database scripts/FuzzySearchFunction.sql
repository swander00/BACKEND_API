-- =====================================================
-- FUZZY SEARCH FUNCTION
-- =====================================================
-- PostgreSQL function for fuzzy property search using trigram similarity
-- Searches in priority order:
-- 1. Address fields: MLSNumber, UnitNumber, StreetNumber, StreetName, City, Community
-- 2. PublicRemarks (if no address matches)
-- 3. Features: PropertyFeatures, InteriorFeatures, ExteriorFeatures (if no address/remarks matches)
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
  address_similarity_threshold real := 0.2; -- Minimum similarity for address fields
  remarks_similarity_threshold real := 0.15; -- Lower threshold for PublicRemarks
  features_similarity_threshold real := 0.15; -- Lower threshold for Features
BEGIN
  -- Normalize search term: lowercase and trim
  normalized_term := lower(trim(search_term));
  
  -- If search term is too short, return empty
  IF length(normalized_term) < 2 THEN
    RETURN;
  END IF;
  
  -- Use trigram similarity for fuzzy matching
  -- Priority: Address fields > PublicRemarks > Features
  RETURN QUERY
  WITH scored_results AS (
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
      -- Calculate similarity scores for all address fields
      similarity(lower(COALESCE(psv."MLSNumber", '')), normalized_term) AS mls_sim,
      similarity(lower(COALESCE(psv."UnitNumber", '')), normalized_term) AS unit_sim,
      similarity(lower(COALESCE(psv."StreetNumberText", COALESCE(psv."StreetNumber"::text, ''))), normalized_term) AS streetnum_sim,
      similarity(lower(COALESCE(psv."StreetName", '')), normalized_term) AS streetname_sim,
      similarity(lower(COALESCE(psv."City", '')), normalized_term) AS city_sim,
      similarity(lower(COALESCE(psv."Community", '')), normalized_term) AS community_sim,
      similarity(lower(COALESCE(psv."FullAddress", '')), normalized_term) AS fulladdress_sim,
      -- Calculate similarity for PublicRemarks (lower priority)
      similarity(lower(COALESCE(psv."PublicRemarks", '')), normalized_term) AS remarks_sim,
      -- Calculate similarity for Features (lowest priority)
      GREATEST(
        similarity(lower(COALESCE(psv."PropertyFeatures", '')), normalized_term),
        similarity(lower(COALESCE(psv."InteriorFeatures", '')), normalized_term),
        similarity(lower(COALESCE(psv."ExteriorFeatures", '')), normalized_term)
      ) AS features_sim,
      -- Determine match type for priority ordering
      CASE
        -- Exact matches in address fields (highest priority: 1-6)
        WHEN lower(COALESCE(psv."MLSNumber", '')) = normalized_term THEN 1
        WHEN lower(COALESCE(psv."UnitNumber", '')) = normalized_term THEN 2
        WHEN lower(COALESCE(psv."StreetNumberText", COALESCE(psv."StreetNumber"::text, ''))) = normalized_term THEN 3
        WHEN lower(COALESCE(psv."StreetName", '')) = normalized_term THEN 4
        WHEN lower(COALESCE(psv."City", '')) = normalized_term THEN 5
        WHEN lower(COALESCE(psv."Community", '')) = normalized_term THEN 6
        WHEN lower(COALESCE(psv."FullAddress", '')) = normalized_term THEN 7
        -- Prefix matches in address fields (high priority: 8-14)
        WHEN lower(COALESCE(psv."MLSNumber", '')) LIKE normalized_term || '%' THEN 8
        WHEN lower(COALESCE(psv."UnitNumber", '')) LIKE normalized_term || '%' THEN 9
        WHEN lower(COALESCE(psv."StreetNumberText", COALESCE(psv."StreetNumber"::text, ''))) LIKE normalized_term || '%' THEN 10
        WHEN lower(COALESCE(psv."StreetName", '')) LIKE normalized_term || '%' THEN 11
        WHEN lower(COALESCE(psv."City", '')) LIKE normalized_term || '%' THEN 12
        WHEN lower(COALESCE(psv."Community", '')) LIKE normalized_term || '%' THEN 13
        WHEN lower(COALESCE(psv."FullAddress", '')) LIKE normalized_term || '%' THEN 14
        -- Fuzzy matches in address fields (medium priority: 15)
        WHEN GREATEST(
          similarity(lower(COALESCE(psv."MLSNumber", '')), normalized_term),
          similarity(lower(COALESCE(psv."UnitNumber", '')), normalized_term),
          similarity(lower(COALESCE(psv."StreetNumberText", COALESCE(psv."StreetNumber"::text, ''))), normalized_term),
          similarity(lower(COALESCE(psv."StreetName", '')), normalized_term),
          similarity(lower(COALESCE(psv."City", '')), normalized_term),
          similarity(lower(COALESCE(psv."Community", '')), normalized_term),
          similarity(lower(COALESCE(psv."FullAddress", '')), normalized_term)
        ) >= address_similarity_threshold THEN 15
        -- PublicRemarks matches (lower priority: 16)
        WHEN similarity(lower(COALESCE(psv."PublicRemarks", '')), normalized_term) >= remarks_similarity_threshold
          OR lower(COALESCE(psv."PublicRemarks", '')) ILIKE '%' || normalized_term || '%' THEN 16
        -- Features matches (lowest priority: 17)
        WHEN GREATEST(
          similarity(lower(COALESCE(psv."PropertyFeatures", '')), normalized_term),
          similarity(lower(COALESCE(psv."InteriorFeatures", '')), normalized_term),
          similarity(lower(COALESCE(psv."ExteriorFeatures", '')), normalized_term)
        ) >= features_similarity_threshold
          OR lower(COALESCE(psv."PropertyFeatures", '')) ILIKE '%' || normalized_term || '%'
          OR lower(COALESCE(psv."InteriorFeatures", '')) ILIKE '%' || normalized_term || '%'
          OR lower(COALESCE(psv."ExteriorFeatures", '')) ILIKE '%' || normalized_term || '%' THEN 17
        ELSE 999 -- No match
      END AS match_priority,
      -- Calculate overall similarity score (weighted by match type)
      CASE
        -- Address field matches get full weight
        WHEN GREATEST(
          similarity(lower(COALESCE(psv."MLSNumber", '')), normalized_term),
          similarity(lower(COALESCE(psv."UnitNumber", '')), normalized_term),
          similarity(lower(COALESCE(psv."StreetNumberText", COALESCE(psv."StreetNumber"::text, ''))), normalized_term),
          similarity(lower(COALESCE(psv."StreetName", '')), normalized_term),
          similarity(lower(COALESCE(psv."City", '')), normalized_term),
          similarity(lower(COALESCE(psv."Community", '')), normalized_term),
          similarity(lower(COALESCE(psv."FullAddress", '')), normalized_term)
        ) >= address_similarity_threshold THEN
          GREATEST(
            similarity(lower(COALESCE(psv."MLSNumber", '')), normalized_term),
            similarity(lower(COALESCE(psv."UnitNumber", '')), normalized_term),
            similarity(lower(COALESCE(psv."StreetNumberText", COALESCE(psv."StreetNumber"::text, ''))), normalized_term),
            similarity(lower(COALESCE(psv."StreetName", '')), normalized_term),
            similarity(lower(COALESCE(psv."City", '')), normalized_term),
            similarity(lower(COALESCE(psv."Community", '')), normalized_term),
            similarity(lower(COALESCE(psv."FullAddress", '')), normalized_term)
          ) + 1.0 -- Boost address matches
        -- PublicRemarks matches get reduced weight
        WHEN similarity(lower(COALESCE(psv."PublicRemarks", '')), normalized_term) >= remarks_similarity_threshold
          OR lower(COALESCE(psv."PublicRemarks", '')) ILIKE '%' || normalized_term || '%' THEN
          similarity(lower(COALESCE(psv."PublicRemarks", '')), normalized_term) + 0.5
        -- Features matches get lowest weight
        ELSE GREATEST(
          similarity(lower(COALESCE(psv."PropertyFeatures", '')), normalized_term),
          similarity(lower(COALESCE(psv."InteriorFeatures", '')), normalized_term),
          similarity(lower(COALESCE(psv."ExteriorFeatures", '')), normalized_term)
        ) + 0.3
      END AS similarity_score
    FROM public."PropertySuggestionView" psv
    WHERE 
      -- Address field matches (highest priority)
      (
        similarity(lower(COALESCE(psv."MLSNumber", '')), normalized_term) >= address_similarity_threshold
        OR similarity(lower(COALESCE(psv."UnitNumber", '')), normalized_term) >= address_similarity_threshold
        OR similarity(lower(COALESCE(psv."StreetNumberText", COALESCE(psv."StreetNumber"::text, ''))), normalized_term) >= address_similarity_threshold
        OR similarity(lower(COALESCE(psv."StreetName", '')), normalized_term) >= address_similarity_threshold
        OR similarity(lower(COALESCE(psv."City", '')), normalized_term) >= address_similarity_threshold
        OR similarity(lower(COALESCE(psv."Community", '')), normalized_term) >= address_similarity_threshold
        OR similarity(lower(COALESCE(psv."FullAddress", '')), normalized_term) >= address_similarity_threshold
        -- Also include exact/prefix/substring matches in address fields
        OR lower(COALESCE(psv."MLSNumber", '')) ILIKE '%' || normalized_term || '%'
        OR lower(COALESCE(psv."UnitNumber", '')) ILIKE '%' || normalized_term || '%'
        OR lower(COALESCE(psv."StreetNumberText", COALESCE(psv."StreetNumber"::text, ''))) ILIKE '%' || normalized_term || '%'
        OR lower(COALESCE(psv."StreetName", '')) ILIKE '%' || normalized_term || '%'
        OR lower(COALESCE(psv."City", '')) ILIKE '%' || normalized_term || '%'
        OR lower(COALESCE(psv."Community", '')) ILIKE '%' || normalized_term || '%'
        OR lower(COALESCE(psv."FullAddress", '')) ILIKE '%' || normalized_term || '%'
      )
      -- PublicRemarks matches (only if no address matches found)
      OR (
        similarity(lower(COALESCE(psv."PublicRemarks", '')), normalized_term) >= remarks_similarity_threshold
        OR lower(COALESCE(psv."PublicRemarks", '')) ILIKE '%' || normalized_term || '%'
      )
      -- Features matches (only if no address/remarks matches found)
      OR (
        GREATEST(
          similarity(lower(COALESCE(psv."PropertyFeatures", '')), normalized_term),
          similarity(lower(COALESCE(psv."InteriorFeatures", '')), normalized_term),
          similarity(lower(COALESCE(psv."ExteriorFeatures", '')), normalized_term)
        ) >= features_similarity_threshold
        OR lower(COALESCE(psv."PropertyFeatures", '')) ILIKE '%' || normalized_term || '%'
        OR lower(COALESCE(psv."InteriorFeatures", '')) ILIKE '%' || normalized_term || '%'
        OR lower(COALESCE(psv."ExteriorFeatures", '')) ILIKE '%' || normalized_term || '%'
      )
  )
  SELECT 
    sr."ListingKey",
    sr."MLSNumber",
    sr."FullAddress",
    sr."City",
    sr."StateOrProvince",
    sr."CityRegion",
    sr."PostalCode",
    sr."MlsStatus",
    sr."Status",
    sr."ListingAge",
    sr."ListPrice",
    sr."OriginalListPrice",
    sr."IsPriceReduced",
    sr."PriceReductionAmount",
    sr."PriceReductionPercent",
    sr."ReductionNumber",
    sr."BedroomsAboveGrade",
    sr."BedroomsBelowGrade",
    sr."BathroomsTotalInteger",
    sr."LivingAreaMin",
    sr."LivingAreaMax",
    sr."PropertySubType",
    sr."PrimaryImageUrl",
    sr.similarity_score
  FROM scored_results sr
  WHERE sr.match_priority < 999 -- Exclude non-matches
  ORDER BY 
    sr.match_priority ASC, -- Lower priority number = higher priority
    sr.similarity_score DESC, -- Higher similarity = better match
    sr."FullAddress" ASC
  LIMIT result_limit;
END;
$$;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.search_property_suggestions(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_property_suggestions(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_property_suggestions(text, integer) TO anon;

-- Note: Trigram indexes are created in PropertySuggestionView.sql
-- This function relies on those indexes for performance

