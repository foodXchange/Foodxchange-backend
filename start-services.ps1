Write-Host "Waiting for Docker Desktop to start..." -ForegroundColor Yellow

$timeout = 300  # 5 minutes timeout
$elapsed = 0

while ($elapsed -lt $timeout) {
    try {
        docker version | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Docker is ready!" -ForegroundColor Green
            break
        }
    }
    catch {
        # Docker not ready yet
    }
    
    Write-Host "." -NoNewline
    Start-Sleep -Seconds 5
    $elapsed += 5
}

if ($elapsed -ge $timeout) {
    Write-Host "`nTimeout waiting for Docker to start!" -ForegroundColor Red
    exit 1
}

Write-Host "`nStarting FoodXchange services..." -ForegroundColor Yellow

# Start services
docker-compose -f docker-compose.dev.yml up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nServices started successfully!" -ForegroundColor Green
    Write-Host "`nService URLs:" -ForegroundColor Cyan
    Write-Host "- Backend API: http://localhost:5000" -ForegroundColor White
    Write-Host "- MongoDB: mongodb://localhost:27017" -ForegroundColor White
    Write-Host "- Redis: redis://localhost:6379" -ForegroundColor White
    Write-Host "- Metrics: http://localhost:9090" -ForegroundColor White
    Write-Host "- Debug: http://localhost:9229" -ForegroundColor White
    
    Write-Host "`nTo view logs:" -ForegroundColor Yellow
    Write-Host "docker-compose -f docker-compose.dev.yml logs -f" -ForegroundColor White
    
    Write-Host "`nTo stop services:" -ForegroundColor Yellow
    Write-Host "docker-compose -f docker-compose.dev.yml down" -ForegroundColor White
} else {
    Write-Host "`nFailed to start services!" -ForegroundColor Red
    exit 1
}