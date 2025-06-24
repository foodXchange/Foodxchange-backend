# FoodXchange Batch Import Script
# Run this to import all data in the correct order

Write-Host "🚀 Starting FoodXchange Data Import" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan

$backendPath = "C:\Users\foodz\Documents\GitHub\Development\Foodxchange-backend"
Set-Location $backendPath

# Step 1: Install dependencies
Write-Host "`n📦 Installing dependencies..." -ForegroundColor Yellow
npm install

# Step 2: Prepare data
Write-Host "`n📊 Preparing data..." -ForegroundColor Yellow
node data/prepareData.js

# Wait for user confirmation
Write-Host "`n⚠️  Please review the data preparation results above." -ForegroundColor Yellow
Write-Host "Press any key to continue with import..." -ForegroundColor Cyan
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Step 3: Import suppliers
Write-Host "`n👥 Importing suppliers..." -ForegroundColor Yellow
node scripts/import/importData.js

# Step 4: Verify import
Write-Host "`n✅ Import Summary:" -ForegroundColor Green
Write-Host "   Check the console output above for import results" -ForegroundColor Cyan
Write-Host "   Review any errors and fix data issues if needed" -ForegroundColor Cyan

# Step 5: Generate report
Write-Host "`n📈 Generating migration report..." -ForegroundColor Yellow
$report = @{
    ImportDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    BackendPath = $backendPath
    DataPath = "$backendPath\data"
    Status = "Complete"
}

$report | ConvertTo-Json | Out-File "$backendPath\data\import_report.json"

Write-Host "`n🎉 Import complete!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "   1. Start the backend server: npm start" -ForegroundColor Cyan
Write-Host "   2. Test supplier login with imported data" -ForegroundColor Cyan
Write-Host "   3. Send welcome emails to suppliers" -ForegroundColor Cyan
