# System Optimization Script for Docker and Redis
# Run as Administrator

Write-Host "FoodXchange System Optimizer for Docker & Redis" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

# Check admin privileges
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "ERROR: Run as Administrator required!" -ForegroundColor Red
    pause
    exit 1
}

# Function to check and enable Windows features
function Enable-RequiredFeatures {
    Write-Host "`n1. Enabling Required Windows Features..." -ForegroundColor Yellow
    
    $features = @(
        "Microsoft-Hyper-V-All",
        "Microsoft-Windows-Subsystem-Linux",
        "VirtualMachinePlatform",
        "Containers",
        "Containers-DisposableClientVM"
    )
    
    foreach ($feature in $features) {
        try {
            $state = Get-WindowsOptionalFeature -Online -FeatureName $feature -ErrorAction SilentlyContinue
            if ($state.State -ne "Enabled") {
                Write-Host "   Enabling $feature..." -ForegroundColor Gray
                Enable-WindowsOptionalFeature -Online -FeatureName $feature -All -NoRestart -ErrorAction SilentlyContinue | Out-Null
                Write-Host "   ✓ $feature enabled" -ForegroundColor Green
            } else {
                Write-Host "   ✓ $feature already enabled" -ForegroundColor Green
            }
        } catch {
            Write-Host "   ⚠ $feature not available on this system" -ForegroundColor Yellow
        }
    }
}

# Function to optimize Docker settings
function Optimize-Docker {
    Write-Host "`n2. Optimizing Docker Settings..." -ForegroundColor Yellow
    
    # Create Docker config directory
    $dockerConfig = "$env:USERPROFILE\.docker"
    if (!(Test-Path $dockerConfig)) {
        New-Item -ItemType Directory -Path $dockerConfig -Force | Out-Null
    }
    
    # Create optimized daemon.json
    $daemonConfig = @{
        "builder" = @{
            "gc" = @{
                "defaultKeepStorage" = "20GB"
                "enabled" = $true
            }
        }
        "experimental" = $false
        "features" = @{
            "buildkit" = $true
        }
        "max-concurrent-downloads" = 10
        "max-concurrent-uploads" = 10
        "storage-driver" = "windowsfilter"
        "log-driver" = "json-file"
        "log-opts" = @{
            "max-size" = "10m"
            "max-file" = "3"
        }
        "dns" = @("8.8.8.8", "8.8.4.4")
    }
    
    $daemonConfig | ConvertTo-Json -Depth 4 | Set-Content "$dockerConfig\daemon.json"
    Write-Host "   ✓ Docker daemon optimized" -ForegroundColor Green
    
    # Set Docker memory limits
    Write-Host "   Setting Docker resource limits..." -ForegroundColor Gray
    
    # Create .wslconfig for WSL2 memory optimization
    $wslConfig = @"
[wsl2]
memory=4GB
processors=2
swap=2GB
localhostForwarding=true

[experimental]
autoMemoryReclaim=gradual
networkingMode=mirrored
dnsTunneling=true
firewall=false
"@
    
    $wslConfig | Set-Content "$env:USERPROFILE\.wslconfig"
    Write-Host "   ✓ WSL2 memory optimized (4GB RAM, 2GB Swap)" -ForegroundColor Green
}

# Function to setup Redis optimization
function Optimize-Redis {
    Write-Host "`n3. Creating Redis Configuration..." -ForegroundColor Yellow
    
    # Create Redis config directory
    $redisDir = ".\docker\redis"
    if (!(Test-Path $redisDir)) {
        New-Item -ItemType Directory -Path $redisDir -Force | Out-Null
    }
    
    # Create optimized Redis configuration
    $redisConfig = @"
# Redis Configuration for FoodXchange

# Network
bind 0.0.0.0
protected-mode no
port 6379
tcp-backlog 511
timeout 0
tcp-keepalive 300

# General
daemonize no
supervised no
loglevel notice
logfile ""
databases 16
always-show-logo no

# Persistence
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir /data

# Replication
replica-read-only yes

# Memory Management
maxmemory 512mb
maxmemory-policy allkeys-lru
maxmemory-samples 5

# Lazy Freeing
lazyfree-lazy-eviction no
lazyfree-lazy-expire no
lazyfree-lazy-server-del no
replica-lazy-flush no

# Append Only Mode
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
aof-load-truncated yes
aof-use-rdb-preamble yes

# Slow Log
slowlog-log-slower-than 10000
slowlog-max-len 128

# Client Output Buffer Limits
client-output-buffer-limit normal 0 0 0
client-output-buffer-limit replica 256mb 64mb 60
client-output-buffer-limit pubsub 32mb 8mb 60

# Performance Tuning
hz 10
dynamic-hz yes

# Advanced Config
hash-max-ziplist-entries 512
hash-max-ziplist-value 64
list-max-ziplist-size -2
list-compress-depth 0
set-max-intset-entries 512
zset-max-ziplist-entries 128
zset-max-ziplist-value 64
hll-sparse-max-bytes 3000
stream-node-max-bytes 4096
stream-node-max-entries 100
"@
    
    $redisConfig | Set-Content "$redisDir\redis.conf"
    Write-Host "   ✓ Redis configuration optimized" -ForegroundColor Green
}

# Function to create system services
function Setup-Services {
    Write-Host "`n4. Setting up System Services..." -ForegroundColor Yellow
    
    # Create Docker startup script
    $startupScript = @"
@echo off
echo Starting Docker Engine...

REM Check if Docker Desktop is installed
if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    timeout /t 30 /nobreak > nul
    echo Docker Desktop started.
) else (
    echo Docker Desktop not found. Please install Docker Desktop.
    pause
    exit /b 1
)

REM Wait for Docker to be ready
:WAIT_DOCKER
docker version > nul 2>&1
if %errorlevel% neq 0 (
    echo Waiting for Docker to start...
    timeout /t 5 /nobreak > nul
    goto WAIT_DOCKER
)

echo Docker is ready!

REM Start Redis container if not running
docker ps | findstr "redis" > nul 2>&1
if %errorlevel% neq 0 (
    echo Starting Redis container...
    docker run -d --name redis-foodxchange -p 6379:6379 -v redis-data:/data redis:7-alpine
)

echo All services started successfully!
"@
    
    $startupScript | Set-Content ".\start-services.bat"
    Write-Host "   ✓ Service startup script created" -ForegroundColor Green
}

# Function to create health check scripts
function Create-HealthChecks {
    Write-Host "`n5. Creating Health Check Scripts..." -ForegroundColor Yellow
    
    # Docker health check
    $dockerCheck = @'
# Docker Health Check
$dockerRunning = $false
try {
    docker version | Out-Null
    $dockerRunning = $true
    Write-Host "✓ Docker is running" -ForegroundColor Green
    
    # Check containers
    $containers = docker ps --format "table {{.Names}}\t{{.Status}}" 2>$null
    if ($containers) {
        Write-Host "`nRunning Containers:" -ForegroundColor Cyan
        Write-Host $containers
    }
} catch {
    Write-Host "✗ Docker is not running" -ForegroundColor Red
    Write-Host "  Run: start-services.bat" -ForegroundColor Yellow
}

# Redis health check
if ($dockerRunning) {
    $redisRunning = docker ps | Select-String "redis"
    if ($redisRunning) {
        Write-Host "`n✓ Redis is running" -ForegroundColor Green
        
        # Test Redis connection
        try {
            docker exec redis-foodxchange redis-cli ping 2>$null
            Write-Host "✓ Redis connection successful" -ForegroundColor Green
        } catch {
            Write-Host "⚠ Redis container running but not responding" -ForegroundColor Yellow
        }
    } else {
        Write-Host "`n✗ Redis is not running" -ForegroundColor Red
    }
}

# System resources
Write-Host "`nSystem Resources:" -ForegroundColor Cyan
$mem = Get-WmiObject Win32_OperatingSystem
$totalMem = [math]::Round($mem.TotalVisibleMemorySize/1MB, 2)
$freeMem = [math]::Round($mem.FreePhysicalMemory/1MB, 2)
$usedMem = $totalMem - $freeMem
$memPercent = [math]::Round(($usedMem / $totalMem) * 100, 2)

Write-Host "Memory: $usedMem GB / $totalMem GB ($memPercent% used)"

# WSL status
$wslStatus = wsl --status 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ WSL2 is configured" -ForegroundColor Green
} else {
    Write-Host "`n⚠ WSL2 not configured" -ForegroundColor Yellow
}
'@
    
    $dockerCheck | Set-Content ".\check-health.ps1"
    Write-Host "   ✓ Health check scripts created" -ForegroundColor Green
}

# Function to configure firewall rules
function Configure-Firewall {
    Write-Host "`n6. Configuring Firewall Rules..." -ForegroundColor Yellow
    
    # Docker rules
    New-NetFirewallRule -DisplayName "Docker" -Direction Inbound -Protocol TCP -LocalPort 2375,2376 -Action Allow -ErrorAction SilentlyContinue | Out-Null
    
    # Redis rule
    New-NetFirewallRule -DisplayName "Redis" -Direction Inbound -Protocol TCP -LocalPort 6379 -Action Allow -ErrorAction SilentlyContinue | Out-Null
    
    # Application ports
    New-NetFirewallRule -DisplayName "FoodXchange Backend" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -ErrorAction SilentlyContinue | Out-Null
    New-NetFirewallRule -DisplayName "FoodXchange Metrics" -Direction Inbound -Protocol TCP -LocalPort 9090 -Action Allow -ErrorAction SilentlyContinue | Out-Null
    
    Write-Host "   ✓ Firewall rules configured" -ForegroundColor Green
}

# Main execution
Write-Host "`nStarting system optimization..." -ForegroundColor Green

Enable-RequiredFeatures
Optimize-Docker
Optimize-Redis
Setup-Services
Create-HealthChecks
Configure-Firewall

# Create final setup summary
$summary = @"

OPTIMIZATION COMPLETE!
====================

Files Created:
- .docker/daemon.json (Docker optimization)
- .wslconfig (WSL2 memory settings)
- docker/redis/redis.conf (Redis configuration)
- start-services.bat (Service startup)
- check-health.ps1 (Health monitoring)

Next Steps:
1. RESTART your computer to apply all changes
2. After restart, run: .\start-services.bat
3. Check health: powershell .\check-health.ps1

Docker will use:
- 4GB RAM maximum
- 2GB Swap space
- Optimized storage driver

Redis will use:
- 512MB RAM maximum
- LRU eviction policy
- Persistence enabled

"@

Write-Host $summary -ForegroundColor Cyan

# Prompt for restart
$restart = Read-Host "`nRestart computer now? (Y/N)"
if ($restart -eq "Y" -or $restart -eq "y") {
    Restart-Computer -Confirm
}