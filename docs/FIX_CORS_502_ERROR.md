# Fix CORS and 502 Bad Gateway Errors in Production

## Problem

You're seeing two errors in production:

1. **CORS Error**: `Access to fetch at 'https://backendapi-production-b634.up.railway.app/api/properties...' from origin 'https://frontend-api-pi.vercel.app' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present`

2. **502 Bad Gateway**: `GET https://backendapi-production-b634.up.railway.app/api/properties... net::ERR_FAILED 502 (Bad Gateway)`

## Root Cause

The `ALLOWED_ORIGINS` environment variable is **not set** in Railway, so:
- The backend doesn't allow requests from `https://frontend-api-pi.vercel.app`
- CORS headers are not being sent
- If the backend crashes due to missing CORS config, you get a 502 error

## Solution

### Step 1: Set ALLOWED_ORIGINS in Railway

1. Go to your Railway project dashboard
2. Navigate to **Variables** tab
3. Add the following environment variable:

```
ALLOWED_ORIGINS=https://frontend-api-pi.vercel.app
```

**Important**: 
- Use comma-separated values if you have multiple frontend URLs
- No spaces after commas
- Include the protocol (`https://`)
- Example: `https://frontend-api-pi.vercel.app,https://www.yourdomain.com`

### Step 2: Verify Other Required Environment Variables

Make sure these are also set in Railway:

```
NODE_ENV=production
PORT=8080
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Step 3: Redeploy

After adding the environment variable:
1. Railway will automatically redeploy, OR
2. Manually trigger a redeploy from the Railway dashboard

### Step 4: Test

1. Check the health endpoint:
   ```bash
   curl https://backendapi-production-b634.up.railway.app/health
   ```

2. Test CORS from browser console:
   ```javascript
   fetch('https://backendapi-production-b634.up.railway.app/api/properties?page=1&pageSize=20&sortBy=newest&status=For+Sale', {
     headers: {
       'Origin': 'https://frontend-api-pi.vercel.app'
     }
   })
   .then(r => r.json())
   .then(console.log)
   .catch(console.error)
   ```

## Verification Checklist

- [ ] `ALLOWED_ORIGINS` is set in Railway Variables
- [ ] Value includes your frontend URL: `https://frontend-api-pi.vercel.app`
- [ ] Railway has redeployed after adding the variable
- [ ] `/health` endpoint returns 200 OK
- [ ] CORS errors are gone in browser console
- [ ] API requests succeed from frontend

## Additional Notes

### If 502 Persists After Fixing CORS

If you still get 502 errors after setting `ALLOWED_ORIGINS`:

1. **Check Railway Logs**:
   - Go to Railway Dashboard → Your Service → Logs
   - Look for startup errors or crashes
   - Common issues:
     - Missing `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`
     - Database connection failures
     - Port conflicts

2. **Check Health Endpoint**:
   ```bash
   curl https://backendapi-production-b634.up.railway.app/health
   ```
   - Should return JSON with `status: "ok"`
   - If it returns 503, check database connectivity

3. **Verify Environment Variables**:
   - All required variables are set
   - No typos in variable names
   - Values are correct (no extra spaces)

### Multiple Frontend URLs

If you have multiple frontend URLs (e.g., production and staging):

```
ALLOWED_ORIGINS=https://frontend-api-pi.vercel.app,https://staging-frontend.vercel.app
```

### Development vs Production

- **Development**: Localhost is automatically allowed
- **Production**: Must explicitly set `ALLOWED_ORIGINS` with your frontend URL(s)

## Code Changes Made

The following improvements were made to handle CORS better:

1. **Improved CORS middleware** (`BACKEND_API/index.js`):
   - Better logging when origin is not allowed
   - Helper function for setting CORS headers

2. **Error handlers set CORS headers** (`BACKEND_API/utils/errors.js`):
   - Error responses now include CORS headers
   - Prevents CORS errors from masking actual errors

## Quick Fix Command (Railway CLI)

If you have Railway CLI installed:

```bash
cd BACKEND_API
railway variables set ALLOWED_ORIGINS=https://frontend-api-pi.vercel.app
railway up
```

## Still Having Issues?

1. Check Railway deployment logs for errors
2. Verify all environment variables are set correctly
3. Test the `/health` endpoint directly
4. Check if the backend service is running in Railway dashboard


