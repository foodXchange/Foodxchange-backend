# Azure Services Health Check
function Test-AzureServices {
    Write-Host "🔍 Testing Azure Services Health..." -ForegroundColor Cyan
    
    $results = @()
    
    # Test Azure Search (if configured)
    if ($env:AZURE_SEARCH_SERVICE_NAME -and $env:AZURE_SEARCH_ADMIN_KEY) {
        try {
            $searchUrl = "https://$($env:AZURE_SEARCH_SERVICE_NAME).search.windows.net/indexes?api-version=2023-11-01"
            $headers = @{ "api-key" = $env:AZURE_SEARCH_ADMIN_KEY }
            $response = Invoke-RestMethod -Uri $searchUrl -Headers $headers -Method GET
            $results += @{ Service = "Azure Search"; Status = "✅ Working"; Details = "$($response.value.Count) indexes found" }
        } catch {
            $results += @{ Service = "Azure Search"; Status = "❌ Failed"; Details = $_.Exception.Message }
        }
    }
    
    # Add more service tests as needed...
    
    $results | ForEach-Object {
        Write-Host "$($_.Service): $($_.Status) - $($_.Details)" -ForegroundColor $(if ($_.Status -like "*Working*") { 'Green' } else { 'Red' })
    }
}
