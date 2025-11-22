// ===============================================================================================
// SEQUENTIAL SYNC ORCHESTRATOR
// ===============================================================================================
// Syncs Property → Media → Rooms → OpenHouse sequentially with resume support.
// Uses cursor-based pagination (timestamp + key) with database-backed state persistence.
// ===============================================================================================

import { fetchPropertyCount, fetchPropertyBatch, fetchMedia, fetchRooms, fetchOpenHouse } from '../services/api.js';
import { upsertProperty, upsertMedia, upsertRooms, upsertOpenHouse, getSyncState, updateSyncState, completeSyncState, failSyncState, initDB } from '../db/client.js';
import { mapProperty } from '../mappers/property.js';
import { mapMedia } from '../mappers/media.js';
import { mapRooms } from '../mappers/rooms.js';
import { mapOpenHouse } from '../mappers/openhouse.js';
import { Logger } from '../utils/logger.js';
import { geocodePropertyAsync } from '../services/geocodingService.js';
import { processPropertyListingHistory } from '../services/listingHistoryService.js';

// ===============================================================================================
// [1] CONFIGURATION AND CONSTANTS
// ===============================================================================================

const CHECKPOINT_INTERVAL = 1000; // Save state every N properties
const COVERAGE_REPORT_INTERVAL = 1000; // Log coverage stats every N properties

// ===============================================================================================
// [1] END
// ===============================================================================================


// ===============================================================================================
// [2] MAIN SYNC ENTRY POINT
// ===============================================================================================

export async function runSequentialSync(options = {}) {
  const {
    syncType = 'IDX',
    limit = null,
    reset = false
  } = options;

  console.log(`\n🚀 Starting ${syncType} sync${limit ? ` (limit: ${limit.toLocaleString()})` : ''}${reset ? ' (RESET MODE)' : ''}`);

  try {
    // [2.1] Load or initialize sync state
    let state = await getSyncState(syncType);
    
    if (reset) {
      Logger.warn('Reset flag detected - starting from SYNC_START_DATE');
      state = {
        SyncType: syncType,
        LastTimestamp: process.env.SYNC_START_DATE || '2024-01-01T00:00:00Z',
        LastKey: '0'
      };
      await updateSyncState(state);
    }

    console.log(`📍 Resuming from: ${state.LastTimestamp} | Key: ${state.LastKey}`);
    // [2.1] End

    // [2.2] Set status to running and track start time
    await updateSyncState({
      SyncType: syncType,
      LastTimestamp: state.LastTimestamp,
      LastKey: state.LastKey,
      Status: 'running',
      LastRunStarted: new Date().toISOString()
    });
    // Status set to RUNNING (silent)
    // [2.2] End

    // [2.3] Fetch total count for progress tracking
    const totalCount = await fetchPropertyCount(syncType, state.LastTimestamp, state.LastKey);
    console.log(`📊 Total records available: ${totalCount.toLocaleString()}\n`);
    
    // Initialize progress state
    if (Logger._progressState) {
      Logger._progressState.startTime = Date.now();
      Logger._progressState.lastUpdate = Date.now();
      Logger._progressState.lastCount = 0;
    }
    // [2.3] End

    // [2.4] Run sync loop
    const processedCount = await syncLoop(syncType, state, totalCount, limit);
    // [2.4] End

    // [2.5] Mark sync as completed
    await completeSyncState(syncType, processedCount);
    console.log(`\n✅ ${syncType} sync completed successfully!`);
    console.log(`   Processed: ${processedCount.toLocaleString()} properties`);
    // [2.5] End

  } catch (error) {
    // [2.6] Mark sync as failed
    await failSyncState(syncType, error.message);
    Logger.error(`Sync failed: ${error.message}`);
    throw error;
    // [2.6] End
  }
}

// ===============================================================================================
// [2] END
// ===============================================================================================


// ===============================================================================================
// [3] MAIN SYNC LOOP
// ===============================================================================================

async function syncLoop(syncType, state, totalCount, limit) {
  let processedCount = 0;
  let coverageStats = {
    mediaCount: 0,
    roomsCount: 0,
    openHouseCount: 0
  };

  // [3.1] Cursor tracking for infinite loop detection
  let previousTimestamp = state.LastTimestamp;
  let previousKey = state.LastKey;
  let stuckCount = 0; // Track consecutive iterations without cursor movement
  // [3.1] End

  // [3.2] Main sync loop - continue until no more records
  while (true) {
    // [3.2.0] Check for shutdown signal
    if (process.env.SYNC_SHUTDOWN === 'true') {
      console.log('\n⚠️  Shutdown signal detected - stopping sync gracefully');
      console.log(`💾 Progress saved: ${processedCount.toLocaleString()} properties processed`);
      break;
    }
    // [3.2.0] End
    
    // [3.2.1] Check limit condition
    if (limit && processedCount >= limit) {
      Logger.info(`Reached limit of ${limit} properties`);
      break;
    }
    // [3.2.1] End

    // [3.2.2] Fetch next batch of properties
    const batchSize = process.env.BATCH_SIZE_PROPERTY || 1000;
    const properties = await fetchPropertyBatch(
      syncType,
      state.LastTimestamp,
      state.LastKey,
      batchSize
    );
    // [3.2.2] End

    // [3.2.3] Check for end of data
    if (properties.length === 0) {
      Logger.info('No more records returned - sync complete');
      break;
    }
    // [3.2.3] End

    // [3.2.4] Process each property sequentially
    for (const rawProperty of properties) {
      processedCount++;

      // Process single property with all child records
      const childCounts = await processProperty(rawProperty, syncType);

      // Update coverage stats
      coverageStats.mediaCount += childCounts.media;
      coverageStats.roomsCount += childCounts.rooms;
      coverageStats.openHouseCount += childCounts.openHouse;

      // Update cursor position
      state.LastTimestamp = rawProperty.ModificationTimestamp;
      state.LastKey = rawProperty.ListingKey;

      // Log progress (human-readable format)
      Logger.progress(processedCount, {
        total: totalCount,
        listingKey: rawProperty.ListingKey,
        syncType: syncType,
        childCounts: childCounts
      });

      // Checkpoint state periodically
      if (processedCount % CHECKPOINT_INTERVAL === 0) {
        await updateSyncState(state);
        console.log(`\n💾 Checkpoint saved at ${processedCount.toLocaleString()} properties`);
      }

      // Coverage report
      if (processedCount % COVERAGE_REPORT_INTERVAL === 0) {
        logCoverageReport(processedCount, coverageStats);
      }

      // Check limit again (mid-batch)
      if (limit && processedCount >= limit) {
        break;
      }
    }
    // [3.2.4] End

    // [3.2.5] Detect stuck cursor (infinite loop protection)
    const lastRecord = properties[properties.length - 1];
    const currentTimestamp = lastRecord.ModificationTimestamp;
    const currentKey = lastRecord.ListingKey;

    if (currentTimestamp === previousTimestamp && currentKey === previousKey) {
      stuckCount++;
      Logger.warn(`Cursor hasn't advanced (attempt ${stuckCount}/3)`);
      
      if (stuckCount >= 3) {
        Logger.error('Cursor stuck for 3 iterations - stopping to prevent infinite loop');
        break;
      }
    } else {
      stuckCount = 0; // Reset counter if cursor moved
    }

    previousTimestamp = currentTimestamp;
    previousKey = currentKey;
    // [3.2.5] End
  }
  // [3.2] End

  // [3.3] Final checkpoint
  await updateSyncState(state);
  Logger.success(`Final state saved: ${state.LastTimestamp} | ${state.LastKey}`);
  // [3.3] End

  // [3.4] Final coverage report
  logCoverageReport(processedCount, coverageStats);
  // [3.4] End

  // [3.5] Return total processed count
  return processedCount;
  // [3.5] End
}

// ===============================================================================================
// [3] END
// ===============================================================================================


// ===============================================================================================
// [4] SINGLE PROPERTY PROCESSING
// ===============================================================================================

async function processProperty(rawProperty, syncType) {
  const listingKey = rawProperty.ListingKey;
  const childCounts = {
    property: 0,
    media: 0,
    rooms: 0,
    openHouse: 0
  };

  try {
    // [4.1] Upsert property record
    const mappedProperty = mapProperty(rawProperty);
    await upsertProperty(mappedProperty);
    childCounts.property = 1;
    
    // [4.1.5] Geocode property address (async, non-blocking)
    // Only geocode if enabled and coordinates are missing or geocoding failed previously
    const geocodingEnabled = process.env.ENABLE_AUTO_GEOCODING !== 'false';
    if (geocodingEnabled && (!mappedProperty.Latitude || !mappedProperty.Longitude || 
        mappedProperty.GeocodingStatus !== 'success')) {
      try {
        const db = initDB();
        // Use rawProperty for geocoding as it has all address fields
        geocodePropertyAsync(rawProperty, db);
      } catch (error) {
        // Don't fail sync if geocoding fails
        Logger.warn(`Geocoding setup failed for ${listingKey}: ${error.message}`);
      }
    }
    
    // [4.1.6] Process listing history (async, non-blocking)
    // Process listing periods and price changes
    try {
      await processPropertyListingHistory(rawProperty);
    } catch (error) {
      // Don't fail sync if listing history processing fails
      Logger.warn(`Listing history processing failed for ${listingKey}: ${error.message}`);
    }
    // [4.1] End

    // [4.2] Fetch and upsert media
    try {
      const rawMedia = await fetchMedia(listingKey);
      if (rawMedia.length > 0) {
        const mappedMedia = rawMedia.map(mapMedia);
        await upsertMedia(mappedMedia);
        childCounts.media = mappedMedia.length;
      }
    } catch (error) {
      Logger.error(`Media sync failed for ${listingKey}: ${error.message}`);
      // Continue to rooms even if media fails
    }
    // [4.2] End

    // [4.3] Fetch and upsert rooms
    try {
      const rawRooms = await fetchRooms(listingKey);
      if (rawRooms.length > 0) {
        const mappedRooms = rawRooms.map(mapRooms);
        await upsertRooms(mappedRooms);
        childCounts.rooms = mappedRooms.length;
      }
    } catch (error) {
      Logger.error(`Rooms sync failed for ${listingKey}: ${error.message}`);
      // Continue to openhouse even if rooms fails
    }
    // [4.3] End

    // [4.4] Fetch and upsert openhouse
    try {
      const rawOpenHouse = await fetchOpenHouse(listingKey);
      if (rawOpenHouse.length > 0) {
        const mappedOpenHouse = rawOpenHouse.map(mapOpenHouse);
        await upsertOpenHouse(mappedOpenHouse);
        childCounts.openHouse = mappedOpenHouse.length;
      }
    } catch (error) {
      Logger.error(`OpenHouse sync failed for ${listingKey}: ${error.message}`);
      // Non-fatal, continue to next property
    }
    // [4.4] End

  } catch (error) {
    Logger.error(`Failed to process property ${listingKey}: ${error.message}`);
    throw error; // Property upsert failure is fatal
  }

  return childCounts;
}

// ===============================================================================================
// [4] END
// ===============================================================================================


// ===============================================================================================
// [5] COVERAGE REPORTING
// ===============================================================================================

function logCoverageReport(processedCount, stats) {
  const mediaPercent = ((stats.mediaCount / processedCount) * 100).toFixed(1);
  const roomsPercent = ((stats.roomsCount / processedCount) * 100).toFixed(1);
  const openHousePercent = ((stats.openHouseCount / processedCount) * 100).toFixed(1);

  Logger.info('─'.repeat(80));
  Logger.info(`Coverage Report (${processedCount.toLocaleString()} properties processed)`);
  Logger.info(`  Media:      ${stats.mediaCount.toLocaleString()} records (${mediaPercent}% coverage)`);
  Logger.info(`  Rooms:      ${stats.roomsCount.toLocaleString()} records (${roomsPercent}% coverage)`);
  Logger.info(`  OpenHouse:  ${stats.openHouseCount.toLocaleString()} records (${openHousePercent}% coverage)`);
  Logger.info('─'.repeat(80));
}

// ===============================================================================================
// [5] END
// ===============================================================================================