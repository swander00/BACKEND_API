// ===============================================================================================
// PROPERTY FIELD MAPPER
// ===============================================================================================
// Maps backend database fields to frontend expected fields
// Handles the naming inconsistency between backend PropertyType/PropertySubType/ArchitecturalStyle
// and frontend PropertyType/PropertySubType expectations
// ===============================================================================================

// Only include fields that exist in your database schema
const ALLOWED_PROPERTY_FIELDS = [
  'ListingKey', 'ListPrice', 'ClosePrice', 'MlsStatus', 'ContractStatus', 
  'StandardStatus', 'TransactionType', 'PropertyType', 'PropertySubType', 
  'ArchitecturalStyle', 'UnparsedAddress', 'StreetNumber', 'StreetName', 
  'StreetSuffix', 'City', 'StateOrProvince', 'PostalCode', 'CountyOrParish', 
  'CityRegion', 'UnitNumber', 'KitchensAboveGrade', 'BedroomsAboveGrade', 
  'BedroomsBelowGrade', 'BathroomsTotalInteger', 'KitchensBelowGrade', 
  'KitchensTotal', 'DenFamilyRoomYN', 'PublicRemarks', 'PossessionDetails',
  'PhotosChangeTimestamp', 'MediaChangeTimestamp', 'ModificationTimestamp',
  'SystemModificationTimestamp', 'OriginalEntryTimestamp', 'SoldConditionalEntryTimestamp',
  'SoldEntryTimestamp', 'SuspendedEntryTimestamp', 'TerminatedEntryTimestamp',
  'CloseDate', 'ConditionalExpiryDate', 'PurchaseContractDate', 'SuspendedDate',
  'TerminatedDate', 'UnavailableDate', 'ExpirationDate', 'Cooling', 'Sewer', 'Basement',
  'BasementStatus', 'BasementEntrance', 'BasementBedroom', 'BasementKitchen', 'BasementRental',
  'ExteriorFeatures', 'InteriorFeatures', 'PoolFeatures',
  'PropertyFeatures', 'HeatType', 'FireplaceYN', 'LivingAreaRange', 
  'WaterfrontYN', 'PossessionType', 'CoveredSpaces', 'ParkingSpaces',
  'ParkingTotal', 'AssociationAmenities', 'Locker', 'BalconyType',
  'PetsAllowed', 'AssociationFee', 'AssociationFeeIncludes', 'ApproximateAge',
  'AdditionalMonthlyFee', 'TaxAnnualAmount', 'TaxYear', 'LotDepth',
  'LotWidth', 'LotSizeUnits', 'Furnished', 'RentIncludes'
];

/**
 * Maps a raw property from database to a filtered object
 * @param {Object} rawProperty - Raw property data from database
 * @returns {Object} Filtered property with only allowed fields
 */
export function mapProperty(rawProperty) {
  const filtered = {};
  
  // Only include fields that exist in database schema
  ALLOWED_PROPERTY_FIELDS.forEach(field => {
    if (rawProperty.hasOwnProperty(field)) {
      filtered[field] = rawProperty[field];
    }
  });
  
  return filtered;
}

/**
 * Maps property for PropertyCard view (frontend consumption)
 * 
 * Backend → Frontend mapping:
 * - Backend PropertyType (acts as PropertyClass) → Frontend PropertyClass
 * - Backend PropertySubType (Detached, Townhouse, etc.) → Frontend PropertyType
 * - Backend ArchitecturalStyle (2 Storey, Bungalow, etc.) → Frontend PropertySubType
 * 
 * @param {Object} rawProperty - Raw property data from database
 * @returns {Object} Property mapped for PropertyCard display
 */
export function mapPropertyForCard(rawProperty) {
  const filtered = {};
  
  // Map all allowed fields first
  ALLOWED_PROPERTY_FIELDS.forEach(field => {
    if (rawProperty.hasOwnProperty(field)) {
      // Skip the three fields that need special mapping
      if (field !== 'PropertyType' && field !== 'PropertySubType' && field !== 'ArchitecturalStyle') {
        filtered[field] = rawProperty[field];
      }
    }
  });
  
  // Apply frontend mapping for PropertyCard view
  // PropertyClass (high-level classification) - optional for card view
  if (rawProperty.PropertyType) {
    filtered.PropertyClass = rawProperty.PropertyType;
  }
  
  // PropertyType (specific category like Detached, Townhouse, Condo)
  if (rawProperty.PropertySubType) {
    filtered.PropertyType = rawProperty.PropertySubType;
  }
  
  // PropertySubType (architectural style like 2 Storey, Bungalow)
  if (rawProperty.ArchitecturalStyle) {
    filtered.PropertySubType = rawProperty.ArchitecturalStyle;
  }
  
  return filtered;
}

/**
 * Maps property for PropertyView (includes all fields with original names)
 * 
 * @param {Object} rawProperty - Raw property data from database
 * @returns {Object} Property with all fields including PropertyType, PropertySubType, ArchitecturalStyle
 */
export function mapPropertyForDetails(rawProperty) {
  const filtered = {};
  
  // Include all allowed fields as-is for details view
  ALLOWED_PROPERTY_FIELDS.forEach(field => {
    if (rawProperty.hasOwnProperty(field)) {
      filtered[field] = rawProperty[field];
    }
  });
  
  return filtered;
}