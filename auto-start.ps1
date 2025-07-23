# Auto-start script for FoodXchange Backend
Write-Host "FoodXchange Backend Auto-Start Script" -ForegroundColor Cyan
Write-Host "=====================================`n" -ForegroundColor Cyan

# Function to check if a process is running
function Test-ProcessRunning {
    param($ProcessName)
    return (Get-Process -Name $ProcessName -ErrorAction SilentlyContinue) -ne $null
}

# 1. Start Docker Desktop if not running
Write-Host "Step 1: Checking Docker Desktop..." -ForegroundColor Yellow
if (-not (Test-ProcessRunning "Docker Desktop")) {
    Write-Host "Starting Docker Desktop..." -ForegroundColor White
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
} else {
    Write-Host "Docker Desktop is already running." -ForegroundColor Green
}

# 2. Wait for Docker to be ready
Write-Host "`nStep 2: Waiting for Docker Engine to be ready..." -ForegroundColor Yellow
$timeout = 300  # 5 minutes
$elapsed = 0

while ($elapsed -lt $timeout) {
    try {
        $result = docker version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Docker Engine is ready!" -ForegroundColor Green
            break
        }
    }
    catch {}
    
    Write-Host "." -NoNewline
    Start-Sleep -Seconds 5
    $elapsed += 5
}

if ($elapsed -ge $timeout) {
    Write-Host "`nTimeout: Docker Engine did not start in time!" -ForegroundColor Red
    Write-Host "Please start Docker Desktop manually and run this script again." -ForegroundColor Yellow
    exit 1
}

# 3. Start Redis container
Write-Host "`nStep 3: Starting Redis container..." -ForegroundColor Yellow
docker run -d --name foodxchange-redis -p 6379:6379 redis:7-alpine 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Redis container started successfully!" -ForegroundColor Green
} else {
    # Check if container already exists
    $existingRedis = docker ps -a --filter "name=foodxchange-redis" --format "{{.Names}}"
    if ($existingRedis) {
        Write-Host "Redis container already exists. Restarting..." -ForegroundColor White
        docker start foodxchange-redis | Out-Null
        Write-Host "Redis container restarted!" -ForegroundColor Green
    } else {
        Write-Host "Failed to start Redis container!" -ForegroundColor Red
        exit 1
    }
}

# 4. Start MongoDB container
Write-Host "`nStep 4: Starting MongoDB container..." -ForegroundColor Yellow
docker run -d --name foodxchange-mongo -p 27017:27017 mongo:7.0 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "MongoDB container started successfully!" -ForegroundColor Green
} else {
    # Check if container already exists
    $existingMongo = docker ps -a --filter "name=foodxchange-mongo" --format "{{.Names}}"
    if ($existingMongo) {
        Write-Host "MongoDB container already exists. Restarting..." -ForegroundColor White
        docker start foodxchange-mongo | Out-Null
        Write-Host "MongoDB container restarted!" -ForegroundColor Green
    } else {
        Write-Host "Failed to start MongoDB container!" -ForegroundColor Red
        exit 1
    }
}

# 5. Wait for services to be ready
Write-Host "`nStep 5: Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# 6. Install dependencies if needed
Write-Host "`nStep 6: Checking Node.js dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor White
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install dependencies!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Dependencies already installed." -ForegroundColor Green
}

# 7. Build the project
Write-Host "`nStep 7: Building the project..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "Build completed successfully!" -ForegroundColor Green

# 8. Start the server
Write-Host "`nStep 8: Starting FoodXchange server..." -ForegroundColor Yellow
Write-Host "=====================================`n" -ForegroundColor Cyan

# Display service URLs
Write-Host "Service URLs:" -ForegroundColor Cyan
Write-Host "- Backend API: http://localhost:5000" -ForegroundColor White
Write-Host "- MongoDB: mongodb://localhost:27017" -ForegroundColor White
Write-Host "- Redis: redis://localhost:6379" -ForegroundColor White
Write-Host "- Health Check: http://localhost:5000/health" -ForegroundColor White
Write-Host "`nStarting server in development mode...`n" -ForegroundColor Yellow

# Set environment variables
$env:NODE_ENV = "development"
$env:MONGODB_URI = "mongodb://localhost:27017/foodxchange"
$env:REDIS_URL = "redis://localhost:6379"
$env:JWT_SECRET = "foodxchange-super-secret-jwt-key-development"
$env:JWT_REFRESH_SECRET = "foodxchange-refresh-token-secret-development"
$env:PORT = "5000"

# Start the server
npm run dev