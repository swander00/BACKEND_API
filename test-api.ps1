# Quick API test script
$BASE_URL = "http://localhost:8080"

function Test-Endpoint {
    param($Name, $Url)
    
    Write-Host "`n🧪 Testing $Name..." -ForegroundColor Cyan
    Write-Host "   URL: $Url" -ForegroundColor Gray
    
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -ErrorAction Stop
        $data = $response.Content | ConvertFrom-Json
        
        Write-Host "   ✅ Status: $($response.StatusCode)" -ForegroundColor Green
        
        if ($data.properties) {
            Write-Host "   📊 Properties count: $($data.properties.Count)" -ForegroundColor Yellow
            if ($data.pagination) {
                Write-Host "   📄 Pagination: Page $($data.pagination.currentPage) of $($data.pagination.totalPages)" -ForegroundColor Yellow
            }
        }
        if ($data.listings) {
            Write-Host "   🔍 Suggestions count: $($data.listings.Count)" -ForegroundColor Yellow
        }
        if ($data.error) {
            Write-Host "   ❌ Error: $($data.message)" -ForegroundColor Red
        }
    } catch {
        Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "   Response: $responseBody" -ForegroundColor Red
        }
    }
}

Write-Host "🚀 Starting API Tests...`n" -ForegroundColor Green

# Test health endpoint
Test-Endpoint "Health Check" "$BASE_URL/health"

# Test properties list
Test-Endpoint "Properties List" "$BASE_URL/api/properties?page=1&pageSize=5"

# Test search
Test-Endpoint "Search" "$BASE_URL/api/search?q=toronto&limit=5"

# Test map endpoint (with URL encoding)
$bounds = '{"northEast":{"lat":43.7,"lng":-79.3},"southWest":{"lat":43.6,"lng":-79.4}}'
$encodedBounds = [System.Web.HttpUtility]::UrlEncode($bounds)
Test-Endpoint "Map Properties" "$BASE_URL/api/properties/map?bounds=$encodedBounds"

Write-Host "`n✅ Tests complete!`n" -ForegroundColor Green

