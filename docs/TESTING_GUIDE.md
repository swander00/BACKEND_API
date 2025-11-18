# API Testing Guide

## Quick Start

### Smoke Tests (Basic Functionality)
```bash
npm run test:smoke
```
Tests core endpoints: health, properties list, search, OpenAPI spec.

### Production Features Tests (Error Handling, Validation, Security)
```bash
npm run test:production
```
Tests error handling, validation, security headers, performance, etc.

## Test Scripts

### 1. Smoke Tests (`scripts/smoke-test.js`)
**Purpose:** Verify basic API functionality

**Tests:**
- ✅ Health check endpoint
- ✅ Properties list endpoint
- ✅ Search suggestions endpoint
- ✅ OpenAPI spec endpoint

**Usage:**
```bash
node scripts/smoke-test.js
```

### 2. Production Features Tests (`scripts/test-production-features.js`)
**Purpose:** Verify production-ready features

**Tests:**
- ✅ Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- ✅ Error handling (400, 404, 500 responses)
- ✅ Input validation (numbers, arrays, bounds, etc.)
- ✅ Request ID tracking
- ✅ Performance (response times)
- ✅ Pagination validation
- ✅ Search limit clamping

**Usage:**
```bash
node scripts/test-production-features.js
```

## Manual Testing

### Test Error Handling

#### Invalid Input (400)
```bash
# Invalid number
curl "http://localhost:8080/api/properties?minPrice=invalid"

# Invalid bounds
curl "http://localhost:8080/api/properties/map?bounds=invalid"

# Too many array items
curl "http://localhost:8080/api/properties?city=1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21"
```

#### Not Found (404)
```bash
# Invalid listing key
curl "http://localhost:8080/api/properties/invalid-key-12345"

# Invalid endpoint
curl "http://localhost:8080/api/invalid-endpoint"
```

### Test Validation

#### Valid Inputs
```bash
# Valid filters
curl "http://localhost:8080/api/properties?minPrice=100000&maxPrice=500000&minBedrooms=2&maxBedrooms=4"

# Valid arrays
curl "http://localhost:8080/api/properties?city=Toronto,Brampton&propertyType=House,Condo"

# Valid pagination
curl "http://localhost:8080/api/properties?page=1&pageSize=5"
```

### Test Security Headers
```bash
curl -I "http://localhost:8080/health"
```
Should see:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

### Test Request IDs
Check server logs - every request should have a unique request ID:
```
[INFO] Request started { requestId: '1234567890-abc123', method: 'GET', path: '/api/properties' }
```

## Expected Test Results

### Smoke Tests
- **Expected:** 4/4 tests passing
- **Note:** OpenAPI endpoint may fail if route not registered (non-critical)

### Production Features Tests
- **Expected:** 14/14 tests passing after server restart
- **Requirements:** Server must be restarted with new code

## Troubleshooting

### Tests Failing After Code Changes

1. **Restart the server**
   ```bash
   # Stop server (Ctrl+C)
   npm start
   ```

2. **Check server logs**
   - Look for request IDs in logs
   - Check for error messages
   - Verify middleware is loading

3. **Verify environment variables**
   ```bash
   # Check if LOG_LEVEL is set
   echo $LOG_LEVEL
   ```

### Common Issues

#### Security Headers Not Present
- **Cause:** Server not restarted with new code
- **Fix:** Restart server

#### Validation Errors Not Throwing
- **Cause:** Old code still running
- **Fix:** Restart server

#### Error Response Format Wrong
- **Cause:** Error handler middleware not loaded
- **Fix:** Check middleware order in `index.js`

## Continuous Integration

### GitHub Actions Example
```yaml
name: API Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:smoke
      - run: npm run test:production
```

## Performance Benchmarks

### Expected Response Times
- Health check: < 10ms
- Properties list (5 items): < 100ms
- Property details: < 200ms
- Search suggestions: < 150ms
- Map properties: < 200ms

### Slow Query Detection
- Queries > 500ms logged as INFO
- Queries > 1000ms logged as WARN
- Queries > 2000ms logged as ERROR

## Next Steps

1. Add integration tests for specific business logic
2. Add load testing (e.g., using k6 or Artillery)
3. Add contract testing (e.g., using Pact)
4. Set up CI/CD pipeline with automated testing

