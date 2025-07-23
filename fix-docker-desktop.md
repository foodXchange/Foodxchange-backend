# Docker Desktop Fix Guide

## Issue Identified
Virtualization is **DISABLED** in your BIOS/UEFI settings. Docker Desktop requires virtualization to be enabled.

## Step-by-Step Fix

### 1. Enable Virtualization in BIOS
1. Restart your computer
2. Enter BIOS/UEFI (usually by pressing F2, F10, DEL, or ESC during startup)
3. Look for one of these settings:
   - Intel VT-x (for Intel CPUs)
   - AMD-V (for AMD CPUs)
   - Virtualization Technology
   - SVM Mode
4. Enable the virtualization setting
5. Save and exit BIOS

### 2. Enable Windows Features (Run as Administrator)
Open PowerShell as Administrator and run:

```powershell
# Enable Hyper-V
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All

# Enable WSL2
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux
Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform

# Download WSL2 kernel update
Invoke-WebRequest -Uri https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi -OutFile wsl_update_x64.msi
Start-Process msiexec.exe -Wait -ArgumentList '/I wsl_update_x64.msi /quiet'

# Set WSL2 as default
wsl --set-default-version 2
```

### 3. Fix Docker Desktop Issues
If Docker Desktop still won't start after enabling virtualization:

```powershell
# Reset Docker Desktop (Run as Administrator)
& "C:\Program Files\Docker\Docker\Docker Desktop.exe" -cleanup

# Clear Docker data
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Docker" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:APPDATA\Docker" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:APPDATA\Docker Desktop" -ErrorAction SilentlyContinue

# Restart Docker Desktop
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
```

### 4. Alternative: Use Docker Toolbox (if virtualization cannot be enabled)
If you cannot enable virtualization (older CPU or restricted BIOS):

1. Uninstall Docker Desktop
2. Download Docker Toolbox from: https://github.com/docker-archive/toolbox/releases
3. Install Docker Toolbox (uses VirtualBox instead of Hyper-V)

## Quick Diagnostic Commands

Run these to check your system:

```powershell
# Check virtualization in BIOS
wmic path win32_processor get VirtualizationFirmwareEnabled

# Check Hyper-V status (run as admin)
Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All

# Check WSL status
wsl --status

# Check Docker service
Get-Service | Where-Object {$_.Name -like "*docker*"}
```

## Common Error Fixes

### "Docker Desktop - WSL Update" Error
```powershell
wsl --update
wsl --shutdown
```

### "Docker Desktop stopped" Error
1. Open Services (services.msc)
2. Find "Docker Desktop Service"
3. Right-click → Properties → Set Startup type to "Automatic"
4. Start the service

### Network Issues
```powershell
# Reset network settings
netsh winsock reset
netsh int ip reset
ipconfig /release
ipconfig /renew
ipconfig /flushdns
```

## After Fixing
Once Docker Desktop is running:
1. Right-click Docker icon in system tray → Settings
2. Ensure "Use WSL 2 based engine" is checked
3. Apply & Restart