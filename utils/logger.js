// ===============================================================================================
// STRUCTURED LOGGING UTILITY
// ===============================================================================================

import { recordHttpRequest } from './metrics.js';

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;
const isDevelopment = process.env.NODE_ENV === 'development';

function formatLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...meta
  };

  // Check if we're in sync mode (detected by SYNC_MODE env var or if running sync scripts)
  const isSyncMode = process.env.SYNC_MODE === 'true' || 
                     process.argv[1]?.includes('sync-all.js') || 
                     process.argv[1]?.includes('sequential.js');

  if (isDevelopment || isSyncMode) {
    // Pretty print in development or sync mode
    const emoji = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : level === 'SUCCESS' ? '✅' : level === 'INFO' ? 'ℹ️' : '';
    console.log(`${emoji} [${level}] ${message}`, Object.keys(meta).length > 0 ? meta : '');
  } else {
    // JSON format for production (easier to parse)
    console.log(JSON.stringify(logEntry));
  }
}

const exportedLogger = {
  error: (message, meta = {}) => {
    if (currentLogLevel >= LOG_LEVELS.ERROR) {
      formatLog('ERROR', message, meta);
    }
  },

  warn: (message, meta = {}) => {
    if (currentLogLevel >= LOG_LEVELS.WARN) {
      formatLog('WARN', message, meta);
    }
  },

  info: (message, meta = {}) => {
    if (currentLogLevel >= LOG_LEVELS.INFO) {
      formatLog('INFO', message, meta);
    }
  },

  debug: (message, meta = {}) => {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      formatLog('DEBUG', message, meta);
    }
  },

  // Additional methods for backward compatibility
  success: (message, meta = {}) => {
    if (currentLogLevel >= LOG_LEVELS.INFO) {
      formatLog('SUCCESS', message, meta);
    }
  },

  progress: (message, meta = {}) => {
    if (currentLogLevel >= LOG_LEVELS.INFO) {
      // Handle sync progress format: Logger.progress(current, total, listingKey, syncType, childCounts)
      if (typeof message === 'number' && meta && typeof meta === 'object' && meta.total !== undefined) {
        // This is a sync progress call - format it nicely
        const current = message;
        const total = meta.total;
        const listingKey = meta.listingKey || '';
        const syncType = meta.syncType || 'SYNC';
        const childCounts = meta.childCounts || {};
        
        const percent = total > 0 ? ((current / total) * 100).toFixed(1) : '0.0';
        const barLength = 30;
        const filled = Math.round((current / total) * barLength);
        const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
        
        // Calculate rate and ETA
        const now = Date.now();
        if (!exportedLogger._progressState) {
          exportedLogger._progressState = { startTime: now, lastUpdate: now, lastCount: 0 };
        }
        const state = exportedLogger._progressState;
        
        const elapsed = (now - state.startTime) / 1000; // seconds
        const rate = elapsed > 0 ? (current / elapsed).toFixed(1) : '0';
        const remaining = total - current;
        const etaSeconds = rate > 0 ? Math.round(remaining / parseFloat(rate)) : 0;
        const etaMinutes = Math.floor(etaSeconds / 60);
        const etaHours = Math.floor(etaMinutes / 60);
        const etaStr = etaHours > 0 
          ? `${etaHours}h ${etaMinutes % 60}m`
          : etaMinutes > 0 
          ? `${etaMinutes}m ${etaSeconds % 60}s`
          : `${etaSeconds}s`;

        // Update every 10 items or every 5 seconds
        const timeSinceLastUpdate = (now - state.lastUpdate) / 1000;
        if (current % 10 === 0 || timeSinceLastUpdate >= 5 || current === total) {
          const childInfo = [];
          if (childCounts.media !== undefined) childInfo.push(`Media: ${childCounts.media}`);
          if (childCounts.rooms !== undefined) childInfo.push(`Rooms: ${childCounts.rooms}`);
          if (childCounts.openHouse !== undefined) childInfo.push(`OpenHouse: ${childCounts.openHouse}`);
          
          const childStr = childInfo.length > 0 ? ` | ${childInfo.join(', ')}` : '';
          
          // Use \r to overwrite the same line
          process.stdout.write(
            `\r[${syncType}] ${bar} ${percent}% | ${current.toLocaleString()}/${total.toLocaleString()} | ` +
            `Rate: ${rate}/s | ETA: ${etaStr}${childStr}        `
          );
          
          if (current === total) {
            process.stdout.write('\n'); // New line when complete
          }
          
          state.lastUpdate = now;
          state.lastCount = current;
        }
      } else {
        // Regular progress log
        formatLog('PROGRESS', message, meta);
      }
    }
  }
};

// Export logger
export const logger = exportedLogger;

// Export Logger as alias for backward compatibility
export const Logger = exportedLogger;

/**
 * Request logging middleware with request IDs
 */
export function requestLogger(req, res, next) {
  // Generate request ID
  req.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const start = Date.now();
  const startTime = new Date().toISOString();

  // Log request
  logger.info('Request started', {
    requestId: req.id,
    method: req.method,
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent')
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    
    // Record metrics
    recordHttpRequest(req.method, req.path, res.statusCode, duration);
    
    logger[level]('Request completed', {
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('content-length')
    });

    // Warn on slow requests
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        requestId: req.id,
        path: req.path,
        duration: `${duration}ms`
      });
    }
  });

  next();
}

/**
 * Performance monitoring for database queries
 */
export function logQuery(queryName, duration, meta = {}) {
  // Import here to avoid circular dependency
  import('./metrics.js').then(({ recordDatabaseQuery }) => {
    recordDatabaseQuery(queryName, duration, meta.error !== undefined);
  }).catch(() => {
    // Silently fail if metrics not available
  });
  const level = duration > 1000 ? 'warn' : duration > 500 ? 'info' : 'debug';
  
  logger[level]('Database query', {
    query: queryName,
    duration: `${duration}ms`,
    ...meta
  });

  if (duration > 2000) {
    logger.warn('Slow query detected', {
      query: queryName,
      duration: `${duration}ms`,
      ...meta
    });
  }
}
