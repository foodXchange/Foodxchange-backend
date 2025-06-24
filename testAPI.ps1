# PowerShell API Test Script
Write-Host "`n🧪 Testing FoodXchange API with PowerShell" -ForegroundColor Cyan

# Test health endpoint
Write-Host "`n1. Testing health endpoint..." -ForegroundColor Yellow
$health = Invoke-RestMethod -Uri "http://localhost:5000/health" -Method Get
Write-Host "✅ API Status: $($health.status)" -ForegroundColor Green

# Test products endpoint
Write-Host "`n2. Testing products endpoint..." -ForegroundColor Yellow
$products = Invoke-RestMethod -Uri "http://localhost:5000/api/products" -Method Get
Write-Host "✅ Total products: $($products.total)" -ForegroundColor Green
Write-Host "   First 3 products:" -ForegroundColor White
$products.products | Select-Object -First 3 | ForEach-Object {
    Write-Host "   - $($_.name) ($($_.category))" -ForegroundColor Gray
}

# Test login
Write-Host "`n3. Testing login..." -ForegroundColor Yellow
$loginBody = @{
    email = "buyer@foodxchange.com"
    password = "test123"
} | ConvertTo-Json

try {
    $login = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    Write-Host "✅ Login successful!" -ForegroundColor Green
    Write-Host "   User: $($login.name)" -ForegroundColor White
    Write-Host "   Role: $($login.role)" -ForegroundColor White
    Write-Host "   Token: $(if($login.token) {'Generated'} else {'Missing'})" -ForegroundColor White
    
    # Save token for further tests
    $global:authToken = $login.token
    
    # Test authenticated endpoint
    Write-Host "`n4. Testing authenticated endpoints..." -ForegroundColor Yellow
    $headers = @{ Authorization = "Bearer $($login.token)" }
    
    $rfqs = Invoke-RestMethod -Uri "http://localhost:5000/api/rfqs" -Method Get -Headers $headers
    Write-Host "✅ RFQs endpoint: $($rfqs.total) RFQs found" -ForegroundColor Green
    
} catch {
    Write-Host "❌ Login failed: $_" -ForegroundColor Red
}

Write-Host "`n✅ API test complete!" -ForegroundColor Green
