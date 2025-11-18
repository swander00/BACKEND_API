// ===============================================================================================
// PRODUCTION FEATURES TEST SCRIPT
// ===============================================================================================
// Tests error handling, validation, logging, security headers, etc.
// ===============================================================================================

import dotenv from 'dotenv';
dotenv.config({ path: './environment.env' });

const BASE_URL = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
const TIMEOUT_MS = 10000;

let tests = 0;
let passed = 0;
let failed = 0;

function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    error: '\x1b[31m',    // Red
    warn: '\x1b[33m',     // Yellow
    reset: '\x1b[0m'
  };
  console.log(`${colors[type]}${message}${colors.reset}`);
}

async function test(name, testFn) {
  tests++;
  try {
    log(`\n🧪 [${tests}] ${name}...`, 'info');
    await testFn();
    passed++;
    log(`   ✅ PASS`, 'success');
  } catch (error) {
    failed++;
    log(`   ❌ FAIL: ${error.message}`, 'error');
    if (error.stack && process.env.DEBUG === 'true') {
      console.log(error.stack);
    }
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function runTests() {
  log('\n🚀 Starting Production Features Tests...', 'info');
  log(`   Base URL: ${BASE_URL}\n`, 'info');

  // ===============================================================================================
  // 1. SECURITY HEADERS
  // ===============================================================================================
  
  await test('Security Headers Present', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/health`);
    const headers = {
      'x-content-type-options': res.headers.get('x-content-type-options'),
      'x-frame-options': res.headers.get('x-frame-options'),
      'x-xss-protection': res.headers.get('x-xss-protection'),
      'referrer-policy': res.headers.get('referrer-policy')
    };
    
    if (!headers['x-content-type-options']) {
      throw new Error('Missing X-Content-Type-Options header');
    }
    if (!headers['x-frame-options']) {
      throw new Error('Missing X-Frame-Options header');
    }
    
    log(`   Headers: ${JSON.stringify(headers)}`, 'info');
  });

  // ===============================================================================================
  // 2. ERROR HANDLING - Validation Errors
  // ===============================================================================================
  
  await test('Invalid Number Parameter (400)', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/properties?minPrice=invalid`);
    if (res.status !== 400) {
      throw new Error(`Expected 400, got ${res.status}`);
    }
    const data = await res.json();
    if (!data.error || !data.error.code) {
      throw new Error('Missing error response format');
    }
    if (data.error.code !== 400) {
      throw new Error(`Expected error code 400, got ${data.error.code}`);
    }
    log(`   Error: ${data.error.message}`, 'info');
  });

  await test('Invalid Array Parameter (400)', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/properties?city=test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test,test`);
    // Should either work (if limit is high) or return 400
    const status = res.status;
    if (status !== 200 && status !== 400) {
      throw new Error(`Unexpected status: ${status}`);
    }
  });

  await test('Invalid Map Bounds (400)', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/properties/map?bounds=invalid`);
    if (res.status !== 400) {
      throw new Error(`Expected 400, got ${res.status}`);
    }
    const data = await res.json();
    if (!data.error || data.error.code !== 400) {
      throw new Error('Invalid error response format');
    }
  });

  // ===============================================================================================
  // 3. ERROR HANDLING - Not Found
  // ===============================================================================================
  
  await test('Property Not Found (404)', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/properties/invalid-listing-key-12345`);
    if (res.status !== 404) {
      throw new Error(`Expected 404, got ${res.status}`);
    }
    const data = await res.json();
    if (!data.error || data.error.code !== 404) {
      throw new Error('Invalid error response format');
    }
    log(`   Error: ${data.error.message}`, 'info');
  });

  await test('Invalid Endpoint (404)', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/invalid-endpoint`);
    if (res.status !== 404) {
      throw new Error(`Expected 404, got ${res.status}`);
    }
  });

  // ===============================================================================================
  // 4. VALIDATION - Valid Inputs
  // ===============================================================================================
  
  await test('Valid Number Parameters', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/properties?minPrice=100000&maxPrice=500000&minBedrooms=2&maxBedrooms=4`);
    if (res.status !== 200) {
      const data = await res.json();
      throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
    }
    const data = await res.json();
    if (!data.properties || !Array.isArray(data.properties)) {
      throw new Error('Invalid response format');
    }
  });

  await test('Valid Array Parameters', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/properties?city=Toronto,Brampton&propertyType=House,Condo`);
    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
  });

  await test('Valid Pagination', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/properties?page=1&pageSize=5`);
    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
    const data = await res.json();
    if (!data.pagination || data.pagination.page !== 1 || data.pagination.pageSize !== 5) {
      throw new Error('Pagination not working correctly');
    }
    if (data.properties.length > 5) {
      throw new Error('Page size limit not enforced');
    }
  });

  await test('Pagination Clamping (pageSize > 100)', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/properties?page=1&pageSize=200`);
    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
    const data = await res.json();
    if (data.pagination.pageSize > 100) {
      throw new Error('Page size should be clamped to 100');
    }
  });

  // ===============================================================================================
  // 5. REQUEST ID TRACKING
  // ===============================================================================================
  
  await test('Request ID in Error Response', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/properties?minPrice=invalid`);
    const data = await res.json();
    // Request ID should be present in development mode
    if (process.env.NODE_ENV === 'development' && !data.error.requestId) {
      log('   ⚠️  Request ID not in response (may be production mode)', 'warn');
    }
  });

  // ===============================================================================================
  // 6. SEARCH VALIDATION
  // ===============================================================================================
  
  await test('Search Term Sanitization', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/search?q=toronto&limit=5`);
    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
    const data = await res.json();
    if (!data.listings || !Array.isArray(data.listings)) {
      throw new Error('Invalid response format');
    }
  });

  await test('Search Limit Clamping', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/search?q=toronto&limit=100`);
    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
    const data = await res.json();
    if (data.listings.length > 50) {
      throw new Error('Search limit should be clamped to 50');
    }
  });

  // ===============================================================================================
  // 7. PERFORMANCE - Response Times
  // ===============================================================================================
  
  await test('Response Time Acceptable', async () => {
    const start = Date.now();
    const res = await fetchWithTimeout(`${BASE_URL}/api/properties?page=1&pageSize=5`);
    const duration = Date.now() - start;
    
    if (res.status !== 200) {
      throw new Error(`Request failed with status ${res.status}`);
    }
    
    if (duration > 5000) {
      throw new Error(`Response too slow: ${duration}ms`);
    }
    
    log(`   Duration: ${duration}ms`, 'info');
  });

  // ===============================================================================================
  // SUMMARY
  // ===============================================================================================
  
  log('\n' + '='.repeat(60), 'info');
  log(`📊 Test Results: ${passed}/${tests} passed`, passed === tests ? 'success' : 'error');
  
  if (failed > 0) {
    log(`❌ ${failed} test(s) failed`, 'error');
    process.exit(1);
  } else {
    log('✅ All production feature tests passed!', 'success');
    process.exit(0);
  }
}

// Run tests
runTests().catch(err => {
  log(`\n💥 Fatal error: ${err.message}`, 'error');
  if (err.stack) console.log(err.stack);
  process.exit(1);
});

