// ===============================================================================================
// LISTING HISTORY SERVICE
// ===============================================================================================
// Processes property data to build listing history and price change tracking
// Groups listings by UnparsedAddress (same physical property)
// ===============================================================================================

import { initDB } from '../db/client.js';
import { Logger } from '../utils/logger.js';

/**
 * Determines if a status indicates the listing has ended
 * @param {string} status - MlsStatus value
 * @returns {boolean}
 */
function isTerminalStatus(status) {
  if (!status) return false;
  const statusLower = status.toLowerCase();
  return [
    'sold',
    'leased',
    'terminated',
    'expired',
    'suspended',
    'withdrawn',
    'cancelled'
  ].some(terminal => statusLower.includes(terminal));
}

/**
 * Determines the end date for a listing period based on status
 * @param {Object} property - Property record
 * @returns {Date|null}
 */
function getListingEndDate(property) {
  const status = property.MlsStatus?.toLowerCase() || '';
  
  // Sold/Leased - use CloseDate
  if (status.includes('sold') || status.includes('leased')) {
    return property.CloseDate ? new Date(property.CloseDate) : null;
  }
  
  // Terminated - use TerminatedDate or TerminatedEntryTimestamp
  if (status.includes('terminated')) {
    return property.TerminatedDate 
      ? new Date(property.TerminatedDate)
      : property.TerminatedEntryTimestamp 
        ? new Date(property.TerminatedEntryTimestamp)
        : null;
  }
  
  // Expired - use ExpirationDate
  if (status.includes('expired')) {
    return property.ExpirationDate ? new Date(property.ExpirationDate) : null;
  }
  
  // Suspended - use SuspendedDate or SuspendedEntryTimestamp
  if (status.includes('suspended')) {
    return property.SuspendedDate 
      ? new Date(property.SuspendedDate)
      : property.SuspendedEntryTimestamp 
        ? new Date(property.SuspendedEntryTimestamp)
        : null;
  }
  
  // Withdrawn/Cancelled - use UnavailableDate or ModificationTimestamp
  if (status.includes('withdrawn') || status.includes('cancelled')) {
    return property.UnavailableDate 
      ? new Date(property.UnavailableDate)
      : property.ModificationTimestamp 
        ? new Date(property.ModificationTimestamp)
        : null;
  }
  
  return null; // Active listing
}

/**
 * Normalizes status to standard values
 * @param {string} status - MlsStatus value
 * @returns {string}
 */
function normalizeStatus(status) {
  if (!status) return 'Active';
  
  const statusLower = status.toLowerCase();
  
  if (statusLower.includes('sold')) return 'Sold';
  if (statusLower.includes('leased')) return 'Leased';
  if (statusLower.includes('terminated')) return 'Terminated';
  if (statusLower.includes('expired')) return 'Expired';
  if (statusLower.includes('suspended')) return 'Suspended';
  if (statusLower.includes('withdrawn')) return 'Withdrawn';
  if (statusLower.includes('cancelled')) return 'Cancelled';
  
  return 'Active';
}

/**
 * Processes a property to create/update listing period entry
 * @param {Object} property - Property record from feed
 */
export async function processListingPeriod(property) {
  try {
    const unparsedAddress = property.UnparsedAddress;
    const listingKey = property.ListingKey;
    
    if (!unparsedAddress || !listingKey) {
      Logger.warn('Missing UnparsedAddress or ListingKey', { 
        listingKey: property.ListingKey,
        hasUnparsedAddress: !!property.UnparsedAddress
      });
      return;
    }
    
    Logger.debug('Processing listing period', { listingKey, unparsedAddress });
    
    // Fetch history fields from separate table (or use defaults from property)
    const db = initDB();
    let historyFields = null;
    try {
      const { data, error } = await db
        .from('ListingHistoryFields')
        .select('*')
        .eq('ListingKey', listingKey)
        .single();
      
      if (!error && data) {
        historyFields = data;
        Logger.debug('Found history fields in table', { listingKey });
      }
    } catch (error) {
      // Table might not exist yet - that's okay, we'll use property fields as fallback
      Logger.debug('ListingHistoryFields table not available, using property fields', { listingKey });
    }
    
    // Determine if this is a new listing period
    const backOnMarket = historyFields?.BackOnMarketEntryTimestamp || property.BackOnMarketEntryTimestamp;
    const isNewListing = backOnMarket || 
                        (!backOnMarket && property.OriginalEntryTimestamp);
    
    // Get start date - use multiple fallbacks
    let dateStart = null;
    if (backOnMarket) {
      dateStart = new Date(backOnMarket);
    } else if (property.OriginalEntryTimestamp) {
      dateStart = new Date(property.OriginalEntryTimestamp);
    } else if (property.ModificationTimestamp) {
      // Fallback to ModificationTimestamp if OriginalEntryTimestamp is missing
      dateStart = new Date(property.ModificationTimestamp);
      Logger.debug('Using ModificationTimestamp as fallback for dateStart', { listingKey });
    } else if (property.EntryTimestamp) {
      // Another fallback
      dateStart = new Date(property.EntryTimestamp);
      Logger.debug('Using EntryTimestamp as fallback for dateStart', { listingKey });
    }
    
    if (!dateStart || isNaN(dateStart.getTime())) {
      Logger.warn('Missing or invalid start date for listing period', { 
        listingKey,
        hasBackOnMarket: !!backOnMarket,
        hasOriginalEntryTimestamp: !!property.OriginalEntryTimestamp,
        hasModificationTimestamp: !!property.ModificationTimestamp,
        hasEntryTimestamp: !!property.EntryTimestamp
      });
      return;
    }
    
    // Get initial price (from history fields table or fallback to property)
    const initialPrice = historyFields?.OriginalListPrice || property.OriginalListPrice || property.ListPrice || 0;
    
    // Get current price (final price)
    const finalPrice = property.ListPrice || initialPrice;
    
    // Get status
    const status = normalizeStatus(property.MlsStatus);
    
    // Get end date
    const dateEnd = isTerminalStatus(status) ? getListingEndDate(property) : null;
    
    // Get sold price and close date if sold/leased
    const soldPrice = (status === 'Sold' || status === 'Leased') 
      ? property.ClosePrice || null 
      : null;
    
    const closeDate = (status === 'Sold' || status === 'Leased') && property.CloseDate
      ? new Date(property.CloseDate)
      : null;
    
    // Upsert listing period
    const upsertData = {
      ListingKey: listingKey,
      UnparsedAddress: unparsedAddress,
      DateStart: dateStart.toISOString(),
      DateEnd: dateEnd ? dateEnd.toISOString() : null,
      InitialPrice: initialPrice,
      FinalPrice: finalPrice !== initialPrice ? finalPrice : null,
      Status: status,
      SoldPrice: soldPrice,
      CloseDate: closeDate ? closeDate.toISOString() : null,
      UpdatedAt: new Date().toISOString()
    };
    
    Logger.debug('Upserting listing period', { listingKey, upsertData });
    
    const { error } = await db
      .from('ListingPeriods')
      .upsert(upsertData, {
        onConflict: 'ListingKey',
        ignoreDuplicates: false
      });
    
    if (error) {
      Logger.error('Failed to upsert listing period', { 
        listingKey,
        unparsedAddress,
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        upsertData
      });
      throw error;
    }
    
    Logger.info('Successfully processed listing period', { 
      listingKey, 
      status,
      dateStart: dateStart.toISOString(),
      initialPrice 
    });
    
  } catch (error) {
    Logger.error('Error processing listing period', { 
      listingKey: property.ListingKey,
      error: error.message 
    });
    throw error;
  }
}

/**
 * Processes price changes for a property
 * Only tracks price changes for the current/active listing period
 * @param {Object} property - Property record from feed
 */
export async function processPriceChange(property) {
  try {
    const listingKey = property.ListingKey;
    const unparsedAddress = property.UnparsedAddress;
    
    if (!listingKey || !unparsedAddress) {
      return; // Skip if missing required fields
    }
    
    // Only process if this is the current/active listing
    // Check if listing period exists and is active
    const db = initDB();
    const { data: listingPeriod } = await db
      .from('ListingPeriods')
      .select('Status, DateStart')
      .eq('ListingKey', listingKey)
      .single();
    
    if (!listingPeriod) {
      // Listing period doesn't exist yet, skip (will be created by processListingPeriod)
      return;
    }
    
    // Fetch history fields from separate table
    let historyFields = null;
    try {
      const { data, error } = await db
        .from('ListingHistoryFields')
        .select('*')
        .eq('ListingKey', listingKey)
        .single();
      
      if (!error && data) {
        historyFields = data;
      }
    } catch (error) {
      // Table might not exist yet - that's okay, we'll use property fields as fallback
      Logger.debug('ListingHistoryFields table not available, using property fields', { listingKey });
    }
    
    // Check if this is a price change event
    const priceChangeTimestamp = historyFields?.PriceChangeTimestamp || property.PriceChangeTimestamp;
    const previousListPrice = historyFields?.PreviousListPrice ?? property.PreviousListPrice;
    const hasPriceChange = priceChangeTimestamp && 
                          previousListPrice !== null &&
                          previousListPrice !== undefined;
    
    // Check if this is initial listing
    const backOnMarket = historyFields?.BackOnMarketEntryTimestamp || property.BackOnMarketEntryTimestamp;
    const isInitialListing = property.OriginalEntryTimestamp || backOnMarket;
    
    if (!hasPriceChange && !isInitialListing) {
      return; // No price change to track
    }
    
    // Determine change date
    const changeDate = priceChangeTimestamp
      ? new Date(priceChangeTimestamp)
      : backOnMarket
        ? new Date(backOnMarket)
        : property.OriginalEntryTimestamp
          ? new Date(property.OriginalEntryTimestamp)
          : null;
    
    if (!changeDate) {
      return; // Skip if no change date
    }
    
    // Get prices
    const currentPrice = property.ListPrice || 0;
    const previousPrice = previousListPrice ?? null;
    
    // Calculate change percent
    let changePercent = null;
    let eventType = 'Listed';
    
    if (previousPrice !== null && previousPrice > 0) {
      changePercent = ((currentPrice - previousPrice) / previousPrice) * 100;
      
      if (changePercent < 0) {
        eventType = 'Price Reduced';
      } else if (changePercent > 0) {
        eventType = 'Price Increased';
      } else {
        eventType = 'Listed'; // No change, treat as initial listing
      }
    }
    
    // Check if price change entry already exists for this date
    const { data: existing } = await db
      .from('PriceChanges')
      .select('Id')
      .eq('ListingKey', listingKey)
      .eq('ChangeDate', changeDate.toISOString())
      .single();
    
    if (existing) {
      // Update existing entry
      const { error } = await db
        .from('PriceChanges')
        .update({
          Price: currentPrice,
          PreviousPrice: previousPrice,
          ChangePercent: changePercent,
          EventType: eventType
        })
        .eq('Id', existing.Id);
      
      if (error) {
        Logger.error('Failed to update price change', { listingKey, error: error.message });
      }
    } else {
      // Insert new entry
      const { error } = await db
        .from('PriceChanges')
        .insert({
          ListingKey: listingKey,
          UnparsedAddress: unparsedAddress,
          ChangeDate: changeDate.toISOString(),
          Price: currentPrice,
          PreviousPrice: previousPrice,
          ChangePercent: changePercent,
          EventType: eventType
        });
      
      if (error) {
        Logger.error('Failed to insert price change', { listingKey, error: error.message });
      }
    }
    
    Logger.debug('Processed price change', { listingKey, eventType, changePercent });
    
  } catch (error) {
    Logger.error('Error processing price change', { 
      listingKey: property.ListingKey,
      error: error.message 
    });
    // Don't throw - price changes are non-critical
  }
}

/**
 * Saves listing history fields to separate table (without modifying Property table)
 * @param {Object} property - Property record from feed
 */
async function saveHistoryFields(property) {
  try {
    const listingKey = property.ListingKey;
    
    if (!listingKey) {
      Logger.debug('Skipping saveHistoryFields - no listing key', { property: Object.keys(property) });
      return; // Skip if no listing key
    }
    
    // Only save if we have history-related fields from feed
    const hasHistoryFields = 
      property.OriginalListPrice !== undefined ||
      property.PreviousListPrice !== undefined ||
      property.PriceChangeTimestamp ||
      property.BackOnMarketEntryTimestamp ||
      property.LeasedEntryTimestamp ||
      property.LeasedConditionalEntryTimestamp ||
      property.DealFellThroughEntryTimestamp ||
      property.ExtensionEntryTimestamp;
    
    if (!hasHistoryFields) {
      Logger.debug('No history fields to save', { listingKey });
      return; // No history fields to save
    }
    
    Logger.debug('Saving history fields', { 
      listingKey,
      hasOriginalListPrice: property.OriginalListPrice !== undefined,
      hasPreviousListPrice: property.PreviousListPrice !== undefined,
      hasPriceChangeTimestamp: !!property.PriceChangeTimestamp,
      hasBackOnMarket: !!property.BackOnMarketEntryTimestamp
    });
    
    const db = initDB();
    try {
      const upsertData = {
        ListingKey: listingKey,
        OriginalListPrice: property.OriginalListPrice ?? null,
        PreviousListPrice: property.PreviousListPrice ?? null,
        PriceChangeTimestamp: property.PriceChangeTimestamp ? new Date(property.PriceChangeTimestamp).toISOString() : null,
        BackOnMarketEntryTimestamp: property.BackOnMarketEntryTimestamp ? new Date(property.BackOnMarketEntryTimestamp).toISOString() : null,
        LeasedEntryTimestamp: property.LeasedEntryTimestamp ? new Date(property.LeasedEntryTimestamp).toISOString() : null,
        LeasedConditionalEntryTimestamp: property.LeasedConditionalEntryTimestamp ? new Date(property.LeasedConditionalEntryTimestamp).toISOString() : null,
        DealFellThroughEntryTimestamp: property.DealFellThroughEntryTimestamp ? new Date(property.DealFellThroughEntryTimestamp).toISOString() : null,
        ExtensionEntryTimestamp: property.ExtensionEntryTimestamp ? new Date(property.ExtensionEntryTimestamp).toISOString() : null,
        UpdatedAt: new Date().toISOString()
      };
      
      const { error } = await db
        .from('ListingHistoryFields')
        .upsert(upsertData, {
          onConflict: 'ListingKey',
          ignoreDuplicates: false
        });
      
      if (error) {
        // If table doesn't exist, that's okay - just log debug message
        const errorMsg = error.message?.toLowerCase() || '';
        if (error.code === '42P01' || 
            errorMsg.includes('does not exist') || 
            (errorMsg.includes('relation') && errorMsg.includes('not found'))) {
          Logger.warn('ListingHistoryFields table does not exist yet', { 
            listingKey,
            error: error.message,
            code: error.code
          });
        } else {
          Logger.error('Failed to save history fields', { 
            listingKey, 
            error: error.message,
            errorCode: error.code,
            errorDetails: error.details,
            upsertData
          });
        }
      } else {
        Logger.info('Successfully saved history fields', { listingKey });
      }
    } catch (error) {
      // Table might not exist yet - that's okay
      Logger.warn('Exception saving history fields', { 
        listingKey,
        error: error.message,
        stack: error.stack
      });
    }
  } catch (error) {
    // Don't throw - this is non-critical
    Logger.warn('Error saving history fields', {
      listingKey: property.ListingKey,
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Processes a property for listing history (both period and price changes)
 * @param {Object} property - Property record from feed
 */
export async function processPropertyListingHistory(property) {
  const listingKey = property?.ListingKey;
  
  if (!listingKey) {
    Logger.warn('processPropertyListingHistory called without ListingKey', { 
      propertyKeys: property ? Object.keys(property) : 'null'
    });
    return;
  }
  
  try {
    Logger.debug('Starting listing history processing', { listingKey });
    
    // First, save history fields to separate table
    await saveHistoryFields(property);
    
    // Process listing period
    await processListingPeriod(property);
    
    // Then process price changes
    await processPriceChange(property);
    
    Logger.debug('Completed listing history processing', { listingKey });
    
  } catch (error) {
    Logger.error('Error processing property listing history', {
      listingKey,
      error: error.message,
      stack: error.stack,
      propertyKeys: property ? Object.keys(property) : 'null'
    });
    throw error;
  }
}

/**
 * Gets UnparsedAddress from ListingKey
 * @param {string} listingKey - ListingKey to lookup
 * @returns {Promise<string|null>} UnparsedAddress or null
 */
async function getUnparsedAddressFromListingKey(listingKey) {
  try {
    const db = initDB();
    const { data, error } = await db
      .from('Property')
      .select('UnparsedAddress')
      .eq('ListingKey', listingKey)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    return data.UnparsedAddress;
  } catch (error) {
    Logger.error('Error fetching UnparsedAddress', { listingKey, error: error.message });
    return null;
  }
}

/**
 * Fetches listing history for a property by UnparsedAddress or ListingKey
 * Returns all available listing history entries
 * @param {string} identifier - UnparsedAddress or ListingKey
 * @param {boolean} isListingKey - Whether identifier is a ListingKey (true) or UnparsedAddress (false)
 * @returns {Promise<Object>} Listing history data
 */
export async function getListingHistory(identifier, isListingKey = false) {
  try {
    let unparsedAddress = identifier;
    
    Logger.debug('Fetching listing history', { identifier, isListingKey });
    
    // If identifier is a ListingKey, fetch UnparsedAddress first
    if (isListingKey) {
      unparsedAddress = await getUnparsedAddressFromListingKey(identifier);
      if (!unparsedAddress) {
        Logger.warn('Property not found for ListingKey', { listingKey: identifier });
        throw new Error(`Property not found for ListingKey: ${identifier}`);
      }
      Logger.debug('Found UnparsedAddress for ListingKey', { listingKey: identifier, unparsedAddress });
    }
    
    if (!unparsedAddress) {
      throw new Error('UnparsedAddress is required');
    }
    
    // Fetch all listing periods
    const db = initDB();
    const { data: listingPeriods, error: periodsError } = await db
      .from('ListingPeriods')
      .select('*')
      .eq('UnparsedAddress', unparsedAddress)
      .order('DateStart', { ascending: false });
    
    // If table doesn't exist yet, return empty response
    if (periodsError) {
      const errorMsg = periodsError.message?.toLowerCase() || '';
      if (periodsError.code === '42P01' || 
          errorMsg.includes('does not exist') || 
          (errorMsg.includes('relation') && errorMsg.includes('not found'))) {
        Logger.warn('ListingPeriods table does not exist yet. Run database migrations.', {
          unparsedAddress,
          error: periodsError.message,
          code: periodsError.code
        });
        return {
          propertyAddress: unparsedAddress,
          listingHistory: [],
          priceChanges: []
        };
      }
      throw periodsError;
    }
    
    Logger.debug('Fetched listing periods', { 
      unparsedAddress, 
      count: listingPeriods?.length || 0 
    });
    
    // Get current/active listing key (most recent listing)
    const currentListingKey = listingPeriods && listingPeriods.length > 0 
      ? listingPeriods.find(p => p.Status === 'Active')?.ListingKey || listingPeriods[0].ListingKey
      : null;
    
    Logger.debug('Current listing key', { currentListingKey, totalPeriods: listingPeriods?.length || 0 });
    
    // Fetch price changes for current listing only
    let priceChanges = [];
    if (currentListingKey) {
      const { data: changes, error: changesError } = await db
        .from('PriceChanges')
        .select('*')
        .eq('ListingKey', currentListingKey)
        .order('ChangeDate', { ascending: false });
      
      if (changesError) {
        // If table doesn't exist yet, just return empty array
        const errorMsg = changesError.message?.toLowerCase() || '';
        if (changesError.code === '42P01' || 
            errorMsg.includes('does not exist') || 
            (errorMsg.includes('relation') && errorMsg.includes('not found'))) {
          Logger.warn('PriceChanges table does not exist yet. Run database migrations.', {
            error: changesError.message,
            code: changesError.code
          });
          priceChanges = [];
        } else {
          Logger.warn('Failed to fetch price changes', { error: changesError.message });
          priceChanges = [];
        }
      } else {
        priceChanges = changes || [];
        Logger.debug('Fetched price changes', { 
          listingKey: currentListingKey, 
          count: priceChanges.length 
        });
      }
    } else {
      Logger.debug('No current listing key found, skipping price changes fetch');
    }
    
    // Format response
    const listingHistory = (listingPeriods || []).map(period => ({
      dateStart: period.DateStart,
      dateEnd: period.DateEnd,
      price: period.InitialPrice,
      event: period.Status,
      listingId: period.ListingKey,
      soldPrice: period.SoldPrice,
      closeDate: period.CloseDate
    }));
    
    const formattedPriceChanges = (priceChanges || []).map(change => ({
      date: change.ChangeDate,
      price: change.Price,
      change: change.ChangePercent,
      previousPrice: change.PreviousPrice,
      event: change.EventType,
      listingId: change.ListingKey
    }));
    
    const result = {
      propertyAddress: unparsedAddress,
      listingHistory,
      priceChanges: formattedPriceChanges
    };
    
    Logger.debug('Returning listing history', { 
      unparsedAddress,
      listingHistoryCount: listingHistory.length,
      priceChangesCount: formattedPriceChanges.length
    });
    
    return result;
    
  } catch (error) {
    Logger.error('Error fetching listing history', {
      identifier,
      isListingKey,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

