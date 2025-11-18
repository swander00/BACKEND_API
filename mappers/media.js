// Only include fields that exist in your database schema
const ALLOWED_MEDIA_FIELDS = [
  'MediaKey', 'ResourceRecordKey', 'MediaObjectID', 'MediaURL', 
  'MediaCategory', 'MediaType', 'MediaStatus', 'ImageOf', 'ClassName',
  'ImageSizeDescription', 'Order', 'PreferredPhotoYN', 'ShortDescription',
  'ResourceName', 'OriginatingSystemID', 'MediaModificationTimestamp',
  'ModificationTimestamp'
];

export function mapMedia(rawMedia) {
  const filtered = {};
  
  // Only include fields that exist in database schema
  ALLOWED_MEDIA_FIELDS.forEach(field => {
    if (rawMedia.hasOwnProperty(field)) {
      filtered[field] = rawMedia[field];
    }
  });
  
  return filtered;
}