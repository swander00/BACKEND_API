// Debug script to test if routes are working
// Uses built-in fetch (Node 18+)

const BASE_URL = 'http://localhost:8080';

async function testRoute(name, path) {
  try {
    console.log(`\n🧪 Testing ${name}...`);
    console.log(`   GET ${BASE_URL}${path}`);
    
    const response = await fetch(`${BASE_URL}${path}`);
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Content-Type: ${contentType}`);
    
    if (contentType.includes('application/json')) {
      try {
        const json = JSON.parse(text);
        console.log(`   Response: ${JSON.stringify(json).substring(0, 150)}...`);
      } catch {
        console.log(`   Response (first 200 chars): ${text.substring(0, 200)}`);
      }
    } else {
      console.log(`   Response (first 200 chars): ${text.substring(0, 200)}`);
    }
    
    return response.status === 200;
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function run() {
  console.log('🔍 Route Debugging Tool\n');
  console.log('Make sure your server is running with the latest code!\n');
  
  // Test routes in order
  await testRoute('Health Check', '/health');
  await testRoute('Test Debug Route', '/test-route-debug');
  await testRoute('OpenAPI Spec', '/openapi.json');
  
  console.log('\n✅ Debug complete!');
  console.log('\nIf /test-route-debug works but /openapi.json doesn\'t,');
  console.log('check your server console for the [OpenAPI] logs.');
}

run().catch(console.error);

