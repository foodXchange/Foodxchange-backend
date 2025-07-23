# Quick Start Script for FoodXchange
# This script handles all Docker and Redis setup automatically

param(
    [string]$Mode = "dev"
)

Write-Host "FoodXchange Quick Start" -ForegroundColor Cyan
Write-Host "=======================" -ForegroundColor Cyan

# Function to check Docker
function Test-Docker {
    try {
        docker version *> $null
        return $true
    } catch {
        return $false
    }
}

# Function to check if virtualization is enabled
function Test-Virtualization {
    $virt = (Get-WmiObject Win32_Processor).VirtualizationFirmwareEnabled
    return $virt
}

# Function to start Docker Desktop
function Start-DockerDesktop {
    if (Test-Path "C:\Program Files\Docker\Docker\Docker Desktop.exe") {
        Write-Host "Starting Docker Desktop..." -ForegroundColor Yellow
        Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
        
        # Wait for Docker to be ready
        $attempts = 0
        while (!(Test-Docker) -and $attempts -lt 12) {
            Write-Host "Waiting for Docker to start... ($($attempts*5)s)" -ForegroundColor Gray
            Start-Sleep -Seconds 5
            $attempts++
        }
        
        if (Test-Docker) {
            Write-Host "✓ Docker is ready!" -ForegroundColor Green
            return $true
        } else {
            Write-Host "✗ Docker failed to start" -ForegroundColor Red
            return $false
        }
    } else {
        Write-Host "✗ Docker Desktop not installed" -ForegroundColor Red
        return $false
    }
}

# Main execution
Write-Host "`nChecking system requirements..." -ForegroundColor Yellow

# Check virtualization
if (!(Test-Virtualization)) {
    Write-Host "✗ CRITICAL: Virtualization is DISABLED in BIOS!" -ForegroundColor Red
    Write-Host "  You must enable Intel VT-x or AMD-V in BIOS settings" -ForegroundColor Yellow
    Write-Host "  Restart your computer and enter BIOS to enable it" -ForegroundColor Yellow
    pause
    exit 1
}
Write-Host "✓ Virtualization enabled" -ForegroundColor Green

# Check and start Docker
if (!(Test-Docker)) {
    if (!(Start-DockerDesktop)) {
        Write-Host "`nDocker Desktop is not working properly." -ForegroundColor Red
        Write-Host "Please run the following as Administrator:" -ForegroundColor Yellow
        Write-Host "  .\optimize-system.ps1" -ForegroundColor Cyan
        pause
        exit 1
    }
}

Write-Host "`nStarting FoodXchange services..." -ForegroundColor Yellow

# Create data directories if they don't exist
if (!(Test-Path ".\data")) {
    New-Item -ItemType Directory -Path ".\data\mongo" -Force | Out-Null
    New-Item -ItemType Directory -Path ".\data\redis" -Force | Out-Null
    Write-Host "✓ Created data directories" -ForegroundColor Green
}

# Choose compose file based on mode
$composeFile = if ($Mode -eq "prod") {
    "docker-compose.optimized.yml"
} else {
    "docker-compose.dev.yml"
}

Write-Host "`nStarting in $Mode mode using $composeFile..." -ForegroundColor Cyan

# Pull images first
Write-Host "`nPulling Docker images..." -ForegroundColor Yellow
docker-compose -f $composeFile pull

# Start services
Write-Host "`nStarting services..." -ForegroundColor Yellow
docker-compose -f $composeFile up -d

# Wait for services to be healthy
Write-Host "`nWaiting for services to be healthy..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Check service status
Write-Host "`nService Status:" -ForegroundColor Cyan
docker-compose -f $composeFile ps

# Test connections
Write-Host "`nTesting connections..." -ForegroundColor Yellow

# Test Redis
try {
    $redisTest = docker exec $(docker ps -qf "name=redis") redis-cli ping 2>$null
    if ($redisTest -eq "PONG") {
        Write-Host "✓ Redis is working" -ForegroundColor Green
    } else {
        Write-Host "⚠ Redis is running but not responding" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Redis connection failed" -ForegroundColor Red
}

# Test MongoDB
try {
    docker exec $(docker ps -qf "name=mongo") mongosh --eval "db.adminCommand('ping')" *> $null
    Write-Host "✓ MongoDB is working" -ForegroundColor Green
} catch {
    Write-Host "✗ MongoDB connection failed" -ForegroundColor Red
}

# Test Backend
Start-Sleep -Seconds 3
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/health" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "✓ Backend API is working" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠ Backend API is starting up..." -ForegroundColor Yellow
}

Write-Host "`n===========================================" -ForegroundColor Cyan
Write-Host "FoodXchange is starting!" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "`nAccess points:" -ForegroundColor White
Write-Host "  Backend API: http://localhost:5000" -ForegroundColor Cyan
Write-Host "  MongoDB:     mongodb://localhost:27017" -ForegroundColor Cyan
Write-Host "  Redis:       redis://localhost:6379" -ForegroundColor Cyan
if ($Mode -eq "prod") {
    Write-Host "  Nginx:       http://localhost" -ForegroundColor Cyan
    Write-Host "  Prometheus:  http://localhost:9091" -ForegroundColor Cyan
    Write-Host "  Grafana:     http://localhost:3000 (admin/admin)" -ForegroundColor Cyan
}
Write-Host "`nUseful commands:" -ForegroundColor White
Write-Host "  View logs:    docker-compose -f $composeFile logs -f" -ForegroundColor Gray
Write-Host "  Stop all:     docker-compose -f $composeFile down" -ForegroundColor Gray
Write-Host "  Restart:      docker-compose -f $composeFile restart" -ForegroundColor Gray
Write-Host "  Health check: powershell .\check-health.ps1" -ForegroundColor Gray
Write-Host ""