// Quick integration test script
// Tests Railway API connection for Vercel frontend

const RAILWAY_URL = 'https://apibackend-production-696e.up.railway.app';
const FRONTEND_URL = 'https://new-frontend-lac-alpha.vercel.app';

console.log('🧪 Testing Vercel ↔ Railway Integration...\n');
console.log(`📍 Railway API: ${RAILWAY_URL}`);
console.log(`📍 Frontend URL: ${FRONTEND_URL}\n`);

async function testCORS() {
  console.log('🔍 Testing CORS Configuration...');
  try {
    const response = await fetch(`${RAILWAY_URL}/health`, {
      method: 'GET',
      headers: {
        'Origin': FRONTEND_URL,
        'Content-Type': 'application/json'
      }
    });
    
    const corsHeader = response.headers.get('access-control-allow-origin');
    if (corsHeader === FRONTEND_URL || corsHeader === '*') {
      console.log('✅ CORS configured correctly');
      console.log(`   Access-Control-Allow-Origin: ${corsHeader}`);
      return true;
    } else {
      console.log('⚠️  CORS header:', corsHeader);
      console.log('   Expected:', FRONTEND_URL);
      return false;
    }
  } catch (error) {
    console.log('❌ CORS test failed:', error.message);
    return false;
  }
}

async function testEndpoints() {
  console.log('\n🔍 Testing API Endpoints...\n');
  
  const tests = [
    { name: 'Health Check', url: '/health' },
    { name: 'Properties List', url: '/api/properties?page=1&pageSize=5' },
    { name: 'Search', url: '/api/search?q=toronto&limit=5' },
    { name: 'Metrics', url: '/metrics' }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const start = Date.now();
      const response = await fetch(`${RAILWAY_URL}${test.url}`);
      const duration = Date.now() - start;
      const status = response.status;
      
      if (status >= 200 && status < 300) {
        console.log(`✅ ${test.name}: ${status} (${duration}ms)`);
        passed++;
      } else {
        console.log(`⚠️  ${test.name}: ${status} (${duration}ms)`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name}: Error - ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n📊 Results: ${passed}/${tests.length} passed`);
  return failed === 0;
}

async function runTests() {
  const corsOk = await testCORS();
  const endpointsOk = await testEndpoints();
  
  console.log('\n' + '='.repeat(60));
  if (corsOk && endpointsOk) {
    console.log('✅ All tests passed! Ready for Vercel deployment.');
    console.log('\n📋 Next Steps:');
    console.log('1. Redeploy your frontend in Vercel');
    console.log('2. Test the deployed frontend');
    console.log('3. Verify API calls work in browser console');
  } else {
    console.log('⚠️  Some tests failed. Check errors above.');
  }
  console.log('='.repeat(60));
}

runTests().catch(err => {
  console.error('💥 Test failed:', err);
  process.exit(1);
});

