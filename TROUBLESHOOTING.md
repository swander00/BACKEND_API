# Backend Troubleshooting Guide

## Common Issues and Solutions

### 0. Server Hanging / Not Responding

If the backend server keeps loading and doesn't respond to requests:

**Root Cause**: The server is likely hanging on database queries. The health endpoint (`/health`) queries the database, and if that query hangs or times out, all requests will hang.

**Solution**:
1. **Restart the Backend Server**
   - Stop the current backend server process (Ctrl+C or kill process)
   - Restart: `cd BACKEND_API && npm start`

2. **Check Database Connection**
   - Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set correctly
   - Test database connectivity with: `npm run test:smoke`

3. **Check for Long-Running Queries**
   - Review Railway logs for slow queries
   - Check if materialized views need refreshing: `npm run refresh:mvs`

4. **Verify Environment Variables**
   - Ensure all required variables are loaded (see section 1 below)

### 1. Backend Not Starting

#### Check Environment Variables

The backend requires these environment variables to be set:

**Required:**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (not the anon key!)

**Optional (with defaults):**
- `PORT` - Server port (default: 8080)
- `NODE_ENV` - Environment mode (development/production)
- `RUN_SYNC_ON_START` - Set to `false` to disable auto-sync on startup (default: true)

#### Create Environment File

Create a `.env.local` file in the `BACKEND_API` directory:

```bash
# Supabase Configuration (REQUIRED)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Server Configuration
PORT=8080
NODE_ENV=development
RUN_SYNC_ON_START=false

# Optional: CORS Origins (comma-separated)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

**OR** create `environment.env` file (fallback option).

#### Verify Environment Variables Are Loaded

Run this command to check if variables are loaded:

```bash
cd BACKEND_API
node -e "require('dotenv').config({ path: './.env.local' }); console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Missing'); console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Missing');"
```

### 2. Port Already in Use

If you see an error like `EADDRINUSE: address already in use :::8080`:

**Windows:**
```powershell
# Find process using port 8080
netstat -ano | findstr :8080

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

**Mac/Linux:**
```bash
# Find process using port 8080
lsof -i :8080

# Kill the process
kill -9 <PID>
```

### 3. Database Connection Issues

If the server starts but database queries fail:

1. **Verify Supabase credentials:**
   - Check `SUPABASE_URL` is correct (should end with `.supabase.co`)
   - Check `SUPABASE_SERVICE_ROLE_KEY` is the service role key (not anon key)
   - Get these from: Supabase Dashboard → Settings → API

2. **Test database connection:**
   ```bash
   cd BACKEND_API
   node -e "
   require('dotenv').config({ path: './.env.local' });
   const { createClient } = require('@supabase/supabase-js');
   const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
   supabase.from('PropertyView').select('ListingKey').limit(1).then(r => {
     if (r.error) {
       console.error('Database error:', r.error.message);
       process.exit(1);
     } else {
       console.log('Database connection successful!');
       process.exit(0);
     }
   });
   "
   ```

### 4. Missing Dependencies

If you see module not found errors:

```bash
cd BACKEND_API
npm install
```

### 5. Node Version Issues

The backend requires Node.js 18+:

```bash
node --version  # Should be 18.x or higher
```

If you need to update Node.js, use [nvm](https://github.com/nvm-sh/nvm) or download from [nodejs.org](https://nodejs.org).

### 6. Server Starts But Crashes Immediately

Check the logs for errors:

```bash
cd BACKEND_API
node index.js
```

Common causes:
- Missing environment variables (check `.env.local`)
- Database connection failure
- Port conflict
- Syntax errors in code

### 7. Health Check Fails

Test the health endpoint:

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-...",
  "service": "TRREB Sync Service",
  "checks": {
    "database": "ok"
  }
}
```

If `database` shows `"error"`, check your Supabase credentials.

## Quick Start Checklist

- [ ] Node.js 18+ installed (`node --version`)
- [ ] Dependencies installed (`npm install` in BACKEND_API)
- [ ] `.env.local` file created with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Port 8080 is available
- [ ] Supabase credentials are correct
- [ ] Database views are set up (PropertyView, PropertyDetailsView, etc.)

## Getting Help

1. Check the logs: `node index.js` (runs in foreground, shows all logs)
2. Test health endpoint: `curl http://localhost:8080/health`
3. Verify environment variables are loaded
4. Check Supabase dashboard for database connectivity

## Running the Server

**Development (foreground, with logs):**
```bash
cd BACKEND_API
npm start
```

**With PM2 (background process):**
```bash
cd BACKEND_API
npm run start:pm2
npm run logs:pm2  # View logs
```

**With Docker:**
```bash
cd BACKEND_API
docker-compose up
```

