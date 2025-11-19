-- =====================================================
-- PROPERTY VIEW OPTIMIZATION & REFRESH HELPER
-- =====================================================
-- This script helps optimize PropertyView refresh performance
-- Run this BEFORE refreshing PropertyView if you're experiencing timeouts
-- =====================================================

-- =====================================================
-- 1. CREATE MISSING INDEXES ON BASE TABLES
-- =====================================================
-- These indexes improve CTE performance in PropertyView

-- Index for PriceReductionHistory (used in latestpricereduction CTE)
CREATE INDEX IF NOT EXISTS idx_pricereductionhistory_listingkey_timestamp 
  ON public."PriceReductionHistory" ("ListingKey", "PriceChangeTimestamp" DESC)
  WHERE "ListingKey" IS NOT NULL;

-- Index for Media table (used in media_scope CTE)
CREATE INDEX IF NOT EXISTS idx_media_active_photos 
  ON public."Media" ("ResourceRecordKey", "MediaStatus", "MediaCategory", "Order")
  WHERE COALESCE("MediaStatus", 'Active') = 'Active' 
    AND COALESCE("MediaCategory", 'Photo') = 'Photo';

-- Index for OpenHouse (used in nextopenhouse CTE)
CREATE INDEX IF NOT EXISTS idx_openhouse_listingkey_date_status 
  ON public."OpenHouse" ("ListingKey", "OpenHouseDate", "OpenHouseStartTime")
  WHERE "OpenHouseDate" IS NOT NULL 
    AND "OpenHouseStatus" IS DISTINCT FROM 'Cancelled';

-- =====================================================
-- 2. ANALYZE TABLES FOR BETTER QUERY PLANNING
-- =====================================================
-- Update statistics to help PostgreSQL choose optimal query plans
ANALYZE public."Property";
ANALYZE public."Media";
ANALYZE public."OpenHouse";
ANALYZE public."PriceReductionHistory";

-- =====================================================
-- 3. REFRESH WITH TIMEOUT HANDLING
-- =====================================================
-- Uncomment and run ONE of these options:

-- OPTION 1: Concurrent refresh with increased timeout (RECOMMENDED)
-- SET statement_timeout = '30min';
-- REFRESH MATERIALIZED VIEW CONCURRENTLY public."PropertyView";
-- RESET statement_timeout;

-- OPTION 2: Non-concurrent refresh (faster but blocks reads)
-- SET statement_timeout = '30min';
-- REFRESH MATERIALIZED VIEW public."PropertyView";
-- RESET statement_timeout;

-- OPTION 3: Check current timeout setting
-- SHOW statement_timeout;

-- =====================================================
-- 4. MONITOR REFRESH PROGRESS
-- =====================================================
-- Check if refresh is in progress:
-- SELECT * FROM pg_stat_progress_create_materialized_view;

-- Check view size:
-- SELECT pg_size_pretty(pg_total_relation_size('public."PropertyView"'));

-- =====================================================
-- NOTES:
-- - Concurrent refresh requires a unique index (already created: idx_pv_unique_listingkey)
-- - Non-concurrent refresh is faster but blocks all reads during refresh
-- - Increase timeout based on your data size (30min is usually sufficient)
-- - Monitor refresh progress using pg_stat_progress_create_materialized_view
-- =====================================================

