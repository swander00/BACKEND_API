// Quick test script for Railway deployment
// Usage: node test-railway-deployment.js YOUR_RAILWAY_URL

const RAILWAY_URL = process.argv[2] || process.env.RAILWAY_URL || 'https://your-app.up.railway.app';

console.log('🧪 Testing Railway Deployment...');
console.log(`📍 URL: ${RAILWAY_URL}\n`);

async function testEndpoint(name, path, validate = null) {
  try {
    const url = `${RAILWAY_URL}${path}`;
    const start = Date.now();
    const response = await fetch(url);
    const duration = Date.now() - start;
    
    let data = null;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    
    const status = response.status;
    const statusIcon = status >= 200 && status < 300 ? '✅' : status >= 400 && status < 500 ? '⚠️' : '❌';
    
    console.log(`${statusIcon} ${name}`);
    console.log(`   Status: ${status} | Duration: ${duration}ms`);
    
    if (validate) {
      const isValid = validate(data);
      if (isValid) {
        console.log(`   ✅ Validation passed`);
      } else {
        console.log(`   ❌ Validation failed`);
      }
    }
    
    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      console.log(`   Response: ${JSON.stringify(data).substring(0, 100)}...`);
    }
    console.log('');
    
    return { success: status >= 200 && status < 300, status, duration, data };
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}\n`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('Starting tests...\n');
  
  // Test 1: Health Check
  await testEndpoint('Health Check', '/health', (data) => {
    return data && data.status === 'ok' && data.checks && data.checks.database;
  });
  
  // Test 2: Metrics
  await testEndpoint('Metrics', '/metrics', (data) => {
    return typeof data === 'string' && data.includes('http_requests_total');
  });
  
  // Test 3: Properties List
  await testEndpoint('Properties List', '/api/properties?page=1&pageSize=5', (data) => {
    return data && Array.isArray(data.properties);
  });
  
  // Test 4: Search
  await testEndpoint('Search', '/api/search?q=toronto&limit=5', (data) => {
    return data && data.listings && Array.isArray(data.listings);
  });
  
  // Test 5: OpenAPI
  await testEndpoint('OpenAPI Spec', '/openapi.json', (data) => {
    return data && data.openapi && data.info && data.paths;
  });
  
  console.log('✅ All tests completed!');
}

runTests().catch(err => {
  console.error('💥 Test failed:', err);
  process.exit(1);
});

