// Quick API test script
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:8080';

async function testEndpoint(name, url) {
  try {
    console.log(`\n🧪 Testing ${name}...`);
    console.log(`   URL: ${url}`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (response.ok) {
      console.log(`   ✅ Status: ${response.status}`);
      console.log(`   📦 Response keys:`, Object.keys(data).join(', '));
      if (data.properties) {
        console.log(`   📊 Properties count: ${data.properties.length}`);
        if (data.pagination) {
          console.log(`   📄 Pagination:`, data.pagination);
        }
      }
      if (data.listings) {
        console.log(`   🔍 Suggestions count: ${data.listings.length}`);
      }
    } else {
      console.log(`   ❌ Status: ${response.status}`);
      console.log(`   Error:`, data);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

async function runTests() {
  console.log('🚀 Starting API Tests...\n');
  
  // Test health endpoint
  await testEndpoint('Health Check', `${BASE_URL}/health`);
  
  // Test properties list
  await testEndpoint('Properties List', `${BASE_URL}/api/properties?page=1&pageSize=5`);
  
  // Test search
  await testEndpoint('Search', `${BASE_URL}/api/search?q=toronto&limit=5`);
  
  // Test map endpoint
  await testEndpoint('Map Properties', `${BASE_URL}/api/properties/map?bounds={"northEast":{"lat":43.7,"lng":-79.3},"southWest":{"lat":43.6,"lng":-79.4}}`);
  
  console.log('\n✅ Tests complete!');
}

// Wait for server to be ready
setTimeout(() => {
  runTests().catch(console.error);
}, 2000);

