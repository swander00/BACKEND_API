# Materialized Views Setup Guide

This guide explains how to set up the materialized views required for the API to function.

## Problem

The API requires several materialized views to exist in the database:
- `PropertyView` - Main unified view for property data
- `RoomDetailsView` - Room information with features
- `PropertyEngagementView` - User engagement metrics
- `PropertySuggestionView` - Autocomplete suggestions
- `PropertyInfoPopupView` - Map popup data
- `PropertyFilterView` - Filter aggregations

If these views don't exist, you'll see errors like:
```
Could not find the table 'public.PropertyCardView' in the schema cache
```

## Solution

### Option 1: Automated Setup Script (Recommended)

Run the setup script to create all views automatically:

```bash
cd API_BACK_END
node scripts/setup-views.js
```

**Prerequisites:**
- `DATABASE_URL` environment variable must be set in `.env.local` or `environment.env`
- Database connection must be accessible
- Helper functions will be created automatically

**What it does:**
1. Creates helper functions from `PropertyViewCalculationHelpers.sql`
2. Creates `PropertyEngagementView` (stub version)
3. Creates `PropertyView` (main unified view)
4. Creates `RoomDetailsView`
5. Creates stub views (`PropertySuggestionView`, `PropertyInfoPopupView`, `PropertyFilterView`)
6. Refreshes all views
7. Reloads PostgREST schema cache

### Option 2: Manual Setup via Supabase Dashboard

If the automated script fails, you can create views manually:

1. **Open Supabase Dashboard** → Your Project → SQL Editor

2. **Create helper functions:**
   - Copy contents of `docs/Database scripts/PropertyViewCalculationHelpers.sql`
   - Paste and execute in SQL Editor

3. **Create PropertyEngagementView:**
   ```sql
   CREATE MATERIALIZED VIEW public."PropertyEngagementView" AS
   SELECT 
     p."ListingKey",
     0 AS "ViewCount",
     0 AS "SaveCount",
     0 AS "TotalViews",
     0 AS "TotalSaves",
     0 AS "TotalLikes",
     0 AS "TodayViewCount",
     0 AS "TodaySaveCount",
     0 AS "TodayViewsApprox",
     0 AS "TodaySaves",
     0 AS "TodayLikes"
   FROM public."Property" p;
   
   CREATE UNIQUE INDEX idx_pev_listingkey
     ON public."PropertyEngagementView" ("ListingKey");
   ```

4. **Create PropertyView:**
   - Copy contents of `docs/Database scripts/PropertyView.sql`
   - Paste and execute in SQL Editor
   - **Note:** If you see errors about `PriceReductionHistory` table, you can either:
     - Create a stub table: `CREATE TABLE IF NOT EXISTS "PriceReductionHistory" ("ListingKey" TEXT, "PriceReductionAmount" NUMERIC, "PriceReductionPercent" NUMERIC, "ReductionNumber" INTEGER, "PriceChangeTimestamp" TIMESTAMP);`
     - Or modify the CTE in PropertyView.sql to handle missing table

5. **Create RoomDetailsView:**
   - Copy contents of `docs/Database scripts/RoomDetailsView.sql`
   - Paste and execute in SQL Editor

6. **Create stub views:**
   - Run the SQL from the `createStubViews()` function in `setup-views.js`

7. **Refresh all views:**
   ```sql
   REFRESH MATERIALIZED VIEW CONCURRENTLY public."PropertyEngagementView";
   REFRESH MATERIALIZED VIEW CONCURRENTLY public."PropertyView";
   REFRESH MATERIALIZED VIEW CONCURRENTLY public."RoomDetailsView";
   REFRESH MATERIALIZED VIEW CONCURRENTLY public."PropertySuggestionView";
   REFRESH MATERIALIZED VIEW CONCURRENTLY public."PropertyInfoPopupView";
   REFRESH MATERIALIZED VIEW CONCURRENTLY public."PropertyFilterView";
   ```

8. **Reload PostgREST schema cache:**
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```

## Troubleshooting

### Error: "relation PriceReductionHistory does not exist"

The `PropertyView` references a `PriceReductionHistory` table that may not exist. Solutions:

1. **Create stub table:**
   ```sql
   CREATE TABLE IF NOT EXISTS "PriceReductionHistory" (
     "ListingKey" TEXT,
     "PriceReductionAmount" NUMERIC,
     "PriceReductionPercent" NUMERIC,
     "ReductionNumber" INTEGER,
     "PriceChangeTimestamp" TIMESTAMP
   );
   ```

2. **Or modify PropertyView.sql** to use LEFT JOIN and handle NULLs:
   ```sql
   -- In the latestpricereduction CTE, change FROM to LEFT JOIN
   ```

### Error: "materialized view does not exist"

Make sure you've created all views before trying to refresh them. Check the order:
1. PropertyEngagementView (no dependencies)
2. PropertyView (depends on PropertyEngagementView)
3. RoomDetailsView (no dependencies)
4. PropertySuggestionView (depends on PropertyView)
5. PropertyInfoPopupView (depends on PropertyView)
6. PropertyFilterView (depends on PropertyView)

### Error: "unique index required for concurrent refresh"

Make sure each materialized view has a unique index on its primary key before using `REFRESH MATERIALIZED VIEW CONCURRENTLY`.

### PostgREST Schema Cache Not Updating

If views are created but API still returns errors:
1. Reload schema: `NOTIFY pgrst, 'reload schema';`
2. Or restart your Supabase project
3. Or wait a few minutes for automatic cache refresh

## Verification

After setup, verify views exist:

```sql
SELECT schemaname, matviewname 
FROM pg_matviews 
WHERE schemaname = 'public' 
ORDER BY matviewname;
```

You should see:
- PropertyEngagementView
- PropertyView
- RoomDetailsView
- PropertySuggestionView
- PropertyInfoPopupView
- PropertyFilterView

## Next Steps

After views are created:
1. Test API endpoints: `GET http://localhost:8080/api/properties`
2. Set up scheduled refresh (optional):
   - Set `REFRESH_MVS_INTERVAL_MS` in environment variables
   - Or use cron job to run `scripts/refresh-mvs.js` periodically

## Maintenance

Views should be refreshed periodically to reflect data changes:
- **Manual refresh:** Run `node scripts/refresh-mvs.js`
- **Automatic refresh:** Set `REFRESH_MVS_INTERVAL_MS` environment variable

