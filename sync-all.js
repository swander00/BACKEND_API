// ===============================================================================================
// COMBINED SYNC ORCHESTRATOR (IDX + VOW)
// ===============================================================================================
// Runs IDX and/or VOW syncs with flexible command-line options
// Usage:
//   node sync-all.js                    -> Sync both IDX and VOW (full)
//   node sync-all.js idx                -> Sync only IDX
//   node sync-all.js vow                -> Sync only VOW
//   node sync-all.js idx vow            -> Sync both (same as no args)
//   node sync-all.js -10                -> Sync both with limit=10
//   node sync-all.js idx -50            -> Sync only IDX with limit=50
//   node sync-all.js vow -100           -> Sync only VOW with limit=100
//   node sync-all.js incremental        -> Sync both incrementally (from last checkpoint)
//   node sync-all.js --reset            -> Reset and sync both from start
// ===============================================================================================

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { runSequentialSync } from './sync/sequential.js';
import { fetchPropertyCount } from './services/api.js';

dotenv.config({ path: './environment.env' });

// ===============================================================================================
// [1] PARSE COMMAND LINE ARGUMENTS
// ===============================================================================================

function parseCustomArgs() {
  const args = process.argv.slice(2);
  
  const config = {
    syncIdx: false,
    syncVow: false,
    limit: null,
    reset: false,
    incremental: false
  };

  // If no args, sync both
  if (args.length === 0) {
    config.syncIdx = true;
    config.syncVow = true;
    return config;
  }

  for (const arg of args) {
    const lower = arg.toLowerCase();
    
    // Sync type flags
    if (lower === 'idx') {
      config.syncIdx = true;
    } else if (lower === 'vow') {
      config.syncVow = true;
    }
    // Limit flags
    else if (lower.match(/^-\d+$/)) {
      config.limit = parseInt(lower.substring(1));
    }
    // Mode flags
    else if (lower === 'incremental') {
      config.incremental = true;
    } else if (lower === '--reset') {
      config.reset = true;
    }
  }

  // If neither IDX nor VOW specified, sync both
  if (!config.syncIdx && !config.syncVow) {
    config.syncIdx = true;
    config.syncVow = true;
  }

  return config;
}

// ===============================================================================================
// [1] END
// ===============================================================================================


// ===============================================================================================
// [2] HELPER FUNCTION - GET EXISTING DATABASE RECORDS
// ===============================================================================================

async function getExistingRecordCount() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  const { count: propertyCount } = await supabase
    .from('Property')
    .select('*', { count: 'exact', head: true });
  
  return propertyCount || 0;
}

// ===============================================================================================
// [2] END
// ===============================================================================================


// ===============================================================================================
// [3] MAIN FUNCTION
// ===============================================================================================

async function main() {
  const config = parseCustomArgs();
  
  console.log('========================================');
  console.log('TRREB Sync Service');
  console.log('========================================');
  console.log(`Mode: ${config.incremental ? 'INCREMENTAL' : 'FULL'}`);
  console.log(`Syncing: ${config.syncIdx ? 'IDX' : ''}${config.syncIdx && config.syncVow ? ' + ' : ''}${config.syncVow ? 'VOW' : ''}`);
  console.log(`Limit: ${config.limit ? config.limit.toLocaleString() : 'None (complete sync)'}`);
  console.log(`Reset: ${config.reset ? 'YES' : 'NO'}`);
  console.log('========================================\n');
  
  const totalStart = Date.now();
  
  try {
    // [3.1] Fetch counts upfront
    console.log('>>> Fetching total counts...\n');
    
    let idxCount = 0;
    let vowCount = 0;
    
    if (config.syncIdx) {
      idxCount = await fetchPropertyCount('IDX', '2024-01-01T00:00:00Z', '0');
      console.log(`IDX Properties: ${idxCount.toLocaleString()}`);
    }
    
    if (config.syncVow) {
      vowCount = await fetchPropertyCount('VOW', '2024-01-01T00:00:00Z', '0');
      console.log(`VOW Properties: ${vowCount.toLocaleString()}`);
    }
    
    const totalCount = idxCount + vowCount;
    console.log(`TOTAL Properties: ${totalCount.toLocaleString()}`);
    
    // [3.2] Get existing database count
    const existingRecords = await getExistingRecordCount();
    console.log(`\nAlready in database: ${existingRecords.toLocaleString()}`);
    console.log(`Remaining to sync: ${(totalCount - existingRecords).toLocaleString()}\n`);
    // [3.2] End
    
    // [3.3] Sync IDX (if requested)
    if (config.syncIdx) {
      console.log('>>> Starting IDX Sync...\n');
      await runSequentialSync({
        limit: config.limit,
        syncType: 'IDX',
        reset: config.reset
      });
      console.log('\n>>> IDX Sync Complete!\n');
    }
    // [3.3] End
    
    // [3.4] Sync VOW (if requested)
    if (config.syncVow) {
      console.log('>>> Starting VOW Sync...\n');
      await runSequentialSync({
        limit: config.limit,
        syncType: 'VOW',
        reset: config.reset
      });
      console.log('\n>>> VOW Sync Complete!\n');
    }
    // [3.4] End
    
    // [3.5] Final summary
    const totalTime = ((Date.now() - totalStart) / 1000 / 60).toFixed(2);
    const finalCount = await getExistingRecordCount();
    
    console.log('========================================');
    console.log('SYNC COMPLETE');
    console.log('========================================');
    console.log(`Total Records in Database: ${finalCount.toLocaleString()}`);
    console.log(`Records Added This Run: ${(finalCount - existingRecords).toLocaleString()}`);
    console.log(`Total Time: ${totalTime} minutes`);
    console.log('========================================\n');
    
    console.log('SUCCESS: All syncs completed!');
    // [3.5] End
    
  } catch (error) {
    console.error('\nSYNC FAILED');
    console.error(error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

// ===============================================================================================
// [3] END
// ===============================================================================================

main();