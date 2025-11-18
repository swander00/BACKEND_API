// ============================================
// API STATUS CHECK - Run in Browser Console
// ============================================
// Copy and paste this entire script into browser console on your frontend
// It will verify API connectivity and parameter alignment

(async function checkAPIStatus() {
  // Get API URL from window or use default
  const apiUrl = window.NEXT_PUBLIC_BACKEND_URL || 
                 (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BACKEND_URL) ||
                 'https://apibackend-production-696e.up.railway.app';
  
  console.log('🔍 API Status Check Starting...\n');
  console.log('API URL:', apiUrl);
  console.log('Frontend URL:', window.location.origin);
  console.log('---\n');

  const results = {
    health: null,
    properties: null,
    search: null,
    map: null,
    filters: null,
    sorting: null,
    searchTerm: null
  };

  // Test 1: Health Check
  try {
    const res = await fetch(`${apiUrl}/health`);
    const data = await res.json();
    results.health = {
      status: res.ok ? '✅ PASS' : '❌ FAIL',
      response: data,
      database: data.checks?.database || 'unknown'
    };
  } catch (err) {
    results.health = { status: '❌ FAIL', error: err.message };
  }

  // Test 2: Properties List (Basic)
  try {
    const res = await fetch(`${apiUrl}/api/properties?page=1&pageSize=5`);
    const data = await res.json();
    results.properties = {
      status: res.ok ? '✅ PASS' : '❌ FAIL',
      count: data.properties?.length || 0,
      totalCount: data.totalCount || 0,
      hasPagination: !!data.pagination
    };
  } catch (err) {
    results.properties = { status: '❌ FAIL', error: err.message };
  }

  // Test 3: Properties with Filters
  try {
    const params = new URLSearchParams({
      page: '1',
      pageSize: '5',
      city: 'Toronto',
      minPrice: '500000',
      maxPrice: '1000000',
      sortBy: 'price_desc'
    });
    const res = await fetch(`${apiUrl}/api/properties?${params.toString()}`);
    const data = await res.json();
    const urlHasFilters = res.url.includes('city=Toronto') && res.url.includes('minPrice');
    results.filters = {
      status: res.ok && urlHasFilters ? '✅ PASS' : '❌ FAIL',
      filtersInURL: urlHasFilters,
      results: data.properties?.length || 0
    };
  } catch (err) {
    results.filters = { status: '❌ FAIL', error: err.message };
  }

  // Test 4: Properties with Sorting
  try {
    const params = new URLSearchParams({
      page: '1',
      pageSize: '5',
      sortBy: 'price_desc'
    });
    const res = await fetch(`${apiUrl}/api/properties?${params.toString()}`);
    const data = await res.json();
    const urlHasSort = res.url.includes('sortBy=price_desc');
    results.sorting = {
      status: res.ok && urlHasSort ? '✅ PASS' : '❌ FAIL',
      sortInURL: urlHasSort,
      results: data.properties?.length || 0
    };
  } catch (err) {
    results.sorting = { status: '❌ FAIL', error: err.message };
  }

  // Test 5: Properties with Search Term
  try {
    const params = new URLSearchParams({
      page: '1',
      pageSize: '5',
      searchTerm: 'toronto'
    });
    const res = await fetch(`${apiUrl}/api/properties?${params.toString()}`);
    const data = await res.json();
    const urlHasSearch = res.url.includes('searchTerm=toronto');
    results.searchTerm = {
      status: res.ok && urlHasSearch ? '✅ PASS' : '❌ FAIL',
      searchInURL: urlHasSearch,
      results: data.properties?.length || 0
    };
  } catch (err) {
    results.searchTerm = { status: '❌ FAIL', error: err.message };
  }

  // Test 6: Search Autocomplete
  try {
    const res = await fetch(`${apiUrl}/api/search?q=toronto&limit=5`);
    const data = await res.json();
    results.search = {
      status: res.ok ? '✅ PASS' : '❌ FAIL',
      suggestions: data.listings?.length || 0
    };
  } catch (err) {
    results.search = { status: '❌ FAIL', error: err.message };
  }

  // Test 7: Map Endpoint
  try {
    const bounds = JSON.stringify({
      northEast: { lat: 43.7, lng: -79.4 },
      southWest: { lat: 43.6, lng: -79.5 }
    });
    const params = new URLSearchParams({ bounds });
    const res = await fetch(`${apiUrl}/api/properties/map?${params.toString()}`);
    const data = await res.json();
    // Map endpoint is valid if it returns 200 and has properties array (even if empty)
    results.map = {
      status: res.ok && Array.isArray(data.properties) ? '✅ PASS' : '❌ FAIL',
      properties: data.properties?.length || 0,
      hasBounds: res.url.includes('bounds=')
    };
  } catch (err) {
    results.map = { status: '❌ FAIL', error: err.message };
  }

  // Print Results
  console.log('\n📊 API STATUS RESULTS:\n');
  console.log('1. Health Check:', results.health.status, results.health.database ? `(DB: ${results.health.database})` : '');
  console.log('2. Properties List:', results.properties.status, `(${results.properties.count || 0} properties)`);
  console.log('3. Filters:', results.filters.status, results.filters.filtersInURL ? '(Filters in URL)' : '(Filters NOT in URL)');
  console.log('4. Sorting:', results.sorting.status, results.sorting.sortInURL ? '(Sort in URL)' : '(Sort NOT in URL)');
  console.log('5. Search Term:', results.searchTerm.status, results.searchTerm.searchInURL ? '(Search in URL)' : '(Search NOT in URL)');
  console.log('6. Search Autocomplete:', results.search.status, `(${results.search.suggestions || 0} suggestions)`);
  console.log('7. Map Endpoint:', results.map.status, `(${results.map.properties || 0} properties)`);

  // Summary
  const allPass = Object.values(results).every(r => r.status === '✅ PASS');
  console.log('\n---');
  console.log(allPass ? '✅ ALL TESTS PASSED - API is ready!' : '❌ SOME TESTS FAILED - Check details above');
  console.log('---\n');

  // Return results for further inspection
  return results;
})();

