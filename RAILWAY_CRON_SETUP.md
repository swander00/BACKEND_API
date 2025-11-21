# Railway Cron Job Setup Guide

## 1. Initial Backfill (Run Once)

To backfill all existing property data, run this command in Railway:

**Via Railway Dashboard:**
1. Go to your Railway project
2. Click on your service
3. Go to the "Deployments" tab
4. Click "New Deployment" → "Run Command"
5. Run: `node sync-all.js`

**Via Railway CLI:**
```bash
railway run node sync-all.js
```

**Via Railway Console:**
1. Go to your service → "Settings" → "Console"
2. Run: `node sync-all.js`

This will sync both IDX and VOW feeds (all properties).

---

## 2. Set Up Hourly Cron Job

Railway supports cron jobs via a **Cron Service**. Here's how to set it up:

### Option A: Railway Cron Service (Recommended)

1. **Create a Cron Service:**
   - In your Railway project, click "New" → "Cron"
   - Or add a cron service via Railway dashboard

2. **Configure the Cron:**
   - **Schedule:** `0 * * * *` (runs every hour at minute 0)
   - **Command:** `node sync-all.js incremental`
   - **Service:** Select your backend service

3. **Alternative Schedule Formats:**
   - Every hour: `0 * * * *`
   - Every 30 minutes: `*/30 * * * *`
   - Every 15 minutes: `*/15 * * * *`
   - Daily at 2 AM: `0 2 * * *`

### Option B: Railway CLI (if Cron service not available)

If Railway Cron isn't available, you can use Railway's scheduled tasks or an external cron service:

**Using Railway Scheduled Tasks:**
```bash
# Set up via Railway CLI (if supported)
railway cron add "0 * * * *" "node sync-all.js incremental"
```

### Option C: External Cron Service (Fallback)

If Railway doesn't support cron, use an external service like:
- **cron-job.org** (free)
- **EasyCron** (free tier)
- **GitHub Actions** (if repo is on GitHub)

**Example with cron-job.org:**
1. Sign up at cron-job.org
2. Create new cron job
3. URL: `https://your-railway-app.railway.app/trigger-sync` (POST request)
4. Schedule: Every hour
5. Body: `{"type": "IDX", "incremental": true}`

---

## 3. Sync Commands Reference

### Full Sync (Backfill)
```bash
node sync-all.js
```
- Syncs both IDX and VOW
- Fetches all properties from start

### Incremental Sync (Hourly)
```bash
node sync-all.js incremental
```
- Syncs only new/updated properties since last sync
- Faster, recommended for hourly runs

### Sync Only IDX
```bash
node sync-all.js idx incremental
```

### Sync Only VOW
```bash
node sync-all.js vow incremental
```

### Sync with Limit (Testing)
```bash
node sync-all.js -100 incremental
```
- Syncs first 100 properties (useful for testing)

---

## 4. Verify Cron Job is Working

1. **Check Railway Logs:**
   - Go to your service → "Logs"
   - Look for sync execution logs

2. **Check Sync Status:**
   - Monitor the `/health` endpoint
   - Check database for new properties

3. **Test Manually:**
   ```bash
   railway run node sync-all.js incremental -10
   ```
   This runs a test sync with 10 properties.

---

## 5. Recommended Setup

**Initial Setup:**
1. Run full backfill: `node sync-all.js`
2. Set up hourly cron: `node sync-all.js incremental`

**Production Setup:**
- **Hourly:** Incremental sync (`node sync-all.js incremental`)
- **Daily:** Full sync at off-peak hours (e.g., 2 AM)
- **On-demand:** Manual sync via Railway console

---

## Notes

- **Incremental sync** is recommended for hourly runs as it's faster
- **Full sync** should be run periodically (daily/weekly) to catch any missed updates
- Monitor logs to ensure syncs are completing successfully
- Adjust sync frequency based on your data update needs

