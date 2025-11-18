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

  if (isDevelopment) {
    // Pretty print in development
    console.log(`[${timestamp}] [${level}] ${message}`, Object.keys(meta).length > 0 ? meta : '');
  } else {
    // JSON format for production (easier to parse)
    console.log(JSON.stringify(logEntry));
  }
}

export const logger = {
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
      formatLog('PROGRESS', message, meta);
    }
  }
};

// Export Logger as alias for backward compatibility
export const Logger = logger;

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
