/**
 * Test script to verify API fixes
 * Tests all endpoints to ensure data structure matches frontend expectations
 */

// Use built-in fetch (Node 18+) or provide fallback
const fetch = globalThis.fetch || (() => {
  throw new Error('fetch is not available. Please use Node.js 18+ or install node-fetch');
});

const API_BASE_URL = process.env.API_URL || 'http://localhost:8080';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkField(obj, path, expectedType, description) {
  const keys = path.split('.');
  let value = obj;
  for (const key of keys) {
    if (value === null || value === undefined) {
      return { ok: false, error: `Missing field: ${path}` };
    }
    value = value[key];
  }
  
  if (value === undefined || value === null) {
    return { ok: false, error: `Missing field: ${path}` };
  }
  
  if (expectedType && typeof value !== expectedType) {
    return { ok: false, error: `Field ${path} has wrong type: expected ${expectedType}, got ${typeof value}` };
  }
  
  return { ok: true, value };
}

async function testEndpoint(name, url, checks) {
  log(`\n${'='.repeat(60)}`, 'blue');
  log(`Testing: ${name}`, 'blue');
  log(`URL: ${url}`, 'blue');
  log('='.repeat(60), 'blue');
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
      log(`❌ Request failed: ${response.status} ${response.statusText}`, 'red');
      log(`Response: ${JSON.stringify(data, null, 2)}`, 'yellow');
      return false;
    }
    
    log(`✅ Request successful (${response.status})`, 'green');
    
    // Run checks
    let allPassed = true;
    for (const check of checks) {
      const result = checkField(data, check.path, check.type, check.description);
      if (result.ok) {
        log(`  ✅ ${check.path} (${check.description || 'exists'})`, 'green');
        if (result.value !== undefined && check.sample) {
          log(`     Sample value: ${JSON.stringify(result.value).substring(0, 100)}`, 'yellow');
        }
      } else {
        log(`  ❌ ${check.path}: ${result.error}`, 'red');
        allPassed = false;
      }
    }
    
    // Check for nested structures
    if (data.properties && Array.isArray(data.properties) && data.properties.length > 0) {
      const firstProperty = data.properties[0];
      log(`\n  Checking first property structure...`, 'yellow');
      
      const propertyChecks = [
        { path: 'id', type: 'string', description: 'Property ID' },
        { path: 'listingKey', type: 'string', description: 'Listing key' },
        { path: 'price', type: 'number', description: 'Price field' },
        { path: 'address', type: 'object', description: 'Address object' },
        { path: 'address.street', type: 'string', description: 'Street address' },
        { path: 'address.city', type: 'string', description: 'City' },
        { path: 'location', type: 'object', description: 'Location object' },
        { path: 'location.neighborhood', type: 'string', description: 'Neighborhood' },
        { path: 'bedrooms', type: 'object', description: 'Bedrooms object' },
        { path: 'bedrooms.above', type: 'number', description: 'Bedrooms above grade' },
        { path: 'bathrooms', type: 'number', description: 'Bathrooms count' },
        { path: 'squareFootage', type: 'object', description: 'Square footage object' },
        { path: 'squareFootage.min', type: 'number', description: 'Min square footage' },
        { path: 'parking', type: 'object', description: 'Parking object' },
        { path: 'parking.garage', type: 'number', description: 'Garage spaces' },
        { path: 'images', type: 'object', description: 'Images array' },
        { path: 'listedAt', type: 'string', description: 'Listed at timestamp' },
        { path: 'coordinates', type: 'object', description: 'Coordinates object (optional)' },
      ];
      
      for (const check of propertyChecks) {
        const result = checkField(firstProperty, check.path, check.type, check.description);
        if (result.ok) {
          log(`    ✅ ${check.path}`, 'green');
        } else if (check.path === 'coordinates' && result.error.includes('Missing')) {
          log(`    ⚠️  ${check.path} (optional - may be missing)`, 'yellow');
        } else {
          log(`    ❌ ${check.path}: ${result.error}`, 'red');
          allPassed = false;
        }
      }
    }
    
    return allPassed;
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    return false;
  }
}

async function runTests() {
  log('\n🚀 Starting API Tests...\n', 'blue');
  
  const tests = [
    {
      name: 'Properties List Endpoint',
      url: `${API_BASE_URL}/api/properties?page=1&pageSize=5`,
      checks: [
        { path: 'properties', type: 'object', description: 'Properties array' },
        { path: 'pagination', type: 'object', description: 'Pagination object' },
        { path: 'totalCount', type: 'number', description: 'Total count' },
      ]
    },
    {
      name: 'Properties Map Endpoint',
      url: `${API_BASE_URL}/api/properties/map?bounds=${encodeURIComponent(JSON.stringify({
        northEast: { lat: 43.8, lng: -79.2 },
        southWest: { lat: 43.6, lng: -79.5 }
      }))}`,
      checks: [
        { path: 'properties', type: 'object', description: 'Properties array' },
      ]
    },
    {
      name: 'Health Check',
      url: `${API_BASE_URL}/health`,
      checks: [
        { path: 'status', type: 'string', description: 'Status' },
        { path: 'checks.database', type: 'string', description: 'Database check' },
      ]
    }
  ];
  
  let allPassed = true;
  for (const test of tests) {
    const passed = await testEndpoint(test.name, test.url, test.checks);
    if (!passed) {
      allPassed = false;
    }
  }
  
  // Test property details if we have a listing key
  log(`\n${'='.repeat(60)}`, 'blue');
  log('Testing Property Details Endpoint', 'blue');
  log('='.repeat(60), 'blue');
  log('Note: This requires a valid listingKey. Testing with sample...', 'yellow');
  
  // Try to get a listing key from the properties endpoint
  try {
    const listResponse = await fetch(`${API_BASE_URL}/api/properties?page=1&pageSize=1`);
    const listData = await listResponse.json();
    
    if (listData.properties && listData.properties.length > 0) {
      const listingKey = listData.properties[0].listingKey || listData.properties[0].id;
      if (listingKey) {
        const detailsUrl = `${API_BASE_URL}/api/properties/${encodeURIComponent(listingKey)}`;
        const detailsPassed = await testEndpoint(
          'Property Details Endpoint',
          detailsUrl,
          [
            { path: 'id', type: 'string', description: 'Property ID' },
            { path: 'listingKey', type: 'string', description: 'Listing key' },
            { path: 'price', type: 'number', description: 'Price' },
            { path: 'address', type: 'object', description: 'Address object' },
            { path: 'bedrooms', type: 'object', description: 'Bedrooms object' },
            { path: 'bathrooms', type: 'number', description: 'Bathrooms' },
            { path: 'images', type: 'object', description: 'Images array' },
            { path: 'rooms', type: 'object', description: 'Rooms array' },
          ]
        );
        if (!detailsPassed) {
          allPassed = false;
        }
      }
    }
  } catch (error) {
    log(`⚠️  Could not test property details: ${error.message}`, 'yellow');
  }
  
  log(`\n${'='.repeat(60)}`, 'blue');
  if (allPassed) {
    log('✅ All tests passed!', 'green');
  } else {
    log('❌ Some tests failed. Please review the output above.', 'red');
  }
  log('='.repeat(60), 'blue');
  
  process.exit(allPassed ? 0 : 1);
}

runTests().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

