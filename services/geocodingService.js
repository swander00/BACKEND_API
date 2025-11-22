/**
 * Geocoding Service
 * 
 * Provides geocoding functionality for property addresses using Google Maps Geocoding API.
 * Can be used during sync to automatically geocode new properties.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../environment.env') });

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

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
 * @param {string} address - Address string to geocode
 * @returns {Promise<{success: boolean, latitude?: number, longitude?: number, error?: string}>}
 */
export async function geocodeAddress(address) {
  if (!GOOGLE_MAPS_API_KEY) {
    return { success: false, error: 'Google Maps API key not configured' };
  }

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
 * Geocode a property and update the database
 * @param {Object} property - Property object with address fields
 * @param {Object} dbClient - Supabase database client (from initDB())
 * @returns {Promise<{success: boolean, latitude?: number, longitude?: number, error?: string}>}
 */
export async function geocodeProperty(property, dbClient) {
  // Skip if already geocoded successfully
  if (property.Latitude && property.Longitude && property.GeocodingStatus === 'success') {
    return {
      success: true,
      latitude: property.Latitude,
      longitude: property.Longitude,
      skipped: true,
    };
  }

  const address = buildAddressString(property);
  
  if (!address || address.trim() === '') {
    // Update status to failed
    if (dbClient) {
      await dbClient
        .from('Property')
        .update({
          GeocodingStatus: 'failed',
          GeocodedAt: new Date().toISOString(),
        })
        .eq('ListingKey', property.ListingKey || property.listingKey);
    }
    return { success: false, error: 'No address available' };
  }

  const result = await geocodeAddress(address);

  // Update database with geocoding results
  if (dbClient) {
    if (result.success) {
      await dbClient
        .from('Property')
        .update({
          Latitude: result.latitude,
          Longitude: result.longitude,
          GeocodedAt: new Date().toISOString(),
          GeocodingStatus: 'success',
        })
        .eq('ListingKey', property.ListingKey || property.listingKey);
    } else {
      await dbClient
        .from('Property')
        .update({
          GeocodedAt: new Date().toISOString(),
          GeocodingStatus: result.retry ? 'pending' : 'failed',
        })
        .eq('ListingKey', property.ListingKey || property.listingKey);
    }
  }

  return result;
}

/**
 * Geocode a property asynchronously (fire and forget)
 * Useful during sync to avoid blocking the sync process
 * @param {Object} property - Property object (can be rawProperty from API or mappedProperty)
 * @param {Object} dbClient - Supabase database client
 */
export async function geocodePropertyAsync(property, dbClient) {
  // Run geocoding in background without blocking
  // Use setTimeout instead of setImmediate for better async handling
  setTimeout(async () => {
    try {
      // Add small delay to avoid rate limiting during bulk sync
      await new Promise(resolve => setTimeout(resolve, 100));
      await geocodeProperty(property, dbClient);
    } catch (error) {
      // Silently fail - don't break sync process
      // Only log if it's not a rate limit error (those are expected)
      if (!error.message?.includes('quota') && !error.message?.includes('OVER_QUERY_LIMIT')) {
        logger.error('Failed to geocode property', {
          listingKey: property.ListingKey || property.listingKey,
          error: error.message
        });
      }
    }
  }, 0);
}

