# Backend Server Hanging - Troubleshooting Guide

## Problem
The backend server at `http://localhost:8080` keeps loading and doesn't respond to requests.

## Root Cause
The server is likely hanging on database queries. The health endpoint (`/health`) queries the database, and if that query hangs or times out, all requests will hang.

## Solution

### 1. Restart the Backend Server

Stop the current backend server process and restart it:

```bash
# Find the process ID (from netstat output, it was 7764)
# Kill the process
taskkill /PID 7764 /F

# Or if using npm/node directly, press Ctrl+C in the terminal running the server

# Then restart:
cd BACKEND_API
npm start
```

### 2. Check Database Connection

The server requires these environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Make sure these are set in `.env.local` or `environment.env` in the `BACKEND_API` directory.

### 3. Test the Health Endpoint

After restarting, test the health endpoint:
```bash
curl http://localhost:8080/health
```

Or visit in browser: `http://localhost:8080/health`

### 4. Check Server Logs

Look at the server console output for:
- Database connection errors
- Query timeout errors
- Any error messages during startup

### 5. Test Simple Endpoint

Try the test route that doesn't require database:
```bash
curl http://localhost:8080/test-route-debug
```

If this works but `/health` doesn't, the issue is with the database connection.

## Recent Fixes Applied

1. Added timeout to health check query (5 seconds)
2. Changed health check to return 200 even if database check fails (degraded status)
3. Fixed view name from `PropertyView` to `PropertyCardView`

## Next Steps

1. Restart the backend server
2. Test `http://localhost:8080/health` - it should respond within 5 seconds
3. If it still hangs, check database credentials and network connectivity to Supabase

