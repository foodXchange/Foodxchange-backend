# FoodXchange Infrastructure Deployment Script
# This script deploys the FoodXchange backend infrastructure to Azure

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("dev", "staging", "prod")]
    [string]$Environment = "dev",
    
    [Parameter(Mandatory=$false)]
    [string]$Location = "eastus",
    
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroupName = "foodxchange-$Environment-rg",
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipAuth = $false
)

Write-Host "🚀 FoodXchange Infrastructure Deployment" -ForegroundColor Green
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host "Location: $Location" -ForegroundColor Yellow
Write-Host "Resource Group: $ResourceGroupName" -ForegroundColor Yellow

# Check if Azure CLI is installed
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Error "Azure CLI is not installed. Please install it from https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
}

# Check authentication
if (-not $SkipAuth) {
    Write-Host "🔐 Checking Azure authentication..." -ForegroundColor Cyan
    try {
        $account = az account show --query "user.name" -o tsv
        Write-Host "✅ Authenticated as: $account" -ForegroundColor Green
    } catch {
        Write-Host "❌ Not authenticated. Please run 'az login' first." -ForegroundColor Red
        Write-Host "For MFA accounts, use: az login --use-device-code" -ForegroundColor Yellow
        exit 1
    }
}

# Deploy the infrastructure
try {
    Write-Host "🏗️ Deploying infrastructure..." -ForegroundColor Cyan
    
    # Create the deployment
    $deploymentName = "foodxchange-$Environment-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    
    Write-Host "Deployment Name: $deploymentName" -ForegroundColor Yellow
    
    $deploymentResult = az deployment sub create `
        --name $deploymentName `
        --location $Location `
        --template-file "infrastructure/main.bicep" `
        --parameters environment=$Environment `
        --verbose
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Infrastructure deployment completed successfully!" -ForegroundColor Green
        
        # Parse deployment outputs
        $outputs = $deploymentResult | ConvertFrom-Json
        
        Write-Host "`n📊 Deployment Outputs:" -ForegroundColor Green
        Write-Host "Resource Group: $($outputs.properties.outputs.resourceGroupName.value)" -ForegroundColor White
        Write-Host "App Service URL: $($outputs.properties.outputs.appServiceUrl.value)" -ForegroundColor White
        Write-Host "Key Vault URI: $($outputs.properties.outputs.keyVaultUri.value)" -ForegroundColor White
        Write-Host "Cosmos DB Endpoint: $($outputs.properties.outputs.cosmosDbEndpoint.value)" -ForegroundColor White
        Write-Host "Redis Cache: $($outputs.properties.outputs.redisCacheHostName.value)" -ForegroundColor White
        Write-Host "API Management: $($outputs.properties.outputs.apiManagementGatewayUrl.value)" -ForegroundColor White
        
        # Save outputs to file
        $outputsFile = "deployment-outputs-$Environment.json"
        $outputs | ConvertTo-Json -Depth 10 | Out-File -FilePath $outputsFile
        Write-Host "💾 Deployment outputs saved to: $outputsFile" -ForegroundColor Yellow
        
        # Create environment variables file
        $envFile = ".env.$Environment"
        $envContent = @"
# FoodXchange Backend Environment Variables - $Environment
# Generated on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

# Environment
NODE_ENV=$Environment
PORT=5000
HOST=0.0.0.0

# Azure Services
AZURE_SUBSCRIPTION_ID=$((az account show --query id -o tsv))
AZURE_RESOURCE_GROUP=$($outputs.properties.outputs.resourceGroupName.value)
AZURE_APP_SERVICE_NAME=$($outputs.properties.outputs.appServiceName.value)
AZURE_KEY_VAULT_NAME=$($outputs.properties.outputs.keyVaultName.value)
AZURE_KEY_VAULT_URI=$($outputs.properties.outputs.keyVaultUri.value)
AZURE_COSMOS_DB_ENDPOINT=$($outputs.properties.outputs.cosmosDbEndpoint.value)
AZURE_REDIS_HOSTNAME=$($outputs.properties.outputs.redisCacheHostName.value)
AZURE_API_MANAGEMENT_URL=$($outputs.properties.outputs.apiManagementGatewayUrl.value)

# Application Insights
APPLICATIONINSIGHTS_CONNECTION_STRING=$($outputs.properties.outputs.appInsightsConnectionString.value)

# Security
USE_KEY_VAULT=true
KEY_VAULT_NAME=$($outputs.properties.outputs.keyVaultName.value)

# Database
MONGO_CONNECTION_STRING=<Get from Key Vault>
REDIS_CONNECTION_STRING=$($outputs.properties.outputs.redisCacheConnectionString.value)

# JWT
JWT_SECRET=<Get from Key Vault>
JWT_REFRESH_SECRET=<Get from Key Vault>

# Azure AI Services (Get from Key Vault)
AZURE_OPENAI_ENDPOINT=<Get from Key Vault>
AZURE_OPENAI_KEY=<Get from Key Vault>
AZURE_TEXT_ANALYTICS_ENDPOINT=<Get from Key Vault>
AZURE_TEXT_ANALYTICS_KEY=<Get from Key Vault>
AZURE_FORM_RECOGNIZER_ENDPOINT=<Get from Key Vault>
AZURE_FORM_RECOGNIZER_KEY=<Get from Key Vault>
AZURE_SEARCH_ENDPOINT=<Get from Key Vault>
AZURE_SEARCH_KEY=<Get from Key Vault>
AZURE_STORAGE_CONNECTION_STRING=<Get from Key Vault>
AZURE_SERVICE_BUS_CONNECTION_STRING=<Get from Key Vault>
"@
        
        $envContent | Out-File -FilePath $envFile -Encoding UTF8
        Write-Host "📝 Environment file created: $envFile" -ForegroundColor Yellow
        
        Write-Host "`n🔑 Next Steps:" -ForegroundColor Green
        Write-Host "1. Populate Key Vault with secrets using the script: scripts/populate-keyvault.ps1" -ForegroundColor White
        Write-Host "2. Update the $envFile file with actual values" -ForegroundColor White
        Write-Host "3. Deploy the application using: npm run build && npm run start" -ForegroundColor White
        Write-Host "4. Configure custom domain and SSL certificate" -ForegroundColor White
        
    } else {
        Write-Host "❌ Infrastructure deployment failed!" -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Host "❌ Error during deployment: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`n🎉 Deployment completed successfully!" -ForegroundColor Green
Write-Host "Visit your application at: $($outputs.properties.outputs.appServiceUrl.value)" -ForegroundColor Cyan