// ===============================================================================================
// ERROR HANDLING UTILITIES TESTS
// ===============================================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ApiError, ValidationError, NotFoundError, DatabaseError, formatErrorResponse } from '../../utils/errors.js';

describe('Error Classes', () => {
  it('should create ApiError with status code and message', () => {
    const error = new ApiError(400, 'Bad request');
    assert.strictEqual(error.statusCode, 400);
    assert.strictEqual(error.message, 'Bad request');
    assert.strictEqual(error.name, 'ApiError');
    assert.ok(error.timestamp);
  });

  it('should create ValidationError with field and value', () => {
    const error = new ValidationError('Invalid email', 'email', 'invalid@');
    assert.strictEqual(error.statusCode, 400);
    assert.strictEqual(error.message, 'Invalid email');
    assert.strictEqual(error.details.field, 'email');
    assert.strictEqual(error.details.value, 'invalid@');
  });

  it('should create NotFoundError with resource name', () => {
    const error = new NotFoundError('Property', '123');
    assert.strictEqual(error.statusCode, 404);
    assert.strictEqual(error.message, 'Property not found');
    assert.strictEqual(error.details.resource, 'Property');
    assert.strictEqual(error.details.id, '123');
  });

  it('should create DatabaseError with original error', () => {
    const originalError = new Error('Connection failed');
    const error = new DatabaseError('Database operation failed', originalError);
    assert.strictEqual(error.statusCode, 500);
    assert.strictEqual(error.message, 'Database operation failed');
    assert.strictEqual(error.details.originalError, 'Connection failed');
  });
});

describe('formatErrorResponse', () => {
  it('should format error response with request ID', () => {
    const error = new ApiError(400, 'Bad request');
    const response = formatErrorResponse(error, 'req-123');
    
    assert.strictEqual(response.error.code, 400);
    assert.strictEqual(response.error.message, 'Bad request');
    assert.strictEqual(response.error.requestId, 'req-123');
    assert.ok(response.error.timestamp);
  });

  it('should include details in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    const error = new ValidationError('Invalid input', 'field', 'value');
    const response = formatErrorResponse(error);
    
    assert.ok(response.error.details);
    assert.strictEqual(response.error.details.field, 'field');
    
    process.env.NODE_ENV = originalEnv;
  });

  it('should not include stack trace in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    const error = new ApiError(500, 'Server error');
    error.stack = 'Error: Server error\n    at test.js:1:1';
    const response = formatErrorResponse(error);
    
    assert.strictEqual(response.error.stack, undefined);
    
    process.env.NODE_ENV = originalEnv;
  });
});

