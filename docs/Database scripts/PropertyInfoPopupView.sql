-- =====================================================
-- PROPERTY INFO POPUP VIEW
-- =====================================================
-- Lightweight view for map popup/hover displays
-- Contains only essential fields needed for map markers and popups
-- =====================================================
-- 
-- PREREQUISITES:
-- - Run PropertyViewCalculationHelpers.sql FIRST to create helper functions
-- - Run PropertyViewHelpers.sql (or include CTEs inline)
-- 
-- REFRESH STRATEGY:
-- - Refresh daily or on data updates via scheduled job
-- - Use REFRESH MATERIALIZED VIEW CONCURRENTLY for non-blocking updates
-- - Monitor refresh performance and adjust schedule as needed
-- 
-- MAINTENANCE NOTES:
-- - Unique index required for concurrent refresh
-- - Monitor query performance and add indexes as needed
-- - This view is optimized for fast map queries with bounds filtering
--
DROP MATERIALIZED VIEW IF EXISTS public."PropertyInfoPopupView" CASCADE;

CREATE MATERIALIZED VIEW public."PropertyInfoPopupView" AS
-- =====================================================
-- CTEs FROM PropertyViewHelpers.sql
-- =====================================================
WITH
  -- Media scope: Filter active photos from Media table
  media_scope AS (
    SELECT
      m."ResourceRecordKey"                   AS "ListingKey",
      m."MediaKey",
      m."MediaURL",
      NULLIF(TRIM(m."ShortDescription"), '')  AS "AltText",
      COALESCE(m."PreferredPhotoYN", 'N')     AS "PreferredPhotoYN",
      COALESCE(m."Order", 9999)               AS "SortOrder"
    FROM public."Media" m
    WHERE COALESCE(m."MediaStatus", 'Active') = 'Active'
      AND COALESCE(m."MediaCategory", 'Photo') = 'Photo'
  ),
  -- Media primary: Get the primary image URL for each listing
  media_primary AS (
    SELECT DISTINCT ON ("ListingKey")
      "ListingKey",
      "MediaURL" AS "PrimaryImageUrl"
    FROM media_scope
    ORDER BY "ListingKey",
             CASE WHEN "PreferredPhotoYN" = 'Y' THEN 0 ELSE 1 END,
             "SortOrder",
             "MediaKey"
  ),
  -- Status display logic (calculated once, reused for status fields)
  status_display_logic AS (
    SELECT
      p."ListingKey",
      CASE
        -- Rule 2: Force PRICE REDUCED if price dropped
        WHEN p."OriginalListPrice" IS NOT NULL
         AND p."ListPrice" IS NOT NULL
         AND p."OriginalListPrice" > p."ListPrice"
          THEN 'Price Reduced'
        -- Rule 1: Status = New → show TransactionType instead
        WHEN p."MlsStatus" = 'New'
          THEN COALESCE(p."TransactionType", 'New')
        -- Default: Show MLS Status
        ELSE p."MlsStatus"
      END AS "StatusValue"
    FROM "Property" p
  )

SELECT
  -- ======================
  -- IDENTIFIERS
  -- ======================
  p."ListingKey",
  p."ListingKey" AS "MLSNumber",

  -- ======================
  -- ADDRESS (NORMALIZED)
  -- ======================
  -- FullAddress (using helper function)
  public.format_full_address(
    p."UnitNumber",
    p."StreetNumber"::text,
    p."StreetName",
    p."StreetSuffix",
    p."City",
    p."StateOrProvince",
    p."PostalCode"
  ) AS "FullAddress",
  -- City (normalized)
  public.normalize_city_name(p."City") AS "City",
  p."StateOrProvince",

  -- ======================
  -- COORDINATES (GEOCODING)
  -- ======================
  p."Latitude",
  p."Longitude",

  -- ======================
  -- STATUS
  -- ======================
  sdl."StatusValue" AS "MlsStatus",

  -- ======================
  -- PROPERTY TYPE
  -- ======================
  -- ArchitecturalStyle → PropertySubType
  CASE
    WHEN p."ArchitecturalStyle" IS NULL THEN NULL
    WHEN ARRAY_LENGTH(p."ArchitecturalStyle"::text[], 1) IS NULL OR ARRAY_LENGTH(p."ArchitecturalStyle"::text[], 1) = 0 THEN NULL
    ELSE ARRAY_TO_STRING(
           ARRAY(
             SELECT INITCAP(TRIM(x))
             FROM unnest(p."ArchitecturalStyle"::text[]) x
             WHERE lower(trim(x)) NOT IN ('none','unknown','n/a','')
           ), ', '
         )
  END AS "PropertySubType",

  -- ======================
  -- PRICING (RAW NUMERIC)
  -- ======================
  -- ListPrice as numeric (for filtering and calculations)
  CASE WHEN p."ListPrice" > 0 THEN p."ListPrice" ELSE NULL END AS "ListPrice",

  -- ======================
  -- ROOMS (DISPLAY FORMATS)
  -- ======================
  -- BedroomsDisplay (using helper function)
  public.format_bedrooms_display(
    p."BedroomsAboveGrade"::integer, 
    p."BedroomsBelowGrade"::integer
  ) AS "BedroomsDisplay",
  -- BathroomsDisplay (using helper function)
  public.format_bathrooms_display(p."BathroomsTotalInteger") AS "BathroomsDisplay",

  -- ======================
  -- LIVING AREA (MIN/MAX NUMERICS)
  -- ======================
  -- LivingAreaMin (using helper function)
  public.parse_living_area_min(p."LivingAreaRange") AS "LivingAreaMin",
  -- LivingAreaMax (using helper function)
  public.parse_living_area_max(p."LivingAreaRange") AS "LivingAreaMax",

  -- ======================
  -- PARKING (RAW NUMERIC)
  -- ======================
  -- Parking fields for calculations
  CASE
    WHEN p."CoveredSpaces" >= 0 THEN p."CoveredSpaces"
    ELSE NULL
  END AS "CoveredSpaces",
  CASE
    WHEN p."ParkingSpaces" >= 0 THEN p."ParkingSpaces"
    ELSE NULL
  END AS "ParkingSpaces",
  -- ParkingTotal: Calculated as sum of CoveredSpaces (garage) and ParkingSpaces (driveway)
  CASE
    WHEN p."CoveredSpaces" IS NULL AND p."ParkingSpaces" IS NULL THEN NULL
    WHEN (COALESCE(p."CoveredSpaces", 0) + COALESCE(p."ParkingSpaces", 0)) >= 0 
      THEN (COALESCE(p."CoveredSpaces", 0) + COALESCE(p."ParkingSpaces", 0))
    ELSE NULL
  END AS "ParkingTotal",

  -- ======================
  -- LISTING TIMESTAMP
  -- ======================
  p."OriginalEntryTimestamp" AS "ListedAt",
  p."OriginalEntryTimestamp",

  -- ======================
  -- MEDIA
  -- ======================
  mp."PrimaryImageUrl"

FROM "Property" p
LEFT JOIN media_primary mp ON mp."ListingKey" = p."ListingKey"
LEFT JOIN status_display_logic sdl ON sdl."ListingKey" = p."ListingKey";

-- =====================================================
-- INDEX CREATION
-- =====================================================
-- Drop existing indexes
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'PropertyInfoPopupView'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I;', rec.indexname);
  END LOOP;
END $$;

-- =====================================================
-- UNIQUE INDEX (REQUIRED FOR CONCURRENT REFRESH)
-- =====================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipv_unique_listingkey
  ON public."PropertyInfoPopupView" ("ListingKey");

-- =====================================================
-- MAP BOUNDS FILTERING INDEXES (HIGH PRIORITY)
-- =====================================================
-- These indexes are critical for fast map queries with bounds filtering
CREATE INDEX IF NOT EXISTS idx_pipv_latitude
  ON public."PropertyInfoPopupView" ("Latitude")
  WHERE "Latitude" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pipv_longitude
  ON public."PropertyInfoPopupView" ("Longitude")
  WHERE "Longitude" IS NOT NULL;

-- Composite index for bounds queries (most efficient for map queries)
CREATE INDEX IF NOT EXISTS idx_pipv_coordinates
  ON public."PropertyInfoPopupView" ("Latitude", "Longitude")
  WHERE "Latitude" IS NOT NULL AND "Longitude" IS NOT NULL;

-- =====================================================
-- FILTER INDEXES (MEDIUM PRIORITY)
-- =====================================================
-- Status filter (commonly used in map queries)
CREATE INDEX IF NOT EXISTS idx_pipv_mlsstatus
  ON public."PropertyInfoPopupView" ("MlsStatus")
  WHERE "MlsStatus" IS NOT NULL;

-- Price filter (for price range filtering)
CREATE INDEX IF NOT EXISTS idx_pipv_listprice
  ON public."PropertyInfoPopupView" ("ListPrice")
  WHERE "ListPrice" IS NOT NULL;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON MATERIALIZED VIEW public."PropertyInfoPopupView" IS 
  'Lightweight view for map popup/hover displays. Contains only essential fields needed for map markers and popups. Optimized for fast map queries with bounds filtering.';

COMMENT ON COLUMN public."PropertyInfoPopupView"."ListingKey" IS 'Primary identifier for the property listing';
COMMENT ON COLUMN public."PropertyInfoPopupView"."MLSNumber" IS 'MLS number (same as ListingKey)';
COMMENT ON COLUMN public."PropertyInfoPopupView"."FullAddress" IS 'Formatted full address string';
COMMENT ON COLUMN public."PropertyInfoPopupView"."City" IS 'Normalized city name';
COMMENT ON COLUMN public."PropertyInfoPopupView"."StateOrProvince" IS 'State or province code';
COMMENT ON COLUMN public."PropertyInfoPopupView"."Latitude" IS 'Property latitude coordinate (for map bounds filtering)';
COMMENT ON COLUMN public."PropertyInfoPopupView"."Longitude" IS 'Property longitude coordinate (for map bounds filtering)';
COMMENT ON COLUMN public."PropertyInfoPopupView"."MlsStatus" IS 'MLS status (with display logic applied)';
COMMENT ON COLUMN public."PropertyInfoPopupView"."PropertySubType" IS 'Property subtype (from ArchitecturalStyle)';
COMMENT ON COLUMN public."PropertyInfoPopupView"."ListPrice" IS 'List price as numeric (for filtering)';
COMMENT ON COLUMN public."PropertyInfoPopupView"."BedroomsDisplay" IS 'Formatted bedrooms display string';
COMMENT ON COLUMN public."PropertyInfoPopupView"."BathroomsDisplay" IS 'Formatted bathrooms display string';
COMMENT ON COLUMN public."PropertyInfoPopupView"."LivingAreaMin" IS 'Minimum living area in square feet';
COMMENT ON COLUMN public."PropertyInfoPopupView"."LivingAreaMax" IS 'Maximum living area in square feet';
COMMENT ON COLUMN public."PropertyInfoPopupView"."CoveredSpaces" IS 'Number of covered/garage parking spaces';
COMMENT ON COLUMN public."PropertyInfoPopupView"."ParkingSpaces" IS 'Number of uncovered parking spaces';
COMMENT ON COLUMN public."PropertyInfoPopupView"."ParkingTotal" IS 'Total parking spaces (CoveredSpaces + ParkingSpaces)';
COMMENT ON COLUMN public."PropertyInfoPopupView"."ListedAt" IS 'Original entry timestamp (for listing date)';
COMMENT ON COLUMN public."PropertyInfoPopupView"."PrimaryImageUrl" IS 'Primary image URL for the property';

