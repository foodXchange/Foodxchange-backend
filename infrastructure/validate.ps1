# Infrastructure Validation Script
# This script validates the Bicep templates before deployment

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('dev', 'staging', 'prod')]
    [string]$Environment,
    
    [Parameter(Mandatory = $true)]
    [string]$Location = 'eastus',
    
    [Parameter(Mandatory = $false)]
    [string]$BaseName = 'foodxchange',
    
    [Parameter(Mandatory = $false)]
    [switch]$WhatIf
)

# Set error action preference
$ErrorActionPreference = 'Stop'

# Function to write colored output
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = 'White'
    )
    Write-Host $Message -ForegroundColor $Color
}

# Function to validate Bicep files
function Test-BicepFile {
    param(
        [string]$FilePath
    )
    
    Write-ColorOutput "Validating Bicep file: $FilePath" -Color Yellow
    
    try {
        $result = az bicep build --file $FilePath --stdout 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-ColorOutput "❌ Bicep validation failed for $FilePath" -Color Red
            Write-ColorOutput $result -Color Red
            return $false
        } else {
            Write-ColorOutput "✅ Bicep validation passed for $FilePath" -Color Green
            return $true
        }
    } catch {
        Write-ColorOutput "❌ Error validating $FilePath : $($_.Exception.Message)" -Color Red
        return $false
    }
}

# Function to validate ARM template deployment
function Test-ArmDeployment {
    param(
        [string]$ResourceGroupName,
        [string]$TemplateFile,
        [hashtable]$Parameters
    )
    
    Write-ColorOutput "Validating ARM deployment for $TemplateFile" -Color Yellow
    
    try {
        $parameterString = ""
        foreach ($key in $Parameters.Keys) {
            $parameterString += "$key=$($Parameters[$key]) "
        }
        
        if ($WhatIf) {
            $result = az deployment group what-if `
                --resource-group $ResourceGroupName `
                --template-file $TemplateFile `
                --parameters $parameterString
        } else {
            $result = az deployment group validate `
                --resource-group $ResourceGroupName `
                --template-file $TemplateFile `
                --parameters $parameterString
        }
        
        if ($LASTEXITCODE -ne 0) {
            Write-ColorOutput "❌ ARM template validation failed" -Color Red
            Write-ColorOutput $result -Color Red
            return $false
        } else {
            Write-ColorOutput "✅ ARM template validation passed" -Color Green
            return $true
        }
    } catch {
        Write-ColorOutput "❌ Error validating ARM deployment: $($_.Exception.Message)" -Color Red
        return $false
    }
}

# Main validation script
Write-ColorOutput "🚀 Starting infrastructure validation for environment: $Environment" -Color Cyan
Write-ColorOutput "Location: $Location" -Color Cyan
Write-ColorOutput "Base Name: $BaseName" -Color Cyan

# Check if Azure CLI is installed and logged in
Write-ColorOutput "Checking Azure CLI..." -Color Yellow
try {
    $azVersion = az version --output json | ConvertFrom-Json
    Write-ColorOutput "✅ Azure CLI version: $($azVersion.'azure-cli')" -Color Green
} catch {
    Write-ColorOutput "❌ Azure CLI not found. Please install Azure CLI." -Color Red
    exit 1
}

# Check if logged in to Azure
try {
    $account = az account show --output json | ConvertFrom-Json
    Write-ColorOutput "✅ Logged in to Azure subscription: $($account.name)" -Color Green
} catch {
    Write-ColorOutput "❌ Not logged in to Azure. Please run 'az login'." -Color Red
    exit 1
}

# Check if Bicep is installed
Write-ColorOutput "Checking Bicep CLI..." -Color Yellow
try {
    $bicepVersion = az bicep version
    Write-ColorOutput "✅ Bicep version: $bicepVersion" -Color Green
} catch {
    Write-ColorOutput "❌ Bicep not found. Installing Bicep..." -Color Yellow
    az bicep install
    if ($LASTEXITCODE -ne 0) {
        Write-ColorOutput "❌ Failed to install Bicep" -Color Red
        exit 1
    }
}

# Validate all Bicep files
$bicepFiles = @(
    "main.bicep",
    "modules/backend.bicep",
    "modules/redis.bicep",
    "modules/apimanagement.bicep",
    "modules/cosmosdb-optimization.bicep",
    "modules/multiregion.bicep",
    "modules/monitoring.bicep",
    "modules/encryption.bicep"
)

$validationResults = @()

foreach ($file in $bicepFiles) {
    $filePath = Join-Path $PSScriptRoot $file
    if (Test-Path $filePath) {
        $result = Test-BicepFile -FilePath $filePath
        $validationResults += @{
            File = $file
            Status = $result
        }
    } else {
        Write-ColorOutput "⚠️ File not found: $filePath" -Color Yellow
        $validationResults += @{
            File = $file
            Status = $false
        }
    }
}

# Check if all Bicep validations passed
$failedValidations = $validationResults | Where-Object { $_.Status -eq $false }
if ($failedValidations.Count -gt 0) {
    Write-ColorOutput "❌ Bicep validation failed for the following files:" -Color Red
    foreach ($failed in $failedValidations) {
        Write-ColorOutput "  - $($failed.File)" -Color Red
    }
    exit 1
}

# Create temporary resource group for validation
$resourceGroupName = "$BaseName-validation-$Environment-rg"
Write-ColorOutput "Creating temporary resource group: $resourceGroupName" -Color Yellow

try {
    az group create --name $resourceGroupName --location $Location --output none
    Write-ColorOutput "✅ Resource group created successfully" -Color Green
} catch {
    Write-ColorOutput "❌ Failed to create resource group: $($_.Exception.Message)" -Color Red
    exit 1
}

# Validate main template deployment
$parameters = @{
    environment = $Environment
    location = $Location
    baseName = $BaseName
}

$mainTemplateValidation = Test-ArmDeployment -ResourceGroupName $resourceGroupName -TemplateFile (Join-Path $PSScriptRoot "main.bicep") -Parameters $parameters

# Clean up temporary resource group
Write-ColorOutput "Cleaning up temporary resource group..." -Color Yellow
try {
    az group delete --name $resourceGroupName --yes --no-wait --output none
    Write-ColorOutput "✅ Resource group cleanup initiated" -Color Green
} catch {
    Write-ColorOutput "⚠️ Failed to clean up resource group: $($_.Exception.Message)" -Color Yellow
}

# Final validation report
Write-ColorOutput "`n📊 Validation Report" -Color Cyan
Write-ColorOutput "===================" -Color Cyan

foreach ($result in $validationResults) {
    $status = if ($result.Status) { "✅ PASSED" } else { "❌ FAILED" }
    $color = if ($result.Status) { "Green" } else { "Red" }
    Write-ColorOutput "$status - $($result.File)" -Color $color
}

if ($mainTemplateValidation) {
    Write-ColorOutput "✅ PASSED - Main template ARM validation" -Color Green
} else {
    Write-ColorOutput "❌ FAILED - Main template ARM validation" -Color Red
}

# Summary
$totalFiles = $validationResults.Count
$passedFiles = ($validationResults | Where-Object { $_.Status -eq $true }).Count
$failedFiles = $totalFiles - $passedFiles

Write-ColorOutput "`n📈 Summary:" -Color Cyan
Write-ColorOutput "Total files validated: $totalFiles" -Color White
Write-ColorOutput "Passed: $passedFiles" -Color Green
Write-ColorOutput "Failed: $failedFiles" -Color Red

if ($failedFiles -eq 0 -and $mainTemplateValidation) {
    Write-ColorOutput "`n🎉 All validations passed! Infrastructure is ready for deployment." -Color Green
    exit 0
} else {
    Write-ColorOutput "`n❌ Some validations failed. Please fix the issues before deployment." -Color Red
    exit 1
}