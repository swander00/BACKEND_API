/**
 * Geocoding Script for Property Addresses
 * 
 * This script geocodes property addresses using Google Maps Geocoding API
 * and updates the Property table with Latitude, Longitude, GeocodedAt, and GeocodingStatus.
 * 
 * Usage:
 *   node scripts/geocode-properties.js                    # Geocode all properties without coordinates
 *   node scripts/geocode-properties.js --limit=100        # Geocode first 100 properties
 *   node scripts/geocode-properties.js --retry-failed     # Retry failed geocoding attempts
 *   node scripts/geocode-properties.js --batch-size=50    # Process 50 at a time (default: 100)
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../environment.env') });

const { Client } = pg;

// Configuration
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const BATCH_SIZE = parseInt(process.env.GEOCODING_BATCH_SIZE || '100', 10);
const DELAY_BETWEEN_BATCHES_MS = 1000; // 1 second delay between batches to respect rate limits
const DELAY_BETWEEN_REQUESTS_MS = 100; // 100ms delay between individual requests

// Parse command line arguments
const args = process.argv.slice(2);
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
const retryFailed = args.includes('--retry-failed');
const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : BATCH_SIZE;

if (!GOOGLE_MAPS_API_KEY) {
  console.error('❌ Error: GOOGLE_MAPS_API_KEY not found in environment variables');
  console.error('   Please set GOOGLE_MAPS_API_KEY in environment.env');
  process.exit(1);
}

/**
 * Build full address string for geocoding
 */
function buildAddressString(property) {
  const parts = [];
  
  if (property.StreetNumber) parts.push(property.StreetNumber);
  if (property.StreetName) parts.push(property.StreetName);
  if (property.StreetSuffix) parts.push(property.StreetSuffix);
  if (property.UnitNumber) parts.push(`Unit ${property.UnitNumber}`);
  
  const street = parts.join(' ').trim();
  if (street) parts.push(street);
  
  if (property.City) parts.push(property.City);
  if (property.StateOrProvince) parts.push(property.StateOrProvince);
  if (property.PostalCode) parts.push(property.PostalCode);
  
  // Fallback to UnparsedAddress if available
  if (parts.length === 0 && property.UnparsedAddress) {
    return property.UnparsedAddress;
  }
  
  return parts.join(', ');
}

/**
 * Geocode a single address using Google Maps Geocoding API
 */
async function geocodeAddress(address) {
  if (!address || address.trim() === '') {
    return { success: false, error: 'Empty address' };
  }

  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_MAPS_API_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return {
        success: true,
        latitude: location.lat,
        longitude: location.lng,
        formattedAddress: data.results[0].formatted_address,
        locationType: data.results[0].geometry.location_type,
      };
    } else if (data.status === 'ZERO_RESULTS') {
      return { success: false, error: 'No results found' };
    } else if (data.status === 'OVER_QUERY_LIMIT') {
      return { success: false, error: 'API quota exceeded', retry: true };
    } else {
      return { success: false, error: `API error: ${data.status}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Update property with geocoding results
 */
async function updatePropertyGeocoding(client, listingKey, result) {
  if (result.success) {
    await client.query(
      `UPDATE public."Property" 
       SET "Latitude" = $1, 
           "Longitude" = $2, 
           "GeocodedAt" = NOW(), 
           "GeocodingStatus" = 'success'
       WHERE "ListingKey" = $3`,
      [result.latitude, result.longitude, listingKey]
    );
  } else {
    await client.query(
      `UPDATE public."Property" 
       SET "GeocodedAt" = NOW(), 
           "GeocodingStatus" = $1
       WHERE "ListingKey" = $2`,
      [result.retry ? 'pending' : 'failed', listingKey]
    );
  }
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main geocoding function
 */
async function geocodeProperties() {
  // Try to get database connection string
  let connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  
  // If DATABASE_URL has placeholder, try to construct from Supabase credentials
  if (!connectionString || connectionString.includes('[YOUR-PASSWORD]')) {
    console.error('❌ Error: DATABASE_URL not configured or contains placeholder');
    console.error('\n📋 To fix this:');
    console.error('   1. Go to Supabase Dashboard: https://supabase.com/dashboard');
    console.error('   2. Select your project');
    console.error('   3. Go to: Settings > Database');
    console.error('   4. Find "Connection string" section');
    console.error('   5. Copy the "URI" connection string (starts with postgres://)');
    console.error('   6. Add it to environment.env as DATABASE_URL');
    console.error('\n   Example:');
    console.error('   DATABASE_URL=postgres://postgres.xxxxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres');
    console.error('\n   Or use the "Connection pooling" URI with transaction mode');
    process.exit(1);
  }

  const client = new Client({
    connectionString: connectionString,
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Check if columns exist
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'Property' 
        AND column_name IN ('Latitude', 'Longitude', 'GeocodedAt', 'GeocodingStatus')
    `);

    if (columnCheck.rows.length < 4) {
      console.error('❌ Error: Geocoding columns not found in Property table');
      console.error('   Please run: psql -f scripts/add-geocoding-columns.sql');
      console.error('   Or execute the SQL in scripts/add-geocoding-columns.sql manually');
      process.exit(1);
    }

    // Build query to get properties that need geocoding
    let query = `
      SELECT 
        "ListingKey",
        "StreetNumber",
        "StreetName",
        "StreetSuffix",
        "UnitNumber",
        "City",
        "StateOrProvince",
        "PostalCode",
        "UnparsedAddress",
        "Latitude",
        "Longitude",
        "GeocodingStatus"
      FROM public."Property"
      WHERE 1=1
    `;

    if (retryFailed) {
      query += ` AND "GeocodingStatus" IN ('failed', 'pending')`;
    } else {
      query += ` AND ("Latitude" IS NULL OR "Longitude" IS NULL OR "GeocodingStatus" = 'not_attempted')`;
    }

    query += ` ORDER BY "ListingKey"`;

    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    const result = await client.query(query);
    const properties = result.rows;

    if (properties.length === 0) {
      console.log('✅ No properties need geocoding');
      return;
    }

    console.log(`📍 Found ${properties.length} properties to geocode\n`);

    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;

    // Process in batches
    for (let i = 0; i < properties.length; i += batchSize) {
      const batch = properties.slice(i, i + batchSize);
      console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} properties)...`);

      for (const property of batch) {
        // Skip if already geocoded successfully
        if (property.Latitude && property.Longitude && property.GeocodingStatus === 'success' && !retryFailed) {
          skipCount++;
          continue;
        }

        const address = buildAddressString(property);
        
        if (!address || address.trim() === '') {
          console.log(`  ⚠️  Skipping ${property.ListingKey}: No address available`);
          await updatePropertyGeocoding(client, property.ListingKey, { success: false, error: 'No address' });
          failCount++;
          continue;
        }

        console.log(`  🔍 Geocoding: ${address.substring(0, 60)}...`);

        const geocodeResult = await geocodeAddress(address);

        if (geocodeResult.success) {
          await updatePropertyGeocoding(client, property.ListingKey, geocodeResult);
          console.log(`     ✅ ${property.ListingKey}: ${geocodeResult.latitude}, ${geocodeResult.longitude}`);
          successCount++;
        } else {
          await updatePropertyGeocoding(client, property.ListingKey, geocodeResult);
          console.log(`     ❌ ${property.ListingKey}: ${geocodeResult.error}`);
          failCount++;
        }

        // Rate limiting delay
        await sleep(DELAY_BETWEEN_REQUESTS_MS);
      }

      // Delay between batches
      if (i + batchSize < properties.length) {
        console.log(`\n⏳ Waiting ${DELAY_BETWEEN_BATCHES_MS}ms before next batch...`);
        await sleep(DELAY_BETWEEN_BATCHES_MS);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Geocoding Summary:');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed:  ${failCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log(`   📍 Total:   ${properties.length}`);
    console.log('='.repeat(60));

    // Refresh PropertyView to include new coordinates
    console.log('\n🔄 Refreshing PropertyView...');
    try {
      await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY public."PropertyView"`);
      console.log('✅ PropertyView refreshed');
    } catch (error) {
      console.warn('⚠️  Could not refresh PropertyView concurrently, trying non-concurrent refresh...');
      try {
        await client.query(`REFRESH MATERIALIZED VIEW public."PropertyView"`);
        console.log('✅ PropertyView refreshed (non-concurrent)');
      } catch (refreshError) {
        console.error('❌ Error refreshing PropertyView:', refreshError.message);
        console.error('   You may need to refresh it manually: REFRESH MATERIALIZED VIEW public."PropertyView"');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await client.end();
    console.log('\n✅ Database connection closed');
  }
}

// Run geocoding
geocodeProperties().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

