#!/bin/bash

# Status Filters API Endpoint Test Script
# Tests the actual API endpoints with various status and date filters
# Usage: ./scripts/test-status-api-endpoints.sh [BASE_URL]
# Example: ./scripts/test-status-api-endpoints.sh http://localhost:8080

BASE_URL="${1:-http://localhost:8080}"
API_BASE="${BASE_URL}/api/properties"

echo "🧪 Status Filters API - Endpoint Tests"
echo "========================================"
echo "Base URL: ${BASE_URL}"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

# Test function
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="$3"
    
    echo -n "Testing: ${name}... "
    
    response=$(curl -s -w "\n%{http_code}" "${url}")
    http_code=$(echo "${response}" | tail -n1)
    body=$(echo "${response}" | sed '$d')
    
    if [ "${http_code}" -eq "${expected_status}" ]; then
        echo -e "${GREEN}✓${NC} (HTTP ${http_code})"
        PASSED=$((PASSED + 1))
        
        # Check if response includes timestamp fields
        if echo "${body}" | grep -q "originalEntryTimestamp"; then
            echo -e "  ${GREEN}✓${NC} Response includes originalEntryTimestamp"
        else
            echo -e "  ${YELLOW}⚠${NC} Response missing originalEntryTimestamp"
        fi
        
        if echo "${body}" | grep -q "statusDates"; then
            echo -e "  ${GREEN}✓${NC} Response includes statusDates"
        else
            echo -e "  ${YELLOW}⚠${NC} Response missing statusDates"
        fi
    else
        echo -e "${RED}✗${NC} Expected HTTP ${expected_status}, got ${http_code}"
        FAILED=$((FAILED + 1))
    fi
    echo ""
}

# Test 1: For Sale - All Time
test_endpoint "For Sale (All Time)" \
    "${API_BASE}?status=for-sale&page=1&pageSize=5" \
    200

# Test 2: For Sale - With Date Filter
test_endpoint "For Sale (Last 30 Days)" \
    "${API_BASE}?status=for-sale&dateFrom=2025-01-01&page=1&pageSize=5" \
    200

# Test 3: For Lease
test_endpoint "For Lease" \
    "${API_BASE}?status=for-lease&page=1&pageSize=5" \
    200

# Test 4: Sold
test_endpoint "Sold" \
    "${API_BASE}?status=sold&page=1&pageSize=5" \
    200

# Test 5: Sold - With Date Filter
test_endpoint "Sold (Last 90 Days)" \
    "${API_BASE}?status=sold&dateFrom=2025-01-01&page=1&pageSize=5" \
    200

# Test 6: Leased
test_endpoint "Leased" \
    "${API_BASE}?status=leased&page=1&pageSize=5" \
    200

# Test 7: Removed
test_endpoint "Removed" \
    "${API_BASE}?status=removed&page=1&pageSize=5" \
    200

# Test 8: Removed - With Date Filter
test_endpoint "Removed (Last 30 Days)" \
    "${API_BASE}?status=removed&dateFrom=2025-01-01&page=1&pageSize=5" \
    200

# Test 9: Invalid Status (should handle gracefully)
test_endpoint "Invalid Status" \
    "${API_BASE}?status=invalid&page=1&pageSize=5" \
    400

# Summary
echo "========================================"
echo "📊 Test Summary"
echo "========================================"
echo -e "${GREEN}Passed: ${PASSED}${NC}"
echo -e "${RED}Failed: ${FAILED}${NC}"
echo "Total:  $((PASSED + FAILED))"

if [ ${FAILED} -eq 0 ]; then
    echo ""
    echo "🎉 All endpoint tests passed!"
    exit 0
else
    echo ""
    echo "⚠️  Some tests failed. Please review the output above."
    exit 1
fi

