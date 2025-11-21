# Quick Fix: CORS Error in Production

## The Problem

You're seeing this error in your browser console:
```
Access to fetch at 'https://backendapi-production-b634.up.railway.app/api/properties...' 
from origin 'https://frontend-api-pi.vercel.app' has been blocked by CORS policy: 
No 'Access-Control-Allow-Origin' header is present
```

## The Solution (2 minutes)

The `ALLOWED_ORIGINS` environment variable is not set in Railway. Here's how to fix it:

### Option 1: Railway Dashboard (Easiest)

1. Go to [Railway Dashboard](https://railway.app)
2. Select your backend project
3. Click on the **Variables** tab
4. Click **+ New Variable**
5. Add:
   - **Key**: `ALLOWED_ORIGINS`
   - **Value**: `https://frontend-api-pi.vercel.app`
6. Click **Add**
7. Railway will automatically redeploy (wait 1-2 minutes)

### Option 2: Railway CLI

```bash
cd BACKEND_API
railway variables set ALLOWED_ORIGINS=https://frontend-api-pi.vercel.app
```

### Option 3: Multiple Frontend URLs

If you have multiple frontend URLs (production + staging), use comma-separated values (no spaces):

```
ALLOWED_ORIGINS=https://frontend-api-pi.vercel.app,https://staging-frontend.vercel.app
```

## Verify It's Fixed

1. Wait for Railway to finish redeploying (check Railway dashboard)
2. Open your frontend: https://frontend-api-pi.vercel.app
3. Check browser console - CORS errors should be gone
4. Properties should load normally

## Check CORS Config Locally

Run this command to verify your CORS configuration:

```bash
cd BACKEND_API
npm run check:cors
```

## Still Not Working?

1. **Check Railway Logs**: 
   - Railway Dashboard → Your Service → Logs
   - Look for the CORS warning message on startup
   - Should see: `[CORS] Production mode: 1 allowed origin(s): https://frontend-api-pi.vercel.app`

2. **Verify Environment Variable**:
   - Railway Dashboard → Variables tab
   - Make sure `ALLOWED_ORIGINS` is exactly: `https://frontend-api-pi.vercel.app`
   - No extra spaces, no quotes, include `https://`

3. **Test Health Endpoint**:
   ```bash
   curl https://backendapi-production-b634.up.railway.app/health
   ```
   Should return `{"status":"ok",...}`

4. **Check Frontend URL**: Make sure the URL in `ALLOWED_ORIGINS` matches exactly what's in your browser's address bar (including `https://`)

## Need Help?

See `docs/FIX_CORS_502_ERROR.md` for more detailed troubleshooting.

