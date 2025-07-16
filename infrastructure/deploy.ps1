# Enhanced FoodXchange Infrastructure Deployment Script
# This script deploys the complete FoodXchange infrastructure with enhanced features

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('dev', 'staging', 'prod')]
    [string]$Environment,
    
    [Parameter(Mandatory = $true)]
    [string]$Location = 'eastus',
    
    [Parameter(Mandatory = $false)]
    [string]$BaseName = 'foodxchange',
    
    [Parameter(Mandatory = $false)]
    [string]$SubscriptionId,
    
    [Parameter(Mandatory = $false)]
    [switch]$WhatIf,
    
    [Parameter(Mandatory = $false)]
    [switch]$Validate,
    
    [Parameter(Mandatory = $false)]
    [switch]$Force,
    
    [Parameter(Mandatory = $false)]
    [switch]$SkipValidation
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

# Function to check prerequisites
function Test-Prerequisites {
    Write-ColorOutput "🔍 Checking prerequisites..." -Color Yellow
    
    # Check Azure CLI
    try {
        $azVersion = az version --output json | ConvertFrom-Json
        Write-ColorOutput "✅ Azure CLI version: $($azVersion.'azure-cli')" -Color Green
    } catch {
        Write-ColorOutput "❌ Azure CLI not found. Please install Azure CLI." -Color Red
        return $false
    }
    
    # Check if logged in
    try {
        $account = az account show --output json | ConvertFrom-Json
        Write-ColorOutput "✅ Logged in to Azure subscription: $($account.name)" -Color Green
        
        if ($SubscriptionId -and $account.id -ne $SubscriptionId) {
            Write-ColorOutput "⚠️ Setting subscription to: $SubscriptionId" -Color Yellow
            az account set --subscription $SubscriptionId
        }
    } catch {
        Write-ColorOutput "❌ Not logged in to Azure. Please run 'az login'." -Color Red
        return $false
    }
    
    # Check Bicep
    try {
        $bicepVersion = az bicep version
        Write-ColorOutput "✅ Bicep version: $bicepVersion" -Color Green
    } catch {
        Write-ColorOutput "❌ Bicep not found. Installing..." -Color Yellow
        az bicep install
        if ($LASTEXITCODE -ne 0) {
            Write-ColorOutput "❌ Failed to install Bicep" -Color Red
            return $false
        }
    }
    
    return $true
}

# Function to validate deployment
function Invoke-DeploymentValidation {
    param(
        [string]$ResourceGroupName,
        [string]$TemplateFile,
        [hashtable]$Parameters
    )
    
    Write-ColorOutput "🔎 Validating deployment..." -Color Yellow
    
    $parameterArgs = @()
    foreach ($key in $Parameters.Keys) {
        $parameterArgs += "$key=$($Parameters[$key])"
    }
    
    $validationResult = az deployment group validate `
        --resource-group $ResourceGroupName `
        --template-file $TemplateFile `
        --parameters $parameterArgs `
        --output json | ConvertFrom-Json
    
    if ($LASTEXITCODE -ne 0) {
        Write-ColorOutput "❌ Validation failed!" -Color Red
        return $false
    }
    
    Write-ColorOutput "✅ Validation passed!" -Color Green
    return $true
}

# Function to perform what-if analysis
function Invoke-WhatIfAnalysis {
    param(
        [string]$ResourceGroupName,
        [string]$TemplateFile,
        [hashtable]$Parameters
    )
    
    Write-ColorOutput "🔍 Performing what-if analysis..." -Color Yellow
    
    $parameterArgs = @()
    foreach ($key in $Parameters.Keys) {
        $parameterArgs += "$key=$($Parameters[$key])"
    }
    
    $whatIfResult = az deployment group what-if `
        --resource-group $ResourceGroupName `
        --template-file $TemplateFile `
        --parameters $parameterArgs `
        --output json
    
    if ($LASTEXITCODE -ne 0) {
        Write-ColorOutput "❌ What-if analysis failed!" -Color Red
        return $false
    }
    
    Write-ColorOutput "✅ What-if analysis completed!" -Color Green
    return $true
}

# Function to deploy infrastructure
function Invoke-InfrastructureDeployment {
    param(
        [hashtable]$Parameters
    )
    
    Write-ColorOutput "🚀 Starting infrastructure deployment..." -Color Cyan
    
    $parameterArgs = @()
    foreach ($key in $Parameters.Keys) {
        $parameterArgs += "$key=$($Parameters[$key])"
    }
    
    $deploymentName = "foodxchange-$Environment-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    
    $deploymentResult = az deployment sub create `
        --name $deploymentName `
        --location $Location `
        --template-file "main.bicep" `
        --parameters $parameterArgs `
        --output json | ConvertFrom-Json
    
    if ($LASTEXITCODE -ne 0) {
        Write-ColorOutput "❌ Deployment failed!" -Color Red
        return $false
    }
    
    Write-ColorOutput "✅ Deployment completed successfully!" -Color Green
    return $deploymentResult
}

# Function to perform health check
function Invoke-HealthCheck {
    param(
        [string]$AppServiceUrl
    )
    
    Write-ColorOutput "🏥 Performing health check..." -Color Yellow
    
    $maxRetries = 10
    $retryCount = 0
    
    while ($retryCount -lt $maxRetries) {
        try {
            $healthUrl = "$AppServiceUrl/api/health"
            $response = Invoke-WebRequest -Uri $healthUrl -Method GET -TimeoutSec 30
            
            if ($response.StatusCode -eq 200) {
                Write-ColorOutput "✅ Health check passed!" -Color Green
                return $true
            }
        } catch {
            $retryCount++
            Write-ColorOutput "⚠️ Health check attempt $retryCount failed. Retrying in 30 seconds..." -Color Yellow
            Start-Sleep -Seconds 30
        }
    }
    
    Write-ColorOutput "❌ Health check failed after $maxRetries attempts!" -Color Red
    return $false
}

# Function to display deployment summary
function Show-DeploymentSummary {
    param(
        [object]$DeploymentResult
    )
    
    Write-ColorOutput "`n📊 Deployment Summary" -Color Cyan
    Write-ColorOutput "======================" -Color Cyan
    
    if ($DeploymentResult.properties.outputs) {
        foreach ($output in $DeploymentResult.properties.outputs.PSObject.Properties) {
            Write-ColorOutput "$($output.Name): $($output.Value.value)" -Color White
        }
    }
    
    Write-ColorOutput "`nDeployment Duration: $($DeploymentResult.properties.duration)" -Color Green
    Write-ColorOutput "Deployment Mode: $($DeploymentResult.properties.mode)" -Color Green
    Write-ColorOutput "Provisioning State: $($DeploymentResult.properties.provisioningState)" -Color Green
}

# Main deployment logic
try {
    Write-ColorOutput "🌟 FoodXchange Infrastructure Deployment" -Color Cyan
    Write-ColorOutput "Environment: $Environment" -Color Cyan
    Write-ColorOutput "Location: $Location" -Color Cyan
    Write-ColorOutput "Base Name: $BaseName" -Color Cyan
    
    # Check prerequisites
    if (-not (Test-Prerequisites)) {
        exit 1
    }
    
    # Prepare deployment parameters
    $deploymentParameters = @{
        environment = $Environment
        location = $Location
        baseName = $BaseName
    }
    
    # Validation
    if (-not $SkipValidation) {
        if ($Validate) {
            Write-ColorOutput "🔍 Running validation only..." -Color Yellow
            & "$PSScriptRoot\validate.ps1" -Environment $Environment -Location $Location -BaseName $BaseName
            if ($LASTEXITCODE -ne 0) {
                Write-ColorOutput "❌ Validation failed!" -Color Red
                exit 1
            }
            Write-ColorOutput "✅ Validation completed successfully!" -Color Green
            exit 0
        }
        
        # Quick validation check
        Write-ColorOutput "🔍 Running quick validation..." -Color Yellow
        $resourceGroupName = "$BaseName-$Environment-rg"
        
        # Create temporary resource group for validation
        az group create --name "$resourceGroupName-validate" --location $Location --output none
        
        $validationSuccess = Invoke-DeploymentValidation -ResourceGroupName "$resourceGroupName-validate" -TemplateFile "main.bicep" -Parameters $deploymentParameters
        
        # Cleanup validation resource group
        az group delete --name "$resourceGroupName-validate" --yes --no-wait --output none
        
        if (-not $validationSuccess) {
            Write-ColorOutput "❌ Validation failed!" -Color Red
            exit 1
        }
    }
    
    # What-if analysis
    if ($WhatIf) {
        Write-ColorOutput "🔍 Running what-if analysis..." -Color Yellow
        $resourceGroupName = "$BaseName-$Environment-rg"
        
        # Create temporary resource group for what-if
        az group create --name "$resourceGroupName-whatif" --location $Location --output none
        
        $whatIfSuccess = Invoke-WhatIfAnalysis -ResourceGroupName "$resourceGroupName-whatif" -TemplateFile "main.bicep" -Parameters $deploymentParameters
        
        # Cleanup what-if resource group
        az group delete --name "$resourceGroupName-whatif" --yes --no-wait --output none
        
        if (-not $whatIfSuccess) {
            Write-ColorOutput "❌ What-if analysis failed!" -Color Red
            exit 1
        }
        
        Write-ColorOutput "✅ What-if analysis completed!" -Color Green
        exit 0
    }
    
    # Confirm deployment
    if (-not $Force) {
        $confirmation = Read-Host "Are you sure you want to deploy to $Environment environment? (y/N)"
        if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
            Write-ColorOutput "❌ Deployment cancelled by user." -Color Yellow
            exit 0
        }
    }
    
    # Deploy infrastructure
    $deploymentResult = Invoke-InfrastructureDeployment -Parameters $deploymentParameters
    
    if (-not $deploymentResult) {
        Write-ColorOutput "❌ Deployment failed!" -Color Red
        exit 1
    }
    
    # Display deployment summary
    Show-DeploymentSummary -DeploymentResult $deploymentResult
    
    # Health check
    if ($deploymentResult.properties.outputs.appServiceUrl) {
        $appServiceUrl = $deploymentResult.properties.outputs.appServiceUrl.value
        Write-ColorOutput "🏥 Running health check on: $appServiceUrl" -Color Yellow
        
        # Wait for app service to be ready
        Start-Sleep -Seconds 60
        
        $healthCheckPassed = Invoke-HealthCheck -AppServiceUrl $appServiceUrl
        
        if (-not $healthCheckPassed) {
            Write-ColorOutput "⚠️ Health check failed, but deployment was successful. Please check the application manually." -Color Yellow
        }
    }
    
    Write-ColorOutput "`n🎉 Deployment completed successfully!" -Color Green
    Write-ColorOutput "Next steps:" -Color Cyan
    Write-ColorOutput "1. Verify all resources are running properly" -Color White
    Write-ColorOutput "2. Configure DNS and SSL certificates if needed" -Color White
    Write-ColorOutput "3. Set up monitoring alerts" -Color White
    Write-ColorOutput "4. Configure backup policies" -Color White
    Write-ColorOutput "5. Run integration tests" -Color White
    
} catch {
    Write-ColorOutput "❌ Deployment failed with error: $($_.Exception.Message)" -Color Red
    Write-ColorOutput "Stack trace: $($_.Exception.StackTrace)" -Color Red
    exit 1
}