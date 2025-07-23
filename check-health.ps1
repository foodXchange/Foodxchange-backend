# Health Check Script for FoodXchange
Write-Host "`nFoodXchange Health Check" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

# Docker health check
Write-Host "`nDocker Status:" -ForegroundColor Yellow
$dockerRunning = $false
try {
    docker version *> $null
    $dockerRunning = $true
    Write-Host "✓ Docker is running" -ForegroundColor Green
    
    # Check containers
    $containers = docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>$null
    if ($containers) {
        Write-Host "`nRunning Containers:" -ForegroundColor Cyan
        $containers
    } else {
        Write-Host "⚠ No containers running" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Docker is not running" -ForegroundColor Red
    Write-Host "  Run: .\quick-start.ps1" -ForegroundColor Yellow
}

# Service health checks
if ($dockerRunning) {
    Write-Host "`nService Health:" -ForegroundColor Yellow
    
    # Redis health
    $redisContainer = docker ps -qf "name=redis" 2>$null
    if ($redisContainer) {
        try {
            $redisPing = docker exec $redisContainer redis-cli ping 2>$null
            if ($redisPing -eq "PONG") {
                Write-Host "✓ Redis is healthy" -ForegroundColor Green
                
                # Get Redis info
                $redisInfo = docker exec $redisContainer redis-cli info memory 2>$null | Select-String "used_memory_human"
                if ($redisInfo) {
                    $memUsage = $redisInfo -replace ".*:", ""
                    Write-Host "  Memory usage: $memUsage" -ForegroundColor Gray
                }
            }
        } catch {
            Write-Host "⚠ Redis container running but not responding" -ForegroundColor Yellow
        }
    } else {
        Write-Host "✗ Redis is not running" -ForegroundColor Red
    }
    
    # MongoDB health
    $mongoContainer = docker ps -qf "name=mongo" 2>$null
    if ($mongoContainer) {
        try {
            docker exec $mongoContainer mongosh --eval "db.adminCommand('ping')" *> $null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✓ MongoDB is healthy" -ForegroundColor Green
                
                # Get MongoDB stats
                $dbStats = docker exec $mongoContainer mongosh --quiet --eval "JSON.stringify(db.stats())" foodxchange 2>$null
                if ($dbStats) {
                    $stats = $dbStats | ConvertFrom-Json
                    $sizeMB = [math]::Round($stats.dataSize / 1MB, 2)
                    Write-Host "  Database size: $sizeMB MB" -ForegroundColor Gray
                }
            }
        } catch {
            Write-Host "⚠ MongoDB container running but not responding" -ForegroundColor Yellow
        }
    } else {
        Write-Host "✗ MongoDB is not running" -ForegroundColor Red
    }
    
    # Backend API health
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5000/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "✓ Backend API is healthy" -ForegroundColor Green
            $health = $response.Content | ConvertFrom-Json
            Write-Host "  Status: $($health.status)" -ForegroundColor Gray
            Write-Host "  Uptime: $($health.uptime)" -ForegroundColor Gray
        }
    } catch {
        if (docker ps | Select-String "foodxchange-backend") {
            Write-Host "⚠ Backend API is starting up..." -ForegroundColor Yellow
        } else {
            Write-Host "✗ Backend API is not running" -ForegroundColor Red
        }
    }
}

# System resources
Write-Host "`nSystem Resources:" -ForegroundColor Yellow
$mem = Get-WmiObject Win32_OperatingSystem
$totalMem = [math]::Round($mem.TotalVisibleMemorySize/1MB/1024, 2)
$freeMem = [math]::Round($mem.FreePhysicalMemory/1MB/1024, 2)
$usedMem = $totalMem - $freeMem
$memPercent = [math]::Round(($usedMem / $totalMem) * 100, 2)

Write-Host "Memory: $usedMem GB / $totalMem GB ($memPercent% used)"

# CPU usage
$cpu = Get-WmiObject Win32_Processor | Select-Object -First 1
$cpuUsage = [math]::Round($cpu.LoadPercentage, 2)
Write-Host "CPU Usage: $cpuUsage%"

# Docker resource usage
if ($dockerRunning) {
    Write-Host "`nDocker Resource Usage:" -ForegroundColor Yellow
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
}

# WSL status
Write-Host "`nWSL Status:" -ForegroundColor Yellow
$wslStatus = wsl --status 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ WSL2 is configured" -ForegroundColor Green
    
    # Check WSL memory usage
    $wslMemory = wsl free -h 2>$null | Select-String "Mem:"
    if ($wslMemory) {
        Write-Host "  $wslMemory" -ForegroundColor Gray
    }
} else {
    Write-Host "⚠ WSL2 not configured" -ForegroundColor Yellow
}

# Quick diagnostics
Write-Host "`nQuick Diagnostics:" -ForegroundColor Yellow

# Check ports
$ports = @(5000, 6379, 27017)
foreach ($port in $ports) {
    $connection = Test-NetConnection -ComputerName localhost -Port $port -WarningAction SilentlyContinue
    if ($connection.TcpTestSucceeded) {
        Write-Host "✓ Port $port is open" -ForegroundColor Green
    } else {
        Write-Host "✗ Port $port is closed" -ForegroundColor Red
    }
}

Write-Host "`n========================" -ForegroundColor Cyan
Write-Host "Health check complete!" -ForegroundColor Green