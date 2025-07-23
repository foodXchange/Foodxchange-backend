# Fix WSL and Docker Setup Script
Write-Host "WSL and Docker Setup Fix" -ForegroundColor Cyan
Write-Host "========================`n" -ForegroundColor Cyan

# Check if running as Administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "This script requires Administrator privileges." -ForegroundColor Red
    Write-Host "Restarting as Administrator..." -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

Write-Host "Step 1: Enabling WSL and Virtual Machine Platform..." -ForegroundColor Yellow

# Enable WSL
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

# Enable Virtual Machine Platform
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

# Enable Hyper-V (optional but recommended)
dism.exe /online /enable-feature /featurename:Microsoft-Hyper-V-All /all /norestart

Write-Host "`nStep 2: Setting WSL 2 as default..." -ForegroundColor Yellow
wsl --set-default-version 2

Write-Host "`nStep 3: Installing/Updating WSL..." -ForegroundColor Yellow
wsl --update

Write-Host "`nStep 4: Checking Docker and Redis versions..." -ForegroundColor Yellow

# Check latest Docker version
Write-Host "`nChecking Docker Desktop version..." -ForegroundColor White
$dockerVersion = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*" | Where-Object { $_.DisplayName -like "Docker Desktop*" }).DisplayVersion
Write-Host "Installed Docker Desktop version: $dockerVersion" -ForegroundColor Cyan

# Latest versions as of cutoff
Write-Host "`nRecommended versions:" -ForegroundColor Yellow
Write-Host "- Docker Desktop: 4.27.0 or later" -ForegroundColor White
Write-Host "- Redis: 7.2.4 (Alpine)" -ForegroundColor White
Write-Host "- MongoDB: 7.0.5" -ForegroundColor White

Write-Host "`nStep 5: Creating docker-compose with latest versions..." -ForegroundColor Yellow

# Update docker-compose.dev.yml with latest versions
$composeContent = @'
version: '3.8'

services:
  # FoodXchange Backend Application - Development Mode
  foodxchange-backend:
    build:
      context: .
      dockerfile: Dockerfile
      target: builder
    container_name: foodxchange-backend-dev
    restart: unless-stopped
    ports:
      - "5000:5000"
      - "9090:9090"  # Metrics port
      - "9229:9229"  # Debug port
    environment:
      - NODE_ENV=development
      - PORT=5000
      - HOST=0.0.0.0
      - MONGODB_URI=mongodb://mongo:27017/foodxchange
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=foodxchange-super-secret-jwt-key-that-is-at-least-32-characters-long-for-development
      - JWT_REFRESH_SECRET=foodxchange-refresh-token-secret-that-is-at-least-32-characters-long-for-development
      - LOG_LEVEL=debug
      - METRICS_ENABLED=true
      - HEALTH_CHECK_ENABLED=true
      - PERFORMANCE_MONITORING_ENABLED=true
      - FEATURE_CACHING=true
      - FEATURE_RATE_LIMITING=false  # Disabled for development
      - FEATURE_ANALYTICS=true
      - DEV_ENABLE_DEBUG_ROUTES=true
      - DEV_ENABLE_PROFILING=true
    depends_on:
      - mongo
      - redis
    volumes:
      - .:/app
      - /app/node_modules
      - ./logs:/app/logs
      - ./uploads:/app/uploads
    networks:
      - foodxchange-network
    command: sh -c "npm install && npm run dev"

  # MongoDB Database (Latest 7.0.x)
  mongo:
    image: mongo:7.0.5
    container_name: foodxchange-mongo-dev
    restart: unless-stopped
    ports:
      - "27017:27017"
    volumes:
      - mongo-data-dev:/data/db
      - mongo-config-dev:/data/configdb
    networks:
      - foodxchange-network

  # Redis Cache (Latest 7.2.x Alpine)
  redis:
    image: redis:7.2.4-alpine
    container_name: foodxchange-redis-dev
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis-data-dev:/data
    networks:
      - foodxchange-network
    command: redis-server --appendonly yes

volumes:
  mongo-data-dev:
    driver: local
  mongo-config-dev:
    driver: local
  redis-data-dev:
    driver: local

networks:
  foodxchange-network:
    driver: bridge
'@

$composeContent | Out-File -FilePath "docker-compose.dev.updated.yml" -Encoding UTF8

Write-Host "`nSetup complete!" -ForegroundColor Green
Write-Host "`nIMPORTANT: You need to restart your computer for WSL changes to take effect." -ForegroundColor Red
Write-Host "`nAfter restart:" -ForegroundColor Yellow
Write-Host "1. Open Docker Desktop" -ForegroundColor White
Write-Host "2. Run: docker-compose -f docker-compose.dev.updated.yml up -d" -ForegroundColor White
Write-Host "3. Or run: powershell -ExecutionPolicy Bypass -File auto-start.ps1" -ForegroundColor White

$restart = Read-Host "`nDo you want to restart now? (Y/N)"
if ($restart -eq 'Y' -or $restart -eq 'y') {
    Restart-Computer -Force
}