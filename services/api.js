// ===============================================================================================
// API CLIENT FOR AMPRE RESO WEB API
// ===============================================================================================
// Handles all HTTP requests to the TRREB RESO API with rate limiting and error handling.
// Provides both class-based methods and standalone function exports for compatibility.
// ===============================================================================================

import { logger } from '../utils/logger.js';

// ===============================================================================================
// [1] API CLIENT CLASS
// ===============================================================================================

export class APIClient {
  constructor() {
    // [1.1] Rate Limiting Configuration
    // Calculate delay between requests based on rate limit (default: 120 requests per minute)
    this.rateLimitDelay = 60000 / (parseInt(process.env.AMPRE_RATE_LIMIT_PER_MINUTE) || 120);
    this.lastRequestTime = 0;
    // [1.1] End
  }

  // [1.2] Core Request Method with Rate Limiting and Retry Logic
  async makeRequest(url, token, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Enforce rate limiting by waiting if needed
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.rateLimitDelay) {
          await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
        }
        this.lastRequestTime = Date.now();

        // Make HTTP request with authorization and timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        try {
          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          // Handle HTTP errors
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${response.statusText}\nURL: ${url}\nResponse: ${errorText}`);
          }

          // Parse and return data
          const data = await response.json();
          return data.value || [];
        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable (network errors, timeouts)
        const isRetryable = 
          error.name === 'AbortError' || // Timeout
          error.message.includes('fetch failed') || // Network error
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('ECONNRESET');
        
        if (attempt < maxRetries && isRetryable) {
          const delayMs = 1000 * attempt; // Exponential backoff: 1s, 2s, 3s
          logger.warn('API request retry', {
            attempt,
            maxRetries,
            delayMs,
            error: error.message,
            url: url.substring(0, 100) // Log first 100 chars of URL
          });
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        
        // If not retryable or all retries exhausted, throw
        if (!isRetryable) {
          throw new Error(`Non-retryable error: ${error.message}\nURL: ${url.substring(0, 200)}`);
        }
      }
    }
    
    // All retries exhausted
    throw new Error(`Request failed after ${maxRetries} attempts: ${lastError.message}\nURL: ${url.substring(0, 200)}`);
  }
  // [1.2] End

  // [1.3] Get Total Count of Properties
  // Used for progress tracking - fetches count without returning actual records
  async getTotalCount(cursor, syncType = 'IDX') {
    const token = syncType === 'IDX' ? process.env.IDX_TOKEN : process.env.VOW_TOKEN;
    const baseUrl = syncType === 'IDX' ? process.env.IDX_URL : process.env.VOW_URL;
    
    if (!token) {
      throw new Error(`Missing ${syncType}_TOKEN environment variable`);
    }
    
    if (!baseUrl) {
      throw new Error(`Missing ${syncType}_URL environment variable`);
    }
    
    // Build URL with cursor parameters and count-only flags
    let url = baseUrl
      .replace(/@lastTimestamp/g, cursor.lastTimestamp)
      .replace(/@lastKey/g, cursor.lastKey);
    
    url += url.includes('?') ? '&' : '?';
    url += `$top=0&$count=true`; // $top=0 means return no records, just the count

    // Use makeRequest with retry logic, but handle count response differently
    let lastError;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Enforce rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.rateLimitDelay) {
          await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
        }
        this.lastRequestTime = Date.now();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        try {
          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`Count request failed: HTTP ${response.status} ${response.statusText}`);
          }

          const data = await response.json();
          return data['@odata.count'] || 0;
        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
      } catch (error) {
        lastError = error;
        
        const isRetryable = 
          error.name === 'AbortError' ||
          error.message.includes('fetch failed') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('ECONNRESET');
        
        if (attempt < maxRetries && isRetryable) {
          const delayMs = 1000 * attempt;
          logger.warn('API count request retry', {
            attempt,
            maxRetries,
            delayMs,
            error: error.message
          });
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        
        if (!isRetryable) {
          throw new Error(`Count request failed: ${error.message}\nURL: ${url.substring(0, 200)}`);
        }
      }
    }
    
    throw new Error(`Count request failed after ${maxRetries} attempts: ${lastError.message}\nURL: ${url.substring(0, 200)}`);
  }
  // [1.3] End

  // [1.4] Fetch Batch of Properties
  // Retrieves properties using cursor-based pagination
  async fetchProperties(cursor, batchSize, syncType = 'IDX') {
    const token = syncType === 'IDX' ? process.env.IDX_TOKEN : process.env.VOW_TOKEN;
    const baseUrl = syncType === 'IDX' ? process.env.IDX_URL : process.env.VOW_URL;
    
    if (!token) {
      throw new Error(`Missing ${syncType}_TOKEN environment variable`);
    }
    
    if (!baseUrl) {
      throw new Error(`Missing ${syncType}_URL environment variable`);
    }
    
    if (!cursor || !cursor.lastTimestamp || !cursor.lastKey) {
      throw new Error(`Invalid cursor: ${JSON.stringify(cursor)}`);
    }
    
    // Build URL with cursor and batch size
    let url = baseUrl
      .replace(/@lastTimestamp/g, cursor.lastTimestamp)
      .replace(/@lastKey/g, cursor.lastKey);
    
    url += url.includes('?') ? '&' : '?';
    url += `$top=${batchSize}`;
    
    return await this.makeRequest(url, token);
  }
  // [1.4] End

  // [1.5] Fetch Media for Single Property
  // Filters: Active status, Largest image size only
  async fetchMediaForProperty(propertyKey) {
    const token = process.env.IDX_TOKEN;
    if (!token) {
      throw new Error('Missing IDX_TOKEN environment variable');
    }
    
    const filter = `ResourceRecordKey eq '${propertyKey}' and MediaStatus eq 'Active' and ImageSizeDescription eq 'Largest'`;
    const url = `https://query.ampre.ca/odata/Media?$filter=${encodeURIComponent(filter)}&$top=500`;
    
    return await this.makeRequest(url, token);
  }
  // [1.5] End

  // [1.6] Fetch Rooms for Single Property
  async fetchRoomsForProperty(propertyKey) {
    const token = process.env.IDX_TOKEN;
    const baseUrl = process.env.ROOMS_URL;
    
    if (!token) {
      throw new Error('Missing IDX_TOKEN environment variable');
    }
    
    if (!baseUrl) {
      throw new Error('Missing ROOMS_URL environment variable');
    }
    
    const url = baseUrl.replace('@propertyKey', propertyKey);
    
    return await this.makeRequest(url, token);
  }
  // [1.6] End

  // [1.7] Fetch OpenHouse for Single Property
  // Filters: Future dates only (>= today)
  async fetchOpenHouseForProperty(propertyKey) {
    const token = process.env.IDX_TOKEN;
    if (!token) {
      throw new Error('Missing IDX_TOKEN environment variable');
    }
    
    const today = new Date().toISOString().split('T')[0];
    const filter = `ListingKey eq '${propertyKey}' and OpenHouseDate ge ${today}`;
    const url = `https://query.ampre.ca/odata/OpenHouse?$filter=${encodeURIComponent(filter)}&$orderby=OpenHouseKey`;
    
    return await this.makeRequest(url, token);
  }
  // [1.7] End
}

// ===============================================================================================
// [1] END
// ===============================================================================================


// ===============================================================================================
// [2] STANDALONE FUNCTION EXPORTS
// ===============================================================================================
// These functions wrap the APIClient class methods for backward compatibility.
// Used by sequential.js and other modules that import functions instead of the class.
// ===============================================================================================

// [2.1] Create Singleton Instance
// Single shared instance prevents multiple rate limit trackers
const apiClient = new APIClient();
// [2.1] End

// [2.2] Property Count Function
// Wrapper for getTotalCount class method
export async function fetchPropertyCount(syncType, lastTimestamp, lastKey) {
  return await apiClient.getTotalCount(
    { lastTimestamp, lastKey },
    syncType
  );
}
// [2.2] End

// [2.3] Property Batch Function
// Wrapper for fetchProperties class method
export async function fetchPropertyBatch(syncType, lastTimestamp, lastKey, batchSize) {
  return await apiClient.fetchProperties(
    { lastTimestamp, lastKey },
    batchSize,
    syncType
  );
}
// [2.3] End

// [2.4] Media Function
// Wrapper for fetchMediaForProperty class method
export async function fetchMedia(propertyKey) {
  return await apiClient.fetchMediaForProperty(propertyKey);
}
// [2.4] End

// [2.5] Rooms Function
// Wrapper for fetchRoomsForProperty class method
export async function fetchRooms(propertyKey) {
  return await apiClient.fetchRoomsForProperty(propertyKey);
}
// [2.5] End

// [2.6] OpenHouse Function
// Wrapper for fetchOpenHouseForProperty class method
export async function fetchOpenHouse(propertyKey) {
  return await apiClient.fetchOpenHouseForProperty(propertyKey);
}
// [2.6] End

// ===============================================================================================
// [2] END
// ===============================================================================================