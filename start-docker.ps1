# PowerShell script to start FoodXchange Backend with Docker

Write-Host "Starting FoodXchange Backend with Docker..." -ForegroundColor Green

# Check if Docker is running
$dockerStatus = docker version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker Desktop is not running. Please start Docker Desktop and try again." -ForegroundColor Red
    Write-Host "You can start Docker Desktop from the Start Menu or by running:" -ForegroundColor Yellow
    Write-Host "  Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'" -ForegroundColor Cyan
    exit 1
}

Write-Host "Docker is running!" -ForegroundColor Green

# Choose environment
$env = Read-Host "Which environment? (dev/prod) [default: dev]"
if ([string]::IsNullOrWhiteSpace($env)) {
    $env = "dev"
}

if ($env -eq "dev") {
    Write-Host "Starting development environment..." -ForegroundColor Yellow
    docker-compose -f docker-compose.dev.yml up --build
} elseif ($env -eq "prod") {
    Write-Host "Starting production environment..." -ForegroundColor Yellow
    docker-compose up --build
} else {
    Write-Host "Invalid environment. Please choose 'dev' or 'prod'." -ForegroundColor Red
    exit 1
}