import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { runSequentialSync } from './sync/sequential.js';
import { parseArgs } from './utils/args.js';
import propertiesRouter from './routes/properties.js';
import searchRouter from './routes/search.js';
import mediaRouter from './routes/media.js';
import usersRouter from './routes/users.js';
import likesRouter from './routes/likes.js';
import savedListingsRouter from './routes/saved-listings.js';
import viewingHistoryRouter from './routes/viewing-history.js';
import savedSearchesRouter from './routes/saved-searches.js';
import notificationsRouter from './routes/notifications.js';
import { rateLimit } from './utils/rateLimit.js';
import { clearCache } from './utils/cache.js';
import { spawn } from 'child_process';
import { requestLogger, logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './utils/errors.js';
import { securityHeaders } from './utils/security.js';
import { initDB } from './db/client.js';
import { getMetrics } from './utils/metrics.js';

// Load environment variables from .env.local (preferred) or fallback to environment.env
const envLocalResult = dotenv.config({ path: './.env.local' });
if (envLocalResult.error && envLocalResult.error.code !== 'ENOENT') {
  console.log('Warning: Could not load .env.local:', envLocalResult.error.message);
}
if (!process.env.PORT && !process.env.SUPABASE_URL) {
  const envResult = dotenv.config({ path: './environment.env' });
  if (envResult.error && envResult.error.code !== 'ENOENT') {
    console.log('Warning: Could not load environment.env:', envResult.error.message);
  }
}

// Validate required environment variables before starting server
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('\n❌ ERROR: Missing required environment variables:');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\n💡 Please create a .env.local file in the BACKEND_API directory with:');
  console.error('   SUPABASE_URL=https://your-project.supabase.co');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  console.error('\n   See TROUBLESHOOTING.md for more information.\n');
  process.exit(1);
}

// Log OpenAI API key status (for debugging)
if (process.env.OPENAI_API_KEY) {
  const maskedKey = process.env.OPENAI_API_KEY.length > 10 
    ? `${process.env.OPENAI_API_KEY.substring(0, 7)}...${process.env.OPENAI_API_KEY.substring(process.env.OPENAI_API_KEY.length - 4)}`
    : '***';
  logger.info('OpenAI API key loaded from environment', { keyPrefix: maskedKey });
} else {
  logger.warn('OpenAI API key not found in environment variables');
}

// ===============================================================================================
// [1] EXPRESS SERVER SETUP
// ===============================================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security headers (first)
app.use(securityHeaders);

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve OpenAPI spec (BEFORE static middleware to ensure it's matched)
console.log('[Server Init] Registering /openapi.json route...');
app.get('/openapi.json', (req, res) => {
  try {
    const specPath = path.join(__dirname, 'docs', 'openapi.json');
    if (!fs.existsSync(specPath)) {
      return res.status(404).json({ error: 'OpenAPI spec file not found', path: specPath });
    }
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    res.setHeader('Content-Type', 'application/json');
    return res.json(spec);
  } catch (err) {
    console.error('[OpenAPI] Error:', err.message);
    return res.status(500).json({ error: 'Failed to load OpenAPI spec', message: err.message });
  }
});
console.log('[Server Init] /openapi.json route registered');

// Static files
app.use(express.static('public'));

// Request logging with request IDs
app.use(requestLogger);

// CORS - restrict to allowed origins (ALLOWED_ORIGINS comma-separated)
// In development, allow localhost origins for easier testing
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const isDevelopment = process.env.NODE_ENV !== 'production';

// Log CORS configuration on startup
if (isDevelopment) {
  console.log('[CORS] Development mode: localhost origins allowed');
} else {
  if (allowedOrigins.length > 0) {
    console.log(`[CORS] Production mode: ${allowedOrigins.length} allowed origin(s):`, allowedOrigins);
  } else {
    console.warn('[CORS] ⚠️  Production mode: NO ALLOWED_ORIGINS configured!');
    console.warn('[CORS] ⚠️  Set ALLOWED_ORIGINS environment variable in Railway to allow frontend requests.');
    console.warn('[CORS] ⚠️  Example: ALLOWED_ORIGINS=https://frontend-api-pi.vercel.app');
  }
}

// Helper function to set CORS headers
function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  
  // Always set CORS headers for preflight and methods
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (!origin) {
    // Non-browser or same-origin request - no origin header needed
    return false; // Not a cross-origin request
  }
  
  // Check if origin is allowed
  let isAllowed = false;
  
  // Always allow localhost for development (common use case)
  const localhostRegex = /^https?:\/\/localhost(:\d+)?$/;
  if (localhostRegex.test(origin)) {
    isAllowed = true;
  } else if (allowedOrigins.length > 0) {
    // Check against configured allowed origins
    isAllowed = allowedOrigins.includes(origin);
  }
  // If no origins configured and not localhost, deny (isAllowed remains false)
  
  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return true; // CORS headers set
  }
  
  // Log warning in production if origin is not allowed
  if (!isDevelopment && origin) {
    logger.warn('CORS: Origin not allowed', { 
      origin, 
      allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : 'none configured',
      hint: 'Set ALLOWED_ORIGINS environment variable in Railway'
    });
  }
  
  return false; // Origin not allowed
}

app.use((req, res, next) => {
  setCorsHeaders(req, res);
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Global rate limit (override via env RATE_LIMIT_*)
app.use(rateLimit({ windowMs: 60000, max: 120 }));

// [1.1] Serve Dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// [1.2] Metrics Endpoint (Prometheus format)
app.get('/metrics', (req, res) => {
  try {
    const metrics = getMetrics();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(metrics);
  } catch (error) {
    logger.error('Metrics endpoint error', { error: error.message, stack: error.stack });
    res.status(500).send('# Error generating metrics\n');
  }
});

// [1.3] Health Check Endpoint (with database connectivity check)
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'TRREB Sync Service',
    checks: {
      database: 'unknown'
    }
  };

  // Check database connectivity with timeout
  try {
    const db = initDB();
    
    // Create a timeout promise that rejects after 5 seconds
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });
    
    // Simple query to verify connectivity (using a lightweight view query)
    const queryPromise = db
      .from('PropertyCardView')
      .select('ListingKey', { count: 'exact', head: true })
      .limit(1);
    
    // Race between query and timeout
    const { error } = await Promise.race([queryPromise, timeoutPromise]);
    
    if (error) {
      health.status = 'degraded';
      health.checks.database = 'error';
      health.checks.databaseError = error.message;
      return res.status(503).json(health);
    }
    
    health.checks.database = 'ok';
  } catch (error) {
    health.status = 'degraded';
    health.checks.database = 'error';
    health.checks.databaseError = error.message || String(error);
    // Still return 200 but with degraded status so the server is considered "up"
    return res.status(200).json(health);
  }

  res.json(health);
});


// Test route to verify route registration works
app.get('/test-route-debug', (req, res) => {
  res.json({ message: 'Test route works!', timestamp: new Date().toISOString() });
});

// [1.3] Trigger Sync Endpoint (for dashboard buttons)
app.post('/trigger-sync', async (req, res) => {
  const { type = 'IDX', reset = false, limit = null } = req.body;
  
  console.log(`Manual sync triggered: ${type} | Reset: ${reset} | Limit: ${limit}`);
  
  // Send immediate response
  res.json({ 
    success: true, 
    message: `${type} sync triggered`,
    timestamp: new Date().toISOString()
  });
  
  // Handle ALL type with sequential execution
  if (type === 'ALL') {
    runSyncAllInBackground({ reset, limit });
  } else {
    runSyncInBackground({ syncType: type, reset, limit });
  }
});

// [1.4] Property API Routes (Frontend-facing endpoints)
app.use('/api/properties', propertiesRouter);
app.use('/api/search', searchRouter);
app.use('/api/media', mediaRouter);
app.use('/api/users', usersRouter);
app.use('/api/likes', likesRouter);
app.use('/api/saved-listings', savedListingsRouter);
app.use('/api/viewing-history', viewingHistoryRouter);
app.use('/api/saved-searches', savedSearchesRouter);
app.use('/api/notifications', notificationsRouter);

// [1.5] Admin - Cache Bust (requires ADMIN_TOKEN header match)
app.post('/admin/cache-bust', (req, res, next) => {
  try {
    const provided = req.header('x-admin-token') || req.header('authorization')?.replace(/^Bearer\s+/i, '') || '';
    const expected = process.env.ADMIN_TOKEN || '';
    if (!expected || provided !== expected) {
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid or missing admin token' });
    }
    clearCache();
    res.json({ success: true, message: 'In-memory caches cleared' });
  } catch (error) {
    next(error);
  }
});

// [1.6] Error handling (must be after all routes)
app.use(notFoundHandler);
app.use(errorHandler);

// [1] END

// ===============================================================================================
// [2] SYNC EXECUTION FUNCTIONS
// ===============================================================================================

// Single sync type execution
async function runSyncInBackground(args) {
  try {
    console.log(`\nTRREB Sequential Sync Starting`);
    console.log(`Mode: ${args.syncType} | Limit: ${args.limit || 'none'}\n`);

    await runSequentialSync(args);
    
    console.log(`SUCCESS: ${args.syncType} sync completed!`);
  } catch (error) {
    console.error(`\nERROR: ${args.syncType} sync failed`);
    console.error(error.message);
    if (error.stack) console.error(error.stack);
  }
}

// Combined IDX + VOW execution (sequential)
async function runSyncAllInBackground(args) {
  const startTime = Date.now();
  
  try {
    console.log('\n========================================');
    console.log('COMBINED SYNC (IDX + VOW)');
    console.log('========================================');
    console.log(`Limit: ${args.limit || 'None'} | Reset: ${args.reset}\n`);

    // Run IDX first
    console.log('>>> Starting IDX Sync...\n');
    await runSequentialSync({
      syncType: 'IDX',
      reset: args.reset,
      limit: args.limit
    });
    console.log('\n>>> IDX Sync Complete!\n');

    // Then run VOW
    console.log('>>> Starting VOW Sync...\n');
    await runSequentialSync({
      syncType: 'VOW',
      reset: args.reset,
      limit: args.limit
    });
    console.log('\n>>> VOW Sync Complete!\n');

    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    console.log('========================================');
    console.log('COMBINED SYNC COMPLETE');
    console.log(`Total Time: ${totalTime} minutes`);
    console.log('========================================\n');
    
  } catch (error) {
    console.error('\nERROR: Combined sync failed');
    console.error(error.message);
    if (error.stack) console.error(error.stack);
  }
}

// [2] END

// ===============================================================================================
// [3] SERVER STARTUP & GRACEFUL SHUTDOWN
// ===============================================================================================

const PORT = process.env.PORT || 8080;

// Store intervals for cleanup during graceful shutdown
const activeIntervals = new Set();

// Store server instance for graceful shutdown
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`TRREB Sync Service running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`API: http://localhost:${PORT}/api/properties`);
  console.log(`Search: http://localhost:${PORT}/api/search`);
  
  // Auto-sync enabled by default (can be disabled with RUN_SYNC_ON_START=false)
  const args = parseArgs();
  if (process.env.RUN_SYNC_ON_START !== 'false') {
    console.log('\nAuto-sync enabled - starting initial sync...');
    runSyncInBackground(args);
  } else {
    console.log('\nWaiting for manual trigger or cron schedule...');
  }

  // Optional: Auto-refresh materialized views on interval
  const refreshIntervalMs = process.env.REFRESH_MVS_INTERVAL_MS ? Number(process.env.REFRESH_MVS_INTERVAL_MS) : null;
  
  if (refreshIntervalMs && refreshIntervalMs > 0) {
    console.log(`\n📊 MV Auto-refresh enabled: every ${refreshIntervalMs}ms (${Math.round(refreshIntervalMs / 1000 / 60)} minutes)`);
    let isRefreshing = false;
    const mvRefreshInterval = setInterval(async () => {
      if (isRefreshing) {
        console.log('⏭️  MV refresh already in progress, skipping...');
        return;
      }
      isRefreshing = true;
      console.log(`\n🔄 Starting scheduled MV refresh...`);
      try {
        // Spawn refresh script as child process
        const child = spawn('node', ['scripts/refresh-mvs.js'], {
          stdio: 'inherit',
          env: process.env
        });
        child.on('close', (code) => {
          isRefreshing = false;
          if (code === 0) {
            console.log('✅ Scheduled MV refresh completed');
          } else {
            console.warn(`⚠️  Scheduled MV refresh exited with code ${code}`);
          }
        });
      } catch (err) {
        isRefreshing = false;
        console.error('❌ Scheduled MV refresh error:', err.message);
      }
    }, refreshIntervalMs);
    activeIntervals.add(mvRefreshInterval);
  } else {
    console.log('\n📊 MV Auto-refresh: disabled (set REFRESH_MVS_INTERVAL_MS to enable)');
  }
});

// [3.1] GRACEFUL SHUTDOWN HANDLERS
// ===============================================================================================

let isShuttingDown = false;
const SHUTDOWN_TIMEOUT_MS = 30000; // 30 seconds max for graceful shutdown

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log(`⚠️  ${signal} received again, forcing immediate shutdown...`);
    process.exit(1);
  }

  isShuttingDown = true;
  console.log(`\n🛑 ${signal} received, starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(() => {
    console.log('✅ HTTP server closed, no longer accepting new connections');
  });

  // Clear all active intervals (like MV refresh)
  if (activeIntervals.size > 0) {
    activeIntervals.forEach(interval => {
      clearInterval(interval);
    });
    console.log(`✅ Cleared ${activeIntervals.size} active interval(s)`);
    activeIntervals.clear();
  }

  // Wait for existing connections to finish (with timeout)
  setTimeout(() => {
    console.error('❌ Graceful shutdown timeout exceeded, forcing exit...');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  // Give in-flight requests time to complete
  // Express will naturally close when server.close() completes
  // No explicit database cleanup needed for Supabase client (HTTP-based)
  
  console.log('✅ Graceful shutdown complete');
  process.exit(0);
}

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// [3] END