// ============================================================================
// DIAGNOSTIC SCRIPT: Test Listing History Population
// ============================================================================
// This script helps diagnose why ListingHistoryFields and ListingPeriods
// tables are not being populated.
// ============================================================================

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables - try .env.local first, then environment.env
const envLocalPath = join(__dirname, '../.env.local');
const envPath = join(__dirname, '../environment.env');

// Try .env.local first, then fall back to environment.env
dotenv.config({ path: envLocalPath });
if (!process.env.SUPABASE_URL && !process.env.PORT) {
  dotenv.config({ path: envPath });
}

import { initDB } from '../db/client.js';
import { processPropertyListingHistory } from '../services/listingHistoryService.js';
import { Logger } from '../utils/logger.js';

async function testListingHistory() {
  try {
    console.log('\n🔍 Listing History Diagnostic Script\n');
    console.log('=' .repeat(60));
    
    const db = initDB();
    
    // Step 1: Check if tables exist
    console.log('\n[1] Checking if tables exist...');
    const tables = ['ListingHistoryFields', 'ListingPeriods', 'PriceChanges'];
    
    for (const tableName of tables) {
      try {
        const { count, error } = await db
          .from(tableName)
          .select('*', { count: 'exact', head: true });
        
        if (error) {
          const errorMsg = error.message?.toLowerCase() || '';
          if (error.code === '42P01' || 
              errorMsg.includes('does not exist') || 
              (errorMsg.includes('relation') && errorMsg.includes('not found'))) {
            console.log(`  ❌ Table "${tableName}" does NOT exist`);
            console.log(`     → Run the SQL migrations in docs/Database scripts/RUN_IN_SUPABASE.md`);
          } else {
            console.log(`  ⚠️  Error checking "${tableName}": ${error.message}`);
          }
        } else {
          console.log(`  ✅ Table "${tableName}" exists`);
        }
      } catch (error) {
        console.log(`  ❌ Exception checking "${tableName}": ${error.message}`);
      }
    }
    
    // Step 2: Check if we have any properties to process
    console.log('\n[2] Checking available properties...');
    try {
      const { data: properties, error } = await db
        .from('Property')
        .select('ListingKey, UnparsedAddress, OriginalEntryTimestamp, ModificationTimestamp, ListPrice, MlsStatus')
        .limit(5);
      
      if (error) {
        console.log(`  ❌ Error fetching properties: ${error.message}`);
      } else if (!properties || properties.length === 0) {
        console.log(`  ⚠️  No properties found in Property table`);
      } else {
        console.log(`  ✅ Found ${properties.length} properties (showing first 5)`);
        properties.forEach((p, i) => {
          console.log(`\n     Property ${i + 1}:`);
          console.log(`       ListingKey: ${p.ListingKey}`);
          console.log(`       UnparsedAddress: ${p.UnparsedAddress || 'MISSING'}`);
          console.log(`       OriginalEntryTimestamp: ${p.OriginalEntryTimestamp || 'MISSING'}`);
          console.log(`       ModificationTimestamp: ${p.ModificationTimestamp || 'MISSING'}`);
          console.log(`       ListPrice: ${p.ListPrice || 'MISSING'}`);
          console.log(`       MlsStatus: ${p.MlsStatus || 'MISSING'}`);
        });
      }
    } catch (error) {
      console.log(`  ❌ Exception fetching properties: ${error.message}`);
    }
    
    // Step 3: Check current table counts
    console.log('\n[3] Checking current table row counts...');
    for (const tableName of tables) {
      try {
        const { count, error } = await db
          .from(tableName)
          .select('*', { count: 'exact', head: true });
        
        if (error) {
          const errorMsg = error.message?.toLowerCase() || '';
          if (error.code === '42P01' || 
              errorMsg.includes('does not exist') || 
              (errorMsg.includes('relation') && errorMsg.includes('not found'))) {
            console.log(`  ⚠️  "${tableName}": Table doesn't exist`);
          } else {
            console.log(`  ⚠️  "${tableName}": Error - ${error.message}`);
          }
        } else {
          console.log(`  📊 "${tableName}": ${count || 0} rows`);
        }
      } catch (error) {
        console.log(`  ⚠️  "${tableName}": Exception - ${error.message}`);
      }
    }
    
    // Step 4: Try processing a sample property
    console.log('\n[4] Testing listing history processing...');
    try {
      const { data: sampleProperty, error } = await db
        .from('Property')
        .select('*')
        .limit(1)
        .single();
      
      if (error || !sampleProperty) {
        console.log(`  ⚠️  Could not fetch sample property: ${error?.message || 'No properties found'}`);
      } else {
        console.log(`  📝 Processing sample property: ${sampleProperty.ListingKey}`);
        console.log(`     UnparsedAddress: ${sampleProperty.UnparsedAddress || 'MISSING'}`);
        console.log(`     OriginalEntryTimestamp: ${sampleProperty.OriginalEntryTimestamp || 'MISSING'}`);
        
        try {
          await processPropertyListingHistory(sampleProperty);
          console.log(`  ✅ Successfully processed listing history for ${sampleProperty.ListingKey}`);
          
          // Check if data was inserted
          const { count: historyFieldsCount } = await db
            .from('ListingHistoryFields')
            .select('*', { count: 'exact', head: true })
            .eq('ListingKey', sampleProperty.ListingKey);
          
          const { count: periodsCount } = await db
            .from('ListingPeriods')
            .select('*', { count: 'exact', head: true })
            .eq('ListingKey', sampleProperty.ListingKey);
          
          console.log(`\n     Results:`);
          console.log(`       ListingHistoryFields rows: ${historyFieldsCount || 0}`);
          console.log(`       ListingPeriods rows: ${periodsCount || 0}`);
          
        } catch (processError) {
          console.log(`  ❌ Error processing: ${processError.message}`);
          console.log(`     Stack: ${processError.stack}`);
        }
      }
    } catch (error) {
      console.log(`  ❌ Exception in test processing: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Diagnostic complete!\n');
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the diagnostic
testListingHistory()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

