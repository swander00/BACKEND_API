const ALLOWED_OPENHOUSE_FIELDS = [
  'OpenHouseKey', 'ListingKey', 'OpenHouseDate', 'OpenHouseStartTime',
  'OpenHouseEndTime', 'OpenHouseRemarks', 'OpenHouseStatus', 'OpenHouseType',
  'ShowingAgentKey', 'ShowingAgentKeyNumeric', 'ModificationTimestamp'
];

const INTEGER_FIELDS = ['ShowingAgentKeyNumeric'];
const TIME_FIELDS = ['OpenHouseStartTime', 'OpenHouseEndTime'];

export function mapOpenHouse(rawOpenHouse) {
  const filtered = {};
  
  ALLOWED_OPENHOUSE_FIELDS.forEach(field => {
    if (rawOpenHouse.hasOwnProperty(field)) {
      let value = rawOpenHouse[field];
      
      // Convert to integer for INTEGER fields
      if (INTEGER_FIELDS.includes(field) && value !== null && value !== undefined) {
        if (typeof value === 'string') {
          const numValue = parseFloat(value);
          value = isNaN(numValue) ? null : Math.floor(numValue);
        } else if (typeof value === 'number') {
          value = Math.floor(value);
        }
      }
      
      // Extract time from timestamp for TIME fields
      if (TIME_FIELDS.includes(field) && value !== null && value !== undefined) {
        if (typeof value === 'string') {
          // Extract time portion from ISO timestamp
          // "2025-04-06T20:00:00Z" becomes "20:00:00"
          const timeMatch = value.match(/T(\d{2}:\d{2}:\d{2})/);
          value = timeMatch ? timeMatch[1] : null;
        }
      }
      
      filtered[field] = value;
    }
  });
  
  return filtered;
}