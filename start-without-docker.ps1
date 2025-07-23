# Start FoodXchange Backend without Docker
Write-Host "FoodXchange Backend - Local Development (No Docker)" -ForegroundColor Cyan
Write-Host "===================================================`n" -ForegroundColor Cyan

# Check Node.js
Write-Host "Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Node.js is not installed!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Install MongoDB locally if not running
Write-Host "`nChecking MongoDB..." -ForegroundColor Yellow
$mongoService = Get-Service -Name MongoDB -ErrorAction SilentlyContinue
if (-not $mongoService) {
    Write-Host "MongoDB is not installed as a service." -ForegroundColor Yellow
    Write-Host "You can:" -ForegroundColor White
    Write-Host "1. Install MongoDB Community Edition from https://www.mongodb.com/try/download/community" -ForegroundColor White
    Write-Host "2. Or use MongoDB Atlas (cloud) - update MONGODB_URI in .env" -ForegroundColor White
} else {
    if ($mongoService.Status -ne 'Running') {
        Write-Host "Starting MongoDB service..." -ForegroundColor White
        Start-Service -Name MongoDB
    }
    Write-Host "MongoDB is running." -ForegroundColor Green
}

# Install Redis locally using Memurai (Redis for Windows)
Write-Host "`nChecking Redis/Memurai..." -ForegroundColor Yellow
$memuraiService = Get-Service -Name Memurai -ErrorAction SilentlyContinue
if (-not $memuraiService) {
    Write-Host "Redis/Memurai is not installed." -ForegroundColor Yellow
    Write-Host "For Windows, install Memurai from https://www.memurai.com/get-memurai" -ForegroundColor White
    Write-Host "Or disable Redis caching by setting FEATURE_CACHING=false" -ForegroundColor White
} else {
    if ($memuraiService.Status -ne 'Running') {
        Write-Host "Starting Memurai service..." -ForegroundColor White
        Start-Service -Name Memurai
    }
    Write-Host "Redis/Memurai is running." -ForegroundColor Green
}

# Create .env file if not exists
if (-not (Test-Path ".env")) {
    Write-Host "`nCreating .env file..." -ForegroundColor Yellow
    @"
NODE_ENV=development
PORT=5000
HOST=localhost

# Database
MONGODB_URI=mongodb://localhost:27017/foodxchange

# Redis (set to empty to disable caching)
REDIS_URL=redis://localhost:6379

# JWT Secrets
JWT_SECRET=foodxchange-super-secret-jwt-key-development-local
JWT_REFRESH_SECRET=foodxchange-refresh-token-secret-development-local

# Features
LOG_LEVEL=debug
METRICS_ENABLED=true
HEALTH_CHECK_ENABLED=true
PERFORMANCE_MONITORING_ENABLED=false
FEATURE_CACHING=false
FEATURE_RATE_LIMITING=false
FEATURE_ANALYTICS=false

# Development
DEV_ENABLE_DEBUG_ROUTES=true
DEV_ENABLE_PROFILING=false
"@ | Out-File -FilePath ".env" -Encoding UTF8
    Write-Host ".env file created!" -ForegroundColor Green
}

# Install dependencies
Write-Host "`nChecking dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor White
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install dependencies!" -ForegroundColor Red
        exit 1
    }
}

# Build the project
Write-Host "`nBuilding project..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

# Start the server
Write-Host "`nStarting FoodXchange Backend..." -ForegroundColor Green
Write-Host "===================================================`n" -ForegroundColor Cyan

Write-Host "Service URLs:" -ForegroundColor Cyan
Write-Host "- Backend API: http://localhost:5000" -ForegroundColor White
Write-Host "- Health Check: http://localhost:5000/health" -ForegroundColor White
Write-Host "- API Docs: http://localhost:5000/api-docs" -ForegroundColor White
Write-Host "`nPress Ctrl+C to stop the server`n" -ForegroundColor Yellow

# Start in development mode
npm run dev