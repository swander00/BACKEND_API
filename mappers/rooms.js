const ALLOWED_ROOMS_FIELDS = [
  'RoomKey', 'ListingKey', 'RoomType', 'RoomLevel', 'RoomLength', 
  'RoomWidth', 'RoomDescription', 'RoomAreaUnits', 'RoomFeature1', 
  'RoomFeature2', 'RoomFeature3', 'ModificationTimestamp'
];

const NUMERIC_FIELDS = ['RoomLength', 'RoomWidth'];

export function mapRooms(rawRoom) {
  const filtered = {};
  
  ALLOWED_ROOMS_FIELDS.forEach(field => {
    if (rawRoom.hasOwnProperty(field)) {
      let value = rawRoom[field];
      
      // Convert to numeric for NUMERIC fields
      if (NUMERIC_FIELDS.includes(field) && value !== null && value !== undefined) {
        if (typeof value === 'string') {
          const numValue = parseFloat(value);
          value = isNaN(numValue) ? null : numValue;
        }
      }
      
      filtered[field] = value;
    }
  });
  
  return filtered;
}