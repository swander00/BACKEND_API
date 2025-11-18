# Geocoding Cost Analysis

## Google Maps Geocoding API Pricing (2024)

- **First 40,000 requests/month**: FREE
- **Additional requests**: $5 per 1,000 requests

## Cost Breakdown for Backfill

### Scenario 1: Full Backfill (50,000 properties)
- First 40,000 properties: **FREE**
- Remaining 10,000 properties: **$50** ($5 × 10)
- **Total Cost: ~$50**

### Scenario 2: Incremental Sync (New Listings Only)
- Typical daily new listings: ~100-500 properties
- Monthly new listings: ~3,000-15,000 properties
- **Cost: FREE** (within free tier)

## ⚠️ Recommendation: Disable Auto-Geocoding During Backfills

### Why?

1. **Rate Limiting Issues**
   - Google Maps API has rate limits (requests per second)
   - During backfill, you're processing 1,000+ properties per batch
   - Async geocoding can overwhelm the API and cause failures

2. **Better Control**
   - Dedicated geocoding script has better rate limiting
   - Can process in controlled batches
   - Can pause/resume if needed

3. **Cost Management**
   - Dedicated script shows progress and cost estimates
   - Can stop and resume if hitting limits
   - Better error handling for quota issues

### How to Disable During Backfill

**Option 1: Environment Variable (Recommended)**
```bash
# Disable auto-geocoding for backfill
ENABLE_AUTO_GEOCODING=false npm run sync:all

# Re-enable for normal incremental syncs
ENABLE_AUTO_GEOCODING=true npm run sync
```

**Option 2: Temporarily Edit environment.env**
```env
# Set to false during backfills
ENABLE_AUTO_GEOCODING=false
```

**Option 3: Comment Out in Code**
Temporarily comment out the geocoding section in `sync/sequential.js` during backfills.

## Recommended Workflow

### For Initial Backfill:
1. **Disable auto-geocoding**
   ```bash
   ENABLE_AUTO_GEOCODING=false npm run sync:all
   ```

2. **Run dedicated geocoding script** (after backfill completes)
   ```bash
   # Process in batches to stay within free tier
   npm run geocode -- --limit=40000  # First batch (FREE)
   npm run geocode -- --limit=10000  # Second batch ($50)
   ```

### For Normal Incremental Syncs:
1. **Enable auto-geocoding** (default)
   ```bash
   ENABLE_AUTO_GEOCODING=true npm run sync
   ```
   - Only geocodes new properties
   - Stays within free tier
   - No additional cost

## Cost Optimization Tips

1. **Skip Already Geocoded Properties**
   - The script automatically skips properties with valid coordinates
   - Only geocodes missing/failed properties

2. **Process in Batches**
   - Use `--limit` flag to process in smaller batches
   - Monitor API usage in Google Cloud Console

3. **Retry Failed Geocoding**
   - Use `--retry-failed` to retry only failed attempts
   - Avoids re-geocoding successful properties

4. **Monitor API Usage**
   - Check Google Cloud Console regularly
   - Set up billing alerts

## Monthly Cost Estimate

### Worst Case (Full Backfill Every Month)
- 50,000 properties × $5/1,000 = **$50/month**

### Realistic Case (Incremental Syncs)
- ~5,000 new properties/month
- **FREE** (within free tier)

### Best Practice
- Use dedicated script for initial backfill: **$50 one-time**
- Enable auto-geocoding for incremental syncs: **FREE**

## Summary

| Scenario | Properties | Cost | Recommendation |
|----------|-----------|------|----------------|
| Initial Backfill | 50,000 | $50 | Disable auto-geocoding, use dedicated script |
| Monthly Incremental | ~5,000 | FREE | Enable auto-geocoding |
| Daily Sync | ~100-500 | FREE | Enable auto-geocoding |

**Bottom Line**: Disable auto-geocoding during backfills to avoid rate limiting and better control costs. Use the dedicated geocoding script for bulk operations.

