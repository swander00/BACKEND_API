-- =====================================================
-- DIAGNOSTIC QUERY: Check Removed Status Filter
-- =====================================================
-- Run this to diagnose why the "removed" filter isn't working
-- =====================================================

-- 1. Check what statuses exist in PropertyView
SELECT 
  "MlsStatus",
  COUNT(*) as count
FROM public."PropertyView"
GROUP BY "MlsStatus"
ORDER BY count DESC;

-- 2. Check specifically for removed statuses
SELECT 
  "MlsStatus",
  COUNT(*) as count
FROM public."PropertyView"
WHERE "MlsStatus" IN ('Terminated', 'Expired', 'Suspended', 'Cancelled', 'Withdrawn')
GROUP BY "MlsStatus"
ORDER BY count DESC;

-- 3. Get total count of removed properties
SELECT 
  COUNT(*) as total_removed_properties
FROM public."PropertyView"
WHERE "MlsStatus" IN ('Terminated', 'Expired', 'Suspended', 'Cancelled', 'Withdrawn');

-- 4. Sample removed properties (first 10)
SELECT 
  "ListingKey",
  "MlsStatus",
  "FullAddress",
  "ListPriceRaw"
FROM public."PropertyView"
WHERE "MlsStatus" IN ('Terminated', 'Expired', 'Suspended', 'Cancelled', 'Withdrawn')
LIMIT 10;

-- 5. Check if status values have any case/whitespace issues
SELECT DISTINCT
  "MlsStatus",
  LENGTH("MlsStatus") as status_length,
  ASCII(SUBSTRING("MlsStatus", 1, 1)) as first_char_code
FROM public."PropertyView"
WHERE UPPER(TRIM("MlsStatus")) IN ('TERMINATED', 'EXPIRED', 'SUSPENDED', 'CANCELLED', 'WITHDRAWN')
ORDER BY "MlsStatus";

-- 6. Check Property table directly (if PropertyView is missing data)
SELECT 
  "MlsStatus",
  COUNT(*) as count
FROM public."Property"
WHERE "MlsStatus" IN ('Terminated', 'Expired', 'Suspended', 'Cancelled', 'Withdrawn')
GROUP BY "MlsStatus"
ORDER BY count DESC;

-- =====================================================
-- EXPECTED RESULTS:
-- - Query 1: Should show all statuses including removed ones
-- - Query 2: Should show counts for each removed status
-- - Query 3: Should show total count > 0 if removed properties exist
-- - Query 4: Should return sample removed properties
-- - Query 5: Helps identify case/whitespace mismatches
-- - Query 6: Verifies base table has the data
-- =====================================================
-- 
-- IF NO RESULTS:
-- 1. Check if PropertyView needs to be refreshed
-- 2. Verify status values match exactly (case-sensitive)
-- 3. Check if properties with these statuses exist in Property table
-- =====================================================

