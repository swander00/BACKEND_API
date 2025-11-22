// ============================================================================
// POPULATE LISTING HISTORY SCRIPT
// ============================================================================
// This script processes all existing properties to populate ListingHistoryFields
// and ListingPeriods tables. Run this after creating the tables.
// ============================================================================

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envLocalPath = join(__dirname, '../.env.local');
const envPath = join(__dirname, '../environment.env');

dotenv.config({ path: envLocalPath });
if (!process.env.SUPABASE_URL && !process.env.PORT) {
  dotenv.config({ path: envPath });
}

import { initDB } from '../db/client.js';
import { processPropertyListingHistory } from '../services/listingHistoryService.js';
import { Logger } from '../utils/logger.js';

async function populateListingHistory() {
  try {
    console.log('\n🚀 Populating Listing History Tables\n');
    console.log('='.repeat(60));
    
    const db = initDB();
    
    // Get total count
    const { count: totalCount, error: countError } = await db
      .from('Property')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('❌ Error getting property count:', countError.message);
      process.exit(1);
    }
    
    console.log(`\n📊 Found ${totalCount} total properties to process\n`);
    
    const BATCH_SIZE = 100;
    let processed = 0;
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    // Process in batches
    for (let offset = 0; offset < totalCount; offset += BATCH_SIZE) {
      console.log(`\n📦 Processing batch ${Math.floor(offset / BATCH_SIZE) + 1} (${offset + 1}-${Math.min(offset + BATCH_SIZE, totalCount)} of ${totalCount})...`);
      
      const { data: properties, error } = await db
        .from('Property')
        .select('*')
        .range(offset, offset + BATCH_SIZE - 1);
      
      if (error) {
        console.error(`❌ Error fetching batch: ${error.message}`);
        errorCount += BATCH_SIZE;
        continue;
      }
      
      if (!properties || properties.length === 0) {
        break;
      }
      
      // Process each property
      for (const property of properties) {
        try {
          // Skip if missing required fields
          if (!property.ListingKey || !property.UnparsedAddress) {
            skippedCount++;
            continue;
          }
          
          await processPropertyListingHistory(property);
          successCount++;
          
          if ((processed + 1) % 50 === 0) {
            console.log(`   ✓ Processed ${processed + 1}/${totalCount} properties...`);
          }
        } catch (error) {
          errorCount++;
          Logger.warn('Failed to process property', {
            listingKey: property.ListingKey,
            error: error.message
          });
        }
        
        processed++;
      }
      
      // Show progress
      const progress = ((processed / totalCount) * 100).toFixed(1);
      console.log(`   Progress: ${processed}/${totalCount} (${progress}%)`);
    }
    
    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Processing Complete!\n');
    console.log(`   Total properties: ${totalCount}`);
    console.log(`   ✅ Successfully processed: ${successCount}`);
    console.log(`   ⚠️  Skipped (missing data): ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    
    // Check final counts
    console.log('\n📊 Final table row counts:');
    
    const { count: historyFieldsCount } = await db
      .from('ListingHistoryFields')
      .select('*', { count: 'exact', head: true });
    
    const { count: periodsCount } = await db
      .from('ListingPeriods')
      .select('*', { count: 'exact', head: true });
    
    const { count: priceChangesCount } = await db
      .from('PriceChanges')
      .select('*', { count: 'exact', head: true });
    
    console.log(`   ListingHistoryFields: ${historyFieldsCount || 0} rows`);
    console.log(`   ListingPeriods: ${periodsCount || 0} rows`);
    console.log(`   PriceChanges: ${priceChangesCount || 0} rows`);
    
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Done!\n');
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the population script
populateListingHistory()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

