# Geocoding Setup Guide

This guide explains how to add latitude and longitude coordinates to properties in the database.

## Problem

The `PropertyView` references `Latitude`, `Longitude`, `GeocodedAt`, and `GeocodingStatus` columns from the `Property` table, but these columns don't exist yet. This causes all properties to appear at the same location on the map (forming a horizontal line).

## Solution

1. Add the missing columns to the `Property` table
2. Geocode property addresses using Google Maps Geocoding API
3. Refresh the `PropertyView` to include the new coordinates

## Step 1: Add Geocoding Columns

Run the SQL script to add the required columns:

```bash
# Using psql
psql $DATABASE_URL -f scripts/add-geocoding-columns.sql

# Or execute the SQL manually in your database client
```

This will add:
- `Latitude` (NUMERIC) - Latitude coordinate in decimal degrees
- `Longitude` (NUMERIC) - Longitude coordinate in decimal degrees  
- `GeocodedAt` (TIMESTAMPTZ) - When geocoding was performed
- `GeocodingStatus` (TEXT) - Status: 'not_attempted', 'pending', 'success', 'failed'

## Step 2: Set Up Google Maps API Key

Make sure you have a Google Maps Geocoding API key:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the "Geocoding API"
3. Create an API key
4. Add it to `environment.env`:

```env
GOOGLE_MAPS_API_KEY=your_api_key_here
```

**Note:** The Geocoding API has usage limits. For large datasets, consider:
- Using a paid plan
- Processing in batches
- Adding delays between requests

## Step 3: Run Geocoding Script

Geocode all properties without coordinates:

```bash
# Geocode all properties without coordinates
npm run geocode

# Geocode first 100 properties (for testing)
npm run geocode -- --limit=100

# Retry failed geocoding attempts
npm run geocode -- --retry-failed

# Process in smaller batches (default: 100)
npm run geocode -- --batch-size=50
```

Or run directly:

```bash
node scripts/geocode-properties.js
node scripts/geocode-properties.js --limit=100
node scripts/geocode-properties.js --retry-failed
node scripts/geocode-properties.js --batch-size=50
```

## Step 4: Verify Coordinates

Check that coordinates were added:

```sql
-- Check geocoding status
SELECT 
  "GeocodingStatus",
  COUNT(*) as count
FROM public."Property"
GROUP BY "GeocodingStatus";

-- Check sample coordinates
SELECT 
  "ListingKey",
  "City",
  "Latitude",
  "Longitude",
  "GeocodedAt"
FROM public."Property"
WHERE "Latitude" IS NOT NULL
LIMIT 10;
```

## Step 5: Refresh PropertyView

The geocoding script automatically refreshes `PropertyView`, but you can also refresh manually:

```bash
npm run refresh:mvs
```

Or in SQL:

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY public."PropertyView";
```

## Troubleshooting

### All properties still show same coordinates

1. Check if columns were added:
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'Property' 
   AND column_name IN ('Latitude', 'Longitude');
   ```

2. Check geocoding status:
   ```sql
   SELECT "GeocodingStatus", COUNT(*) 
   FROM public."Property" 
   GROUP BY "GeocodingStatus";
   ```

3. Verify PropertyView includes coordinates:
   ```sql
   SELECT "Latitude", "Longitude" 
   FROM public."PropertyView" 
   LIMIT 5;
   ```

### API Quota Exceeded

If you hit Google Maps API limits:
- Wait for quota reset (usually daily)
- Upgrade to a paid plan
- Process in smaller batches with longer delays
- Use `--retry-failed` to retry failed attempts later

### Geocoding Fails

Common reasons:
- Invalid or incomplete addresses
- API key not configured
- Network issues
- API quota exceeded

Check the console output for specific error messages.

## Cost Considerations

Google Maps Geocoding API pricing (as of 2024):
- First 40,000 requests/month: Free
- Additional requests: $5 per 1,000 requests

For 5,000 properties:
- Cost: ~$0 (within free tier)
- Time: ~10-15 minutes (with rate limiting)

## Next Steps

After geocoding:
1. Verify coordinates appear correctly on the map
2. Set up a cron job to geocode new properties automatically
3. Consider caching geocoding results to avoid re-geocoding unchanged addresses

