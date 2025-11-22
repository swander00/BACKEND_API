// ===============================================================================================
// SECURITY UTILITIES TESTS
// ===============================================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeString, sanitizeJson } from '../../utils/security.js';

describe('sanitizeString', () => {
  it('should trim whitespace', () => {
    assert.strictEqual(sanitizeString('  test  '), 'test');
  });

  it('should remove HTML tags', () => {
    assert.strictEqual(sanitizeString('<script>alert("xss")</script>'), 'scriptalert("xss")/script');
    assert.strictEqual(sanitizeString('Hello <b>world</b>'), 'Hello bworld/b');
  });

  it('should enforce max length', () => {
    const longString = 'a'.repeat(200);
    assert.strictEqual(sanitizeString(longString, 50).length, 50);
  });

  it('should return empty string for non-string input', () => {
    assert.strictEqual(sanitizeString(null), '');
    assert.strictEqual(sanitizeString(123), '');
    assert.strictEqual(sanitizeString({}), '');
  });
});

describe('sanitizeJson', () => {
  it('should sanitize nested objects', () => {
    const input = {
      name: '<script>alert("xss")</script>',
      email: '  test@example.com  ',
      nested: {
        value: '<b>test</b>'
      }
    };
    
    const result = sanitizeJson(input);
    assert.strictEqual(result.name, 'scriptalert("xss")/script');
    assert.strictEqual(result.email, 'test@example.com');
    assert.strictEqual(result.nested.value, 'btest/b');
  });

  it('should sanitize arrays', () => {
    const input = ['<script>test</script>', '  normal  '];
    const result = sanitizeJson(input);
    assert.strictEqual(result[0], 'scripttest/script');
    assert.strictEqual(result[1], 'normal');
  });

  it('should enforce depth limit', () => {
    const deepObject = { level1: { level2: { level3: { level4: { level5: 'test' } } } } };
    assert.throws(() => {
      sanitizeJson(deepObject, 3);
    }, /JSON depth limit exceeded/);
  });

  it('should handle null and non-objects', () => {
    assert.strictEqual(sanitizeJson(null), null);
    assert.strictEqual(sanitizeJson('string'), 'string');
    assert.strictEqual(sanitizeJson(123), 123);
  });
});

