// ===============================================================================================
// SMOKE TEST SCRIPT - CI/CD Health Checks
// ===============================================================================================
// Tests critical endpoints to ensure API is functioning
// Exit codes: 0 = success, 1 = failure
// ===============================================================================================

import dotenv from 'dotenv';
dotenv.config({ path: './environment.env' });

const BASE_URL = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
const TIMEOUT_MS = 10000; // 10 second timeout per request

let failures = 0;
let tests = 0;

function log(message) {
  console.log(message);
}

async function testEndpoint(name, url, options = {}) {
  tests++;
  const { method = 'GET', expectedStatus = 200, validate } = options;
  
  try {
    log(`\n🧪 [${tests}] Testing ${name}...`);
    log(`   ${method} ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    const response = await fetch(url, {
      method,
      headers: options.headers || {},
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    const contentType = response.headers.get('content-type') || '';
    let data = null;
    
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }
    
    if (response.status !== expectedStatus) {
      log(`   ❌ FAIL: Expected status ${expectedStatus}, got ${response.status}`);
      log(`   Response: ${JSON.stringify(data).substring(0, 200)}`);
      failures++;
      return false;
    }
    
    if (validate && !validate(data, response)) {
      log(`   ❌ FAIL: Validation failed`);
      failures++;
      return false;
    }
    
    log(`   ✅ PASS: Status ${response.status}`);
    if (data.properties) {
      log(`   📊 Properties: ${data.properties.length}`);
    }
    if (data.listings) {
      log(`   🔍 Suggestions: ${data.listings.length}`);
    }
    if (data.pagination) {
      log(`   📄 Pagination: page ${data.pagination.page || 'N/A'}`);
    }
    
    return true;
  } catch (error) {
    if (error.name === 'AbortError') {
      log(`   ❌ FAIL: Request timeout (>${TIMEOUT_MS}ms)`);
    } else {
      log(`   ❌ FAIL: ${error.message}`);
    }
    failures++;
    return false;
  }
}

async function runSmokeTests() {
  log('🚀 Starting API Smoke Tests...');
  log(`   Base URL: ${BASE_URL}`);
  log(`   Timeout: ${TIMEOUT_MS}ms per request\n`);
  
  // Test 1: Health check
  await testEndpoint(
    'Health Check',
    `${BASE_URL}/health`,
    {
      validate: (data) => data.status === 'ok'
    }
  );
  
  // Test 2: Properties list (with pagination)
  await testEndpoint(
    'Properties List',
    `${BASE_URL}/api/properties?page=1&pageSize=5`,
    {
      validate: (data) => {
        if (!data.properties) return false;
        if (!Array.isArray(data.properties)) return false;
        if (data.properties.length > 5) return false; // Should respect pageSize
        return true;
      }
    }
  );
  
  // Test 3: Search endpoint
  await testEndpoint(
    'Search Suggestions',
    `${BASE_URL}/api/search?q=toronto&limit=5`,
    {
      validate: (data) => {
        if (!data.listings) return false;
        if (!Array.isArray(data.listings)) return false;
        return true;
      }
    }
  );
  
  // Test 4: OpenAPI spec
  await testEndpoint(
    'OpenAPI Spec',
    `${BASE_URL}/openapi.json`,
    {
      validate: (data) => {
        return data.openapi && data.info && data.paths;
      }
    }
  );
  
  // Summary
  log('\n' + '='.repeat(60));
  log(`📊 Test Results: ${tests - failures}/${tests} passed`);
  
  if (failures === 0) {
    log('✅ All smoke tests passed!');
    process.exit(0);
  } else {
    log(`❌ ${failures} test(s) failed`);
    process.exit(1);
  }
}

// Run tests
runSmokeTests().catch(err => {
  log(`\n💥 Fatal error: ${err.message}`);
  if (err.stack) log(err.stack);
  process.exit(1);
});

