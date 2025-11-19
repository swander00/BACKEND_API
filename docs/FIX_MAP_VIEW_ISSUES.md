# Fix Map View Issues

This document explains how to fix the map view issues you're experiencing.

## Issues Identified

1. **PropertySuggestionView missing** - Causing 500 errors on `/api/search`
2. **Missing coordinates** - Some properties don't have geocoded coordinates
3. **Google Maps API configuration** - Invalid API key or Map ID

## Solutions

### 1. Create PropertySuggestionView

The search endpoint requires `PropertySuggestionView` which doesn't exist yet. To create it:

```bash
cd BACKEND_API
node scripts/setup-property-suggestion-view.js
```

This will:
- Create the `PropertySuggestionView` materialized view
- Refresh it with current data
- Reload the PostgREST schema cache so Supabase recognizes it

**Note:** This view depends on `PropertyView`, so make sure `PropertyView` exists first. If it doesn't, run:
```bash
node scripts/setup-views.js
```

### 2. Handle Missing Coordinates

Properties without coordinates are already handled gracefully by the MapView component - it uses fallback coordinates (offset grid) for properties without valid lat/lng.

However, to properly geocode properties:

1. **Geocode all properties without coordinates:**
   ```bash
   cd BACKEND_API
   node scripts/geocode-properties.js
   ```

2. **Refresh PropertyView** to include new coordinates:
   ```bash
   node scripts/refresh-mvs.js
   ```

3. **Verify coordinates** in the database:
   ```sql
   SELECT "ListingKey", "FullAddress", "Latitude", "Longitude" 
   FROM "PropertyView" 
   WHERE "Latitude" IS NULL OR "Longitude" IS NULL 
   LIMIT 10;
   ```

### 3. Fix Google Maps API Configuration

The error `InvalidKeyMapError` indicates either:
- The API key is invalid/missing
- The Map ID is set to `DEMO_MAP_ID` (which is not valid)

**To fix:**

1. **Check your `.env.local` file** in `FRONTEND_API`:
   ```env
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-actual-api-key-here
   NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=your-actual-map-id-here
   ```

2. **Get a valid Google Maps API key:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Enable Maps JavaScript API
   - Create credentials (API key)
   - Restrict the key to your domain

3. **Get a valid Map ID (optional, for Advanced Markers):**
   - In Google Cloud Console, go to Maps > Map Styles
   - Create a new map style or use an existing one
   - Copy the Map ID
   - Add it to `.env.local` as `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`

4. **If you don't have a Map ID:**
   - Remove `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` from `.env.local` OR
   - Set it to an empty string
   - The MapView will automatically fall back to regular markers (which work fine)

5. **Restart your Next.js dev server** after changing environment variables:
   ```bash
   # Stop the server (Ctrl+C)
   # Start it again
   npm run dev
   ```

## Verification

After applying these fixes:

1. **Test search endpoint:**
   ```bash
   curl http://localhost:8080/api/search?q=toronto&limit=5
   ```
   Should return results without 500 errors.

2. **Check map view:**
   - Open your app in the browser
   - Navigate to a page with the map view
   - Check browser console - should not see `InvalidKeyMapError`
   - Map should load and show property markers

3. **Verify coordinates:**
   - Check browser console for `[useProperties] Property X missing coordinates` warnings
   - If you see warnings, run the geocoding script (step 2 above)

## Additional Notes

- The MapView component already handles missing coordinates gracefully with fallback positions
- Advanced Markers (with custom pins) require a valid Map ID, but regular markers work without it
- The search endpoint will work once PropertySuggestionView is created
- Coordinate geocoding is optional but recommended for accurate map display

