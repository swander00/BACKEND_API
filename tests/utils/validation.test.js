// ===============================================================================================
// VALIDATION UTILITIES TESTS
// ===============================================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  parseNumber, 
  parseArrayParam, 
  parseBoolean, 
  validatePagination,
  validateSearchTerm 
} from '../../utils/validation.js';

describe('parseNumber', () => {
  it('should parse valid number strings', () => {
    assert.strictEqual(parseNumber('123'), 123);
    assert.strictEqual(parseNumber('45.5'), 45.5);
    assert.strictEqual(parseNumber('0'), 0);
  });

  it('should throw ValidationError for invalid numbers', () => {
    assert.throws(() => parseNumber('abc'), /Invalid value: must be a number/);
    assert.throws(() => parseNumber('invalid'), /Invalid value: must be a number/);
  });

  it('should return undefined for empty values', () => {
    assert.strictEqual(parseNumber(''), undefined);
    assert.strictEqual(parseNumber(null), undefined);
    assert.strictEqual(parseNumber(undefined), undefined);
  });

  it('should enforce min and max constraints', () => {
    assert.strictEqual(parseNumber('50', 0, 100), 50);
    assert.throws(() => parseNumber('150', 0, 100), /must be <= 100/);
    assert.throws(() => parseNumber('-10', 0, 100), /must be >= 0/);
  });
});

describe('parseArrayParam', () => {
  it('should parse comma-separated strings', () => {
    assert.deepStrictEqual(parseArrayParam('a,b,c'), ['a', 'b', 'c']);
    assert.deepStrictEqual(parseArrayParam('single'), ['single']);
  });

  it('should handle arrays', () => {
    assert.deepStrictEqual(parseArrayParam(['a', 'b']), ['a', 'b']);
  });

  it('should return undefined for invalid input', () => {
    assert.strictEqual(parseArrayParam(null), undefined);
    assert.strictEqual(parseArrayParam(undefined), undefined);
    assert.strictEqual(parseArrayParam(''), undefined);
  });

  it('should trim whitespace', () => {
    assert.deepStrictEqual(parseArrayParam(' a , b , c '), ['a', 'b', 'c']);
  });

  it('should enforce max items limit', () => {
    const manyItems = Array(60).fill('item').join(',');
    assert.throws(() => parseArrayParam(manyItems, 50), /Too many items/);
  });
});

describe('parseBoolean', () => {
  it('should parse true values', () => {
    assert.strictEqual(parseBoolean('true'), true);
    assert.strictEqual(parseBoolean('True'), true);
    assert.strictEqual(parseBoolean('TRUE'), true);
    assert.strictEqual(parseBoolean('1'), true);
    assert.strictEqual(parseBoolean('yes'), true);
    assert.strictEqual(parseBoolean(true), true);
  });

  it('should parse false values', () => {
    assert.strictEqual(parseBoolean('false'), false);
    assert.strictEqual(parseBoolean('False'), false);
    assert.strictEqual(parseBoolean('FALSE'), false);
    assert.strictEqual(parseBoolean('0'), false);
    assert.strictEqual(parseBoolean('no'), false);
    assert.strictEqual(parseBoolean(false), false);
  });

  it('should return undefined for invalid values', () => {
    assert.strictEqual(parseBoolean('invalid'), undefined);
    assert.strictEqual(parseBoolean(null), undefined);
    assert.strictEqual(parseBoolean(undefined), undefined);
    assert.strictEqual(parseBoolean(''), undefined);
  });
});

describe('validatePagination', () => {
  it('should validate and normalize pagination', () => {
    const result = validatePagination(2, 25);
    assert.strictEqual(result.page, 2);
    assert.strictEqual(result.pageSize, 25);
  });

  it('should enforce minimum values', () => {
    const result = validatePagination(0, -5);
    assert.strictEqual(result.page, 1);
    assert.strictEqual(result.pageSize, 12);
  });

  it('should enforce maximum page size', () => {
    const result = validatePagination(1, 200);
    assert.strictEqual(result.pageSize, 100);
  });

  it('should use defaults for invalid input', () => {
    const result = validatePagination(null, null);
    assert.strictEqual(result.page, 1);
    assert.strictEqual(result.pageSize, 12);
  });
});

describe('validateSearchTerm', () => {
  it('should validate and sanitize search terms', () => {
    assert.strictEqual(validateSearchTerm('  test  ', 100), 'test');
    assert.strictEqual(validateSearchTerm('valid search', 50), 'valid search');
  });

  it('should enforce max length', () => {
    const longString = 'a'.repeat(200);
    const result = validateSearchTerm(longString, 100);
    assert.strictEqual(result.length, 100);
  });

  it('should return undefined for invalid input', () => {
    assert.strictEqual(validateSearchTerm(null, 100), undefined);
    assert.strictEqual(validateSearchTerm(undefined, 100), undefined);
    assert.strictEqual(validateSearchTerm(123, 100), undefined);
  });

  it('should remove dangerous characters', () => {
    assert.strictEqual(validateSearchTerm('test<script>alert("xss")</script>', 100), 'testscriptalertxssscript');
  });
});

