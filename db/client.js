// ===============================================================================================
// DATABASE CLIENT
// ===============================================================================================
// Handles all Supabase database operations with retry logic and state management
// ===============================================================================================

import { createClient } from '@supabase/supabase-js';
import { Logger } from '../utils/logger.js';

let supabase = null;

// ===============================================================================================
// [1] DATABASE INITIALIZATION
// ===============================================================================================

export function initDB() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    Logger.info('Database connection initialized');
  }
  return supabase;
}

// ===============================================================================================
// [1] END
// ===============================================================================================


// ===============================================================================================
// [2] RETRY HELPER
// ===============================================================================================

async function retryOperation(operation, maxRetries = 3, delayMs = 1000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        console.log(`[RETRY] Attempt ${attempt}/${maxRetries} failed. Retrying in ${delayMs}ms...`);
        console.log(`[RETRY] Error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  
  console.error(`[RETRY] All ${maxRetries} attempts failed. Last error: ${lastError.message}`);
  throw lastError;
}

// ===============================================================================================
// [2] END
// ===============================================================================================


// ===============================================================================================
// [3] PROPERTY UPSERT
// ===============================================================================================

export async function upsertProperty(property) {
  return await retryOperation(async () => {
    const db = initDB();
    
    const { error } = await db
      .from('Property')
      .upsert(property, { 
        onConflict: 'ListingKey',
        ignoreDuplicates: false 
      });
      
    if (error) {
      throw new Error(`Property upsert failed: ${error.message}`);
    }
  });
}

// ===============================================================================================
// [3] END
// ===============================================================================================


// ===============================================================================================
// [4] MEDIA UPSERT
// ===============================================================================================

export async function upsertMedia(mediaRecords) {
  if (mediaRecords.length === 0) return 0;
  
  return await retryOperation(async () => {
    const db = initDB();
    
    const { error } = await db
      .from('Media')
      .upsert(mediaRecords, { 
        onConflict: 'MediaKey',
        ignoreDuplicates: false 
      });
      
    if (error) {
      throw new Error(`Media upsert failed: ${error.message}`);
    }
    
    return mediaRecords.length;
  });
}

// ===============================================================================================
// [4] END
// ===============================================================================================


// ===============================================================================================
// [5] ROOMS UPSERT
// ===============================================================================================

export async function upsertRooms(roomRecords) {
  if (roomRecords.length === 0) return 0;
  
  return await retryOperation(async () => {
    const db = initDB();
    
    const { error } = await db
      .from('PropertyRooms')
      .upsert(roomRecords, { 
        onConflict: 'RoomKey',
        ignoreDuplicates: false 
      });
      
    if (error) {
      throw new Error(`Rooms upsert failed: ${error.message}`);
    }
    
    return roomRecords.length;
  });
}

// ===============================================================================================
// [5] END
// ===============================================================================================


// ===============================================================================================
// [6] OPENHOUSE UPSERT
// ===============================================================================================

export async function upsertOpenHouse(openHouseRecords) {
  if (openHouseRecords.length === 0) return 0;
  
  return await retryOperation(async () => {
    const db = initDB();
    
    const { error } = await db
      .from('OpenHouse')
      .upsert(openHouseRecords, { 
        onConflict: 'OpenHouseKey',
        ignoreDuplicates: false 
      });
      
    if (error) {
      throw new Error(`OpenHouse upsert failed: ${error.message}`);
    }
    
    return openHouseRecords.length;
  });
}

// ===============================================================================================
// [6] END
// ===============================================================================================


// ===============================================================================================
// [7] SYNC STATE MANAGEMENT
// ===============================================================================================

// [7.1] Get Sync State
export async function getSyncState(syncType) {
  return await retryOperation(async () => {
    const db = initDB();
    
    const { data, error } = await db
      .from('SyncState')
      .select('*')
      .eq('SyncType', syncType)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return {
          SyncType: syncType,
          LastTimestamp: process.env.SYNC_START_DATE || '2024-01-01T00:00:00Z',
          LastKey: '0',
          TotalProcessed: 0
        };
      }
      throw new Error(`Failed to get sync state: ${error.message}`);
    }
    
    return data;
  });
}
// [7.1] End

// [7.2] Update Sync State - FIXED to accept state object with PascalCase
export async function updateSyncState(state) {
  return await retryOperation(async () => {
    const db = initDB();
    
    const { error } = await db
      .from('SyncState')
      .upsert({
        SyncType: state.SyncType,
        LastTimestamp: state.LastTimestamp,
        LastKey: state.LastKey,
        UpdatedAt: new Date().toISOString()
      }, {
        onConflict: 'SyncType'
      });
    
    if (error) {
      throw new Error(`Failed to update sync state: ${error.message}`);
    }
  });
}
// [7.2] End

// [7.3] Complete Sync State
export async function completeSyncState(syncType, totalProcessed) {
  return await retryOperation(async () => {
    const db = initDB();
    
    const { error } = await db
      .from('SyncState')
      .update({
        TotalProcessed: totalProcessed,
        Status: 'completed',
        LastRunCompleted: new Date().toISOString(),
        UpdatedAt: new Date().toISOString()
      })
      .eq('SyncType', syncType);
    
    if (error) {
      throw new Error(`Failed to complete sync state: ${error.message}`);
    }
  });
}
// [7.3] End

// [7.4] Fail Sync State
export async function failSyncState(syncType, errorMessage) {
  try {
    await retryOperation(async () => {
      const db = initDB();
      
      const { error } = await db
        .from('SyncState')
        .update({
          Status: 'failed',
          LastRunCompleted: new Date().toISOString(),
          UpdatedAt: new Date().toISOString()
        })
        .eq('SyncType', syncType);
      
      if (error) {
        throw error;
      }
    });
  } catch (error) {
    console.error(`Failed to update failed sync state: ${error.message}`);
  }
}
// [7.4] End

// [7.5] Reset Sync State
export async function resetSyncState(syncType) {
  return await retryOperation(async () => {
    const db = initDB();
    
    const { error } = await db
      .from('SyncState')
      .upsert({
        SyncType: syncType,
        LastTimestamp: process.env.SYNC_START_DATE || '2024-01-01T00:00:00Z',
        LastKey: '0',
        TotalProcessed: 0,
        Status: 'idle',
        LastRunStarted: null,
        LastRunCompleted: null,
        UpdatedAt: new Date().toISOString()
      }, {
        onConflict: 'SyncType'
      });
    
    if (error) {
      throw new Error(`Failed to reset sync state: ${error.message}`);
    }
  });
}
// [7.5] End

// ===============================================================================================
// [7] END
// ===============================================================================================