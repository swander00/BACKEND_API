# GitHub Actions Setup for Railway Syncs

This guide shows you how to trigger Railway syncs from GitHub Actions.

## Setup Steps

### 1. Add GitHub Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these secrets:

1. **`RAILWAY_API_URL`**
   - Value: `https://backendapi-production-b634.up.railway.app` (your Railway URL)
   - Or: `https://your-custom-domain.com` if you have one

2. **`ADMIN_TOKEN`** (if your endpoint requires it)
   - Value: Your admin token from Railway environment variables
   - Check if `/trigger-sync` endpoint requires authentication

### 2. Workflows Created

Two workflows have been created:

#### `sync-backfill.yml` - Manual Backfill
- **Location**: `.github/workflows/sync-backfill.yml`
- **Usage**: 
  - Go to GitHub → **Actions** tab
  - Select "Trigger Railway Backfill Sync"
  - Click "Run workflow"
  - Choose options:
    - Sync type: ALL, IDX, or VOW
    - Reset: Start from beginning (true/false)
    - Limit: Number of properties (optional)
  - Click "Run workflow"

#### `sync-hourly.yml` - Automated Hourly Sync
- **Location**: `.github/workflows/sync-hourly.yml`
- **Usage**: 
  - Runs automatically every hour
  - Can also be triggered manually from Actions tab
  - Runs incremental sync (only new/updated properties)

### 3. Verify Endpoint Authentication

Check if your `/trigger-sync` endpoint requires authentication:

1. Test the endpoint:
   ```bash
   curl -X POST https://backendapi-production-b634.up.railway.app/trigger-sync \
     -H "Content-Type: application/json" \
     -d '{"type": "ALL"}'
   ```

2. If it requires authentication, update the endpoint in `index.js` to accept `x-admin-token` header, or update the GitHub Actions workflows to use Railway CLI instead.

### 4. Alternative: Use Railway CLI in GitHub Actions

If the API endpoint doesn't work, you can use Railway CLI directly:

```yaml
- name: Install Railway CLI
  run: npm install -g @railway/cli

- name: Trigger Sync
  env:
    RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
  run: |
    railway login --token $RAILWAY_TOKEN
    railway run --service backend_api node sync-all.js
```

## Usage Examples

### Manual Backfill (Full Sync)
1. Go to GitHub → Actions
2. Select "Trigger Railway Backfill Sync"
3. Click "Run workflow"
4. Select:
   - Sync type: `ALL`
   - Reset: `false` (or `true` to start from beginning)
   - Limit: Leave empty for full sync
5. Click "Run workflow"

### Test Sync (Limited)
1. Go to GitHub → Actions
2. Select "Trigger Railway Backfill Sync"
3. Click "Run workflow"
4. Select:
   - Sync type: `ALL`
   - Reset: `false`
   - Limit: `100` (test with 100 properties)
5. Click "Run workflow"

### Hourly Automated Sync
- Already configured to run every hour automatically
- No action needed
- Check Actions tab to see execution history

## Monitoring

- **GitHub Actions**: Check the Actions tab for workflow execution status
- **Railway Logs**: Go to Railway → Your Service → Logs to see sync progress
- **API Response**: The endpoint returns immediately, sync runs in background

## Troubleshooting

### Workflow fails with 401/403
- Check if `ADMIN_TOKEN` secret is set correctly
- Verify the endpoint accepts the token format you're sending
- Check Railway logs for authentication errors

### Workflow succeeds but sync doesn't run
- Check Railway logs to see if sync was triggered
- Verify the endpoint is working: `curl -X POST https://your-url/trigger-sync`
- Check if `runSyncAllInBackground` function is working correctly

### Need to update sync command
- Edit `.github/workflows/sync-backfill.yml` or `sync-hourly.yml`
- Change the `type`, `reset`, or `limit` values in the JSON payload

