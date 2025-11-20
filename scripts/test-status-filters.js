/**
 * Status Filters API Test Script
 * 
 * Tests the status filtering and timestamp mapping functionality
 * Run with: node scripts/test-status-filters.js
 */

import { getTimestampColumnForStatus, buildRemovedDateFilter, getRemovedDateColumns } from '../utils/statusTimestampMapper.js';

console.log('🧪 Status Filters API - Test Script\n');
console.log('=' .repeat(60));

// Test 1: Timestamp Column Mapping
console.log('\n📋 Test 1: Timestamp Column Mapping');
console.log('-'.repeat(60));

const statusTests = [
  { status: 'for-sale', expected: 'OriginalEntryTimestampRaw' },
  { status: 'for_lease', expected: 'OriginalEntryTimestampRaw' },
  { status: 'for-lease', expected: 'OriginalEntryTimestampRaw' },
  { status: 'sold', expected: 'PurchaseContractDate' },
  { status: 'leased', expected: 'PurchaseContractDate' },
  { status: 'removed', expected: 'COALESCE_REMOVED' },
];

let passedTests = 0;
let failedTests = 0;

statusTests.forEach(({ status, expected }) => {
  const result = getTimestampColumnForStatus(status);
  const passed = result === expected;
  
  if (passed) {
    console.log(`✅ ${status.padEnd(15)} → ${result}`);
    passedTests++;
  } else {
    console.log(`❌ ${status.padEnd(15)} → Expected: ${expected}, Got: ${result}`);
    failedTests++;
  }
});

// Test 2: Removed Date Columns
console.log('\n📋 Test 2: Removed Date Columns');
console.log('-'.repeat(60));

const removedColumns = getRemovedDateColumns();
const expectedColumns = ['SuspendedDate', 'TerminatedDate', 'ExpirationDate', 'WithdrawnDate', 'UnavailableDate'];
const columnsMatch = JSON.stringify(removedColumns) === JSON.stringify(expectedColumns);

if (columnsMatch) {
  console.log('✅ Removed date columns match expected:', removedColumns.join(', '));
  passedTests++;
} else {
  console.log('❌ Removed date columns mismatch');
  console.log('   Expected:', expectedColumns.join(', '));
  console.log('   Got:', removedColumns.join(', '));
  failedTests++;
}

// Test 3: Removed Date Filter Builder
console.log('\n📋 Test 3: Removed Date Filter Builder');
console.log('-'.repeat(60));

const testDate = '2025-01-01';
const removedFilter = buildRemovedDateFilter(testDate);
const expectedPattern = 'SuspendedDate.gte.2025-01-01,TerminatedDate.gte.2025-01-01,ExpirationDate.gte.2025-01-01,WithdrawnDate.gte.2025-01-01,UnavailableDate.gte.2025-01-01';

// Check if all columns are present
const allColumnsPresent = expectedColumns.every(col => removedFilter.includes(`${col}.gte.${testDate}`));

if (allColumnsPresent) {
  console.log('✅ Removed date filter includes all columns');
  console.log(`   Filter: ${removedFilter.substring(0, 80)}...`);
  passedTests++;
} else {
  console.log('❌ Removed date filter missing columns');
  console.log('   Expected pattern:', expectedPattern.substring(0, 80) + '...');
  console.log('   Got:', removedFilter.substring(0, 80) + '...');
  failedTests++;
}

// Test 4: Invalid Status Handling
console.log('\n📋 Test 4: Invalid Status Handling');
console.log('-'.repeat(60));

const invalidStatuses = ['invalid', '', null, undefined, 'unknown'];
invalidStatuses.forEach(status => {
  const result = getTimestampColumnForStatus(status);
  if (result === null) {
    console.log(`✅ Invalid status "${status}" → null (handled correctly)`);
    passedTests++;
  } else {
    console.log(`❌ Invalid status "${status}" → ${result} (should be null)`);
    failedTests++;
  }
});

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 Test Summary');
console.log('-'.repeat(60));
console.log(`✅ Passed: ${passedTests}`);
console.log(`❌ Failed: ${failedTests}`);
console.log(`📈 Total:  ${passedTests + failedTests}`);

if (failedTests === 0) {
  console.log('\n🎉 All tests passed!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please review the output above.');
  process.exit(1);
}

