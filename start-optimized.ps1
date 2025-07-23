# Optimized startup script for FoodXchange Backend
param(
    [switch]$Build,
    [switch]$Production,
    [switch]$NoBuild,
    [switch]$Detached
)

Write-Host "Starting FoodXchange Backend Services (Optimized)..." -ForegroundColor Green

# Check if Docker is running
$dockerStatus = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker is not running. Starting Docker Desktop..." -ForegroundColor Yellow
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    
    # Wait for Docker to start
    $timeout = 60
    $elapsed = 0
    while ($elapsed -lt $timeout) {
        Start-Sleep -Seconds 2
        $elapsed += 2
        $dockerStatus = docker info 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Docker started successfully!" -ForegroundColor Green
            break
        }
        Write-Host "Waiting for Docker to start... ($elapsed/$timeout seconds)" -ForegroundColor Yellow
    }
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to start Docker after $timeout seconds" -ForegroundColor Red
        exit 1
    }
}

# Create data directories if they don't exist
$dataDirs = @(".\data\mongo", ".\data\redis", ".\logs", ".\uploads")
foreach ($dir in $dataDirs) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "Created directory: $dir" -ForegroundColor Gray
    }
}

# Set environment variables
$env:COMPOSE_DOCKER_CLI_BUILD = "1"
$env:DOCKER_BUILDKIT = "1"

# Build command
$composeFile = if ($Production) { "docker-compose.optimized.yml" } else { "docker-compose.dev.yml" }
$buildArgs = @()

if ($Build -or !$NoBuild) {
    Write-Host "Building optimized Docker images..." -ForegroundColor Yellow
    
    # Build with cache and parallel processing
    $buildCommand = "docker-compose -f $composeFile build"
    if (!$Production) {
        $buildCommand += " --parallel"
    }
    
    Invoke-Expression $buildCommand
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Build completed successfully!" -ForegroundColor Green
}

# Stop existing containers
Write-Host "Stopping existing containers..." -ForegroundColor Yellow
docker-compose -f $composeFile down --remove-orphans

# Start services
Write-Host "Starting services..." -ForegroundColor Yellow
$runCommand = "docker-compose -f $composeFile up"
if ($Detached) {
    $runCommand += " -d"
}

Invoke-Expression $runCommand

if ($Detached -and $LASTEXITCODE -eq 0) {
    Write-Host "`nServices started successfully!" -ForegroundColor Green
    Write-Host "`nService URLs:" -ForegroundColor Cyan
    Write-Host "  - Backend API: http://localhost:5000" -ForegroundColor White
    Write-Host "  - Health Check: http://localhost:5000/health" -ForegroundColor White
    Write-Host "  - Metrics: http://localhost:9090/metrics" -ForegroundColor White
    Write-Host "  - MongoDB: mongodb://localhost:27017" -ForegroundColor White
    Write-Host "  - Redis: redis://localhost:6379" -ForegroundColor White
    
    if ($Production) {
        Write-Host "  - Nginx Proxy: http://localhost" -ForegroundColor White
        Write-Host "  - Prometheus: http://localhost:9091" -ForegroundColor White
        Write-Host "  - Grafana: http://localhost:3000" -ForegroundColor White
    }
    
    Write-Host "`nTo view logs: docker-compose -f $composeFile logs -f" -ForegroundColor Gray
    Write-Host "To stop: docker-compose -f $composeFile down" -ForegroundColor Gray
}