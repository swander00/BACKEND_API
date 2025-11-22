/**
 * TEST SCRIPT: Diagnose Removed Status Filter Issue
 * 
 * Run this with: node test-removed-filter.js
 * 
 * This will test the removed status filter directly and show exactly what's happening
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Load environment variables - try .env.local first, then .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envLocalPath = join(__dirname, '.env.local');
const envPath = join(__dirname, '.env');

// Try .env.local first, then fall back to .env
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
  console.log('Loaded .env.local');
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('Loaded .env');
} else {
  // Try default dotenv behavior
  dotenv.config();
}

import { initDB } from './db/client.js';
import { queryPropertyCards } from './services/propertyQueries.js';

async function testRemovedFilter() {
  console.log('='.repeat(80));
  console.log('TESTING REMOVED STATUS FILTER');
  console.log('='.repeat(80));
  console.log('');

  // Check if environment variables are loaded
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ ERROR: Environment variables not loaded!');
    console.error('Make sure you have a .env file with:');
    console.error('  - SUPABASE_URL');
    console.error('  - SUPABASE_SERVICE_ROLE_KEY');
    console.error('');
    console.error('Current env vars:');
    console.error('  SUPABASE_URL:', process.env.SUPABASE_URL ? '✓ Set' : '✗ Missing');
    console.error('  SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ Set' : '✗ Missing');
    process.exit(1);
  }

  console.log('✓ Environment variables loaded');
  console.log('  SUPABASE_URL:', process.env.SUPABASE_URL.substring(0, 30) + '...');
  console.log('');

  const db = initDB();

  // TEST 1: Direct database query with .in() method
  console.log('TEST 1: Direct query with .in() method');
  console.log('-'.repeat(80));
  try {
    const directQuery = db
      .from('PropertyView')
      .select('*', { count: 'exact' })
      .in('MlsStatus', ['Terminated', 'Expired', 'Suspended', 'Cancelled', 'Withdrawn'])
      .limit(5);

    console.log('Executing query...');
    const directResult = await directQuery;
    
    console.log('Result:', {
      hasError: !!directResult.error,
      error: directResult.error?.message || 'NONE',
      errorCode: directResult.error?.code || 'NONE',
      errorDetails: directResult.error?.details || 'NONE',
      count: directResult.count,
      dataLength: directResult.data?.length || 0,
      sampleStatuses: directResult.data?.slice(0, 5).map(p => p?.MlsStatus) || []
    });

    if (directResult.data && directResult.data.length > 0) {
      console.log('✓ SUCCESS: Direct query works!');
      console.log('Sample property:', {
        ListingKey: directResult.data[0].ListingKey,
        MlsStatus: directResult.data[0].MlsStatus,
        FullAddress: directResult.data[0].FullAddress
      });
    } else {
      console.log('✗ FAILED: Direct query returned no results');
    }
  } catch (error) {
    console.error('✗ ERROR in direct query:', error.message);
    console.error(error.stack);
  }
  console.log('');

  // TEST 2: Query with .or() and PostgREST syntax
  console.log('TEST 2: Query with .or() and PostgREST syntax');
  console.log('-'.repeat(80));
  try {
    const orQuery = db
      .from('PropertyView')
      .select('*', { count: 'exact' })
      .or('MlsStatus.eq."Terminated",MlsStatus.eq."Expired",MlsStatus.eq."Suspended",MlsStatus.eq."Cancelled",MlsStatus.eq."Withdrawn"')
      .limit(5);

    console.log('Executing query...');
    const orResult = await orQuery;
    
    console.log('Result:', {
      hasError: !!orResult.error,
      error: orResult.error?.message || 'NONE',
      errorCode: orResult.error?.code || 'NONE',
      count: orResult.count,
      dataLength: orResult.data?.length || 0,
      sampleStatuses: orResult.data?.slice(0, 5).map(p => p?.MlsStatus) || []
    });

    if (orResult.data && orResult.data.length > 0) {
      console.log('✓ SUCCESS: .or() query works!');
    } else {
      console.log('✗ FAILED: .or() query returned no results');
    }
  } catch (error) {
    console.error('✗ ERROR in .or() query:', error.message);
    console.error(error.stack);
  }
  console.log('');

  // TEST 3: Check what statuses actually exist in the database
  console.log('TEST 3: Check actual MlsStatus values in database');
  console.log('-'.repeat(80));
  try {
    const statusQuery = db
      .from('PropertyView')
      .select('MlsStatus')
      .in('MlsStatus', ['Terminated', 'Expired', 'Suspended', 'Cancelled', 'Withdrawn'])
      .limit(20);

    const statusResult = await statusQuery;
    
    if (statusResult.data && statusResult.data.length > 0) {
      const uniqueStatuses = [...new Set(statusResult.data.map(p => p.MlsStatus))];
      console.log('Found statuses:', uniqueStatuses);
      console.log('Count of each:', uniqueStatuses.map(s => ({
        status: s,
        count: statusResult.data.filter(p => p.MlsStatus === s).length
      })));
      console.log('✓ SUCCESS: Found removed statuses in database');
    } else {
      console.log('✗ FAILED: No removed statuses found');
    }
  } catch (error) {
    console.error('✗ ERROR checking statuses:', error.message);
  }
  console.log('');

  // TEST 4: Test the full queryPropertyCards function
  console.log('TEST 4: Test queryPropertyCards function with removed status');
  console.log('-'.repeat(80));
  try {
    const result = await queryPropertyCards({
      filters: {
        status: 'removed'
      },
      pagination: {
        page: 1,
        pageSize: 24
      },
      sortBy: 'newest'
    });

    console.log('Result:', {
      totalCount: result.totalCount,
      propertiesLength: result.properties?.length || 0,
      pagination: result.pagination,
      sampleStatuses: result.properties?.slice(0, 5).map(p => p?.MlsStatus || p?.status) || []
    });

    if (result.properties && result.properties.length > 0) {
      console.log('✓ SUCCESS: queryPropertyCards works!');
      console.log('First property:', {
        ListingKey: result.properties[0].listingKey || result.properties[0].ListingKey,
        MlsStatus: result.properties[0].mlsStatus || result.properties[0].MlsStatus || result.properties[0].status,
        FullAddress: result.properties[0].fullAddress || result.properties[0].FullAddress
      });
    } else {
      console.log('✗ FAILED: queryPropertyCards returned no results');
    }
  } catch (error) {
    console.error('✗ ERROR in queryPropertyCards:', error.message);
    console.error(error.stack);
  }
  console.log('');

  // TEST 5: Compare with working status (sold)
  console.log('TEST 5: Compare with working status filter (sold)');
  console.log('-'.repeat(80));
  try {
    const soldResult = await queryPropertyCards({
      filters: {
        status: 'sold'
      },
      pagination: {
        page: 1,
        pageSize: 5
      },
      sortBy: 'newest'
    });

    console.log('Sold status result:', {
      totalCount: soldResult.totalCount,
      propertiesLength: soldResult.properties?.length || 0
    });

    if (soldResult.properties && soldResult.properties.length > 0) {
      console.log('✓ Sold filter works (for comparison)');
    }
  } catch (error) {
    console.error('✗ ERROR testing sold filter:', error.message);
  }
  console.log('');

  console.log('='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80));
}

// Run the test
testRemovedFilter()
  .then(() => {
    console.log('\nTest script finished. Check the results above.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nFatal error:', error);
    process.exit(1);
  });

