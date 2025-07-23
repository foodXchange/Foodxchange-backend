@echo off
echo Starting FoodXchange Backend with Docker...

REM Check if Docker is running
docker version >nul 2>&1
if %errorlevel% neq 0 (
    echo Docker Desktop is not running. Please start Docker Desktop and try again.
    echo You can start Docker Desktop from the Start Menu.
    pause
    exit /b 1
)

echo Docker is running!

REM Choose environment
set /p env="Which environment? (dev/prod) [default: dev]: "
if "%env%"=="" set env=dev

if "%env%"=="dev" (
    echo Starting development environment...
    docker-compose -f docker-compose.dev.yml up --build
) else if "%env%"=="prod" (
    echo Starting production environment...
    docker-compose up --build
) else (
    echo Invalid environment. Please choose 'dev' or 'prod'.
    pause
    exit /b 1
)