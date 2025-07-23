# PowerShell script to enable virtualization features for Docker
# MUST RUN AS ADMINISTRATOR

Write-Host "Docker Desktop Virtualization Enabler" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

# Check if running as administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    pause
    exit 1
}

# Check virtualization in BIOS
Write-Host "`nChecking BIOS virtualization status..." -ForegroundColor Yellow
$virt = (Get-WmiObject Win32_Processor).VirtualizationFirmwareEnabled
if ($virt -eq $false) {
    Write-Host "CRITICAL: Virtualization is DISABLED in BIOS!" -ForegroundColor Red
    Write-Host "You MUST enable Intel VT-x or AMD-V in your BIOS settings first!" -ForegroundColor Red
    Write-Host "`nRestart your computer and enter BIOS to enable virtualization." -ForegroundColor Yellow
    pause
    exit 1
}
Write-Host "✓ Virtualization is enabled in BIOS" -ForegroundColor Green

# Enable Hyper-V
Write-Host "`nEnabling Hyper-V..." -ForegroundColor Yellow
try {
    Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All -NoRestart
    Write-Host "✓ Hyper-V enabled" -ForegroundColor Green
} catch {
    Write-Host "Failed to enable Hyper-V: $_" -ForegroundColor Red
}

# Enable WSL
Write-Host "`nEnabling Windows Subsystem for Linux..." -ForegroundColor Yellow
try {
    Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart
    Write-Host "✓ WSL enabled" -ForegroundColor Green
} catch {
    Write-Host "Failed to enable WSL: $_" -ForegroundColor Red
}

# Enable Virtual Machine Platform
Write-Host "`nEnabling Virtual Machine Platform..." -ForegroundColor Yellow
try {
    Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart
    Write-Host "✓ Virtual Machine Platform enabled" -ForegroundColor Green
} catch {
    Write-Host "Failed to enable Virtual Machine Platform: $_" -ForegroundColor Red
}

# Download and install WSL2 kernel update
Write-Host "`nDownloading WSL2 kernel update..." -ForegroundColor Yellow
$wslUpdateUrl = "https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi"
$wslUpdatePath = "$env:TEMP\wsl_update_x64.msi"
try {
    Invoke-WebRequest -Uri $wslUpdateUrl -OutFile $wslUpdatePath
    Write-Host "Installing WSL2 kernel update..." -ForegroundColor Yellow
    Start-Process msiexec.exe -Wait -ArgumentList "/I $wslUpdatePath /quiet"
    Write-Host "✓ WSL2 kernel update installed" -ForegroundColor Green
} catch {
    Write-Host "Failed to install WSL2 update: $_" -ForegroundColor Red
}

# Set WSL2 as default
Write-Host "`nSetting WSL2 as default version..." -ForegroundColor Yellow
try {
    wsl --set-default-version 2
    Write-Host "✓ WSL2 set as default" -ForegroundColor Green
} catch {
    Write-Host "Note: WSL2 will be set as default after restart" -ForegroundColor Yellow
}

Write-Host "`n====================================" -ForegroundColor Cyan
Write-Host "Setup complete! Please restart your computer." -ForegroundColor Green
Write-Host "After restart, Docker Desktop should work properly." -ForegroundColor Green
Write-Host "`nPress any key to restart now, or close this window to restart later." -ForegroundColor Yellow
pause
Restart-Computer -Confirm