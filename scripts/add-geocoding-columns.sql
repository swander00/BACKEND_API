-- ============================================================================
-- ADD GEOCODING COLUMNS TO PROPERTY TABLE
-- ============================================================================
-- This script adds the missing Latitude, Longitude, GeocodedAt, and 
-- GeocodingStatus columns to the Property table that are referenced by PropertyView
-- ============================================================================

-- Add Latitude column (decimal degrees, e.g., 43.6532)
ALTER TABLE public."Property" 
ADD COLUMN IF NOT EXISTS "Latitude" NUMERIC(10, 8);

-- Add Longitude column (decimal degrees, e.g., -79.3832)
ALTER TABLE public."Property" 
ADD COLUMN IF NOT EXISTS "Longitude" NUMERIC(11, 8);

-- Add GeocodedAt timestamp (when geocoding was performed)
ALTER TABLE public."Property" 
ADD COLUMN IF NOT EXISTS "GeocodedAt" TIMESTAMPTZ;

-- Add GeocodingStatus (e.g., 'success', 'failed', 'pending', 'not_attempted')
ALTER TABLE public."Property" 
ADD COLUMN IF NOT EXISTS "GeocodingStatus" TEXT DEFAULT 'not_attempted';

-- Add indexes for efficient geocoding queries
CREATE INDEX IF NOT EXISTS idx_property_geocoding_status 
ON public."Property" ("GeocodingStatus") 
WHERE "GeocodingStatus" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_property_latitude_longitude 
ON public."Property" ("Latitude", "Longitude") 
WHERE "Latitude" IS NOT NULL AND "Longitude" IS NOT NULL;

-- Add comment to columns
COMMENT ON COLUMN public."Property"."Latitude" IS 'Latitude coordinate in decimal degrees (WGS84)';
COMMENT ON COLUMN public."Property"."Longitude" IS 'Longitude coordinate in decimal degrees (WGS84)';
COMMENT ON COLUMN public."Property"."GeocodedAt" IS 'Timestamp when geocoding was performed';
COMMENT ON COLUMN public."Property"."GeocodingStatus" IS 'Status of geocoding: not_attempted, pending, success, failed';

-- Verify columns were added
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'Property'
    AND column_name IN ('Latitude', 'Longitude', 'GeocodedAt', 'GeocodingStatus')
ORDER BY column_name;

