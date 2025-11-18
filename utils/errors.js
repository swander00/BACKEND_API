// ===============================================================================================
// STANDARDIZED ERROR HANDLING
// ===============================================================================================

export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

export class ValidationError extends ApiError {
  constructor(message, field = null, value = null) {
    super(400, message, { field, value });
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(resource = 'Resource', id = null) {
    super(404, `${resource} not found`, { resource, id });
    this.name = 'NotFoundError';
  }
}

export class DatabaseError extends ApiError {
  constructor(message, originalError = null) {
    super(500, message, { originalError: originalError?.message });
    this.name = 'DatabaseError';
  }
}

/**
 * Standard error response format
 */
export function formatErrorResponse(error, requestId = null) {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const response = {
    error: {
      code: error.statusCode || 500,
      message: error.message || 'Internal server error',
      timestamp: error.timestamp || new Date().toISOString()
    }
  };

  if (requestId) {
    response.error.requestId = requestId;
  }

  // Include details in development
  if (isDevelopment && error.details) {
    response.error.details = error.details;
  }

  // Include stack trace in development
  if (isDevelopment && error.stack) {
    response.error.stack = error.stack.split('\n').slice(0, 5);
  }

  return response;
}

/**
 * Error handling middleware
 */
export function errorHandler(err, req, res, next) {
  const requestId = req.id || null;
  
  // Log error
  console.error(`[Error] ${requestId || 'NO-ID'} ${err.name}:`, {
    message: err.message,
    statusCode: err.statusCode || 500,
    path: req.path,
    method: req.method,
    stack: err.stack
  });

  // Handle known error types
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json(formatErrorResponse(err, requestId));
  }

  // Handle validation errors from express-validator
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).json(formatErrorResponse(
      new ValidationError(err.message || 'Invalid input'),
      requestId
    ));
  }

  // Handle database errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
    return res.status(503).json(formatErrorResponse(
      new DatabaseError('Database connection failed'),
      requestId
    ));
  }

  // Default to 500
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 
    ? 'Internal server error' 
    : err.message;

  res.status(statusCode).json(formatErrorResponse(
    { statusCode, message, timestamp: new Date().toISOString() },
    requestId
  ));
}

/**
 * 404 handler
 */
export function notFoundHandler(req, res) {
  res.status(404).json(formatErrorResponse(
    new NotFoundError('Endpoint', req.path),
    req.id || null
  ));
}

