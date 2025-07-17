# FoodXchange Key Vault Population Script
# This script populates the Azure Key Vault with required secrets

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("dev", "staging", "prod")]
    [string]$Environment = "dev",
    
    [Parameter(Mandatory=$false)]
    [string]$KeyVaultName = "",
    
    [Parameter(Mandatory=$false)]
    [switch]$GenerateSecrets = $false
)

Write-Host "🔑 FoodXchange Key Vault Population" -ForegroundColor Green
Write-Host "Environment: $Environment" -ForegroundColor Yellow

# Auto-detect Key Vault name if not provided
if (-not $KeyVaultName) {
    $KeyVaultName = "foodxchange-$Environment-kv"
    Write-Host "Auto-detected Key Vault Name: $KeyVaultName" -ForegroundColor Yellow
}

# Check if Key Vault exists
try {
    $vault = az keyvault show --name $KeyVaultName --query "name" -o tsv
    Write-Host "✅ Key Vault found: $vault" -ForegroundColor Green
} catch {
    Write-Host "❌ Key Vault '$KeyVaultName' not found. Please check the name or deploy infrastructure first." -ForegroundColor Red
    exit 1
}

# Function to generate secure random string
function Generate-SecureString {
    param([int]$Length = 32)
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
    $random = 1..$Length | ForEach-Object { Get-Random -Maximum $chars.Length }
    return -join ($random | ForEach-Object { $chars[$_] })
}

# Function to set secret in Key Vault
function Set-KeyVaultSecret {
    param([string]$SecretName, [string]$SecretValue, [string]$Description = "")
    
    try {
        az keyvault secret set --vault-name $KeyVaultName --name $SecretName --value $SecretValue --description $Description --output none
        Write-Host "✅ Set secret: $SecretName" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to set secret: $SecretName" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n🔐 Setting up secrets..." -ForegroundColor Cyan

# Generate or prompt for secrets
if ($GenerateSecrets) {
    Write-Host "🎲 Generating secure random secrets..." -ForegroundColor Yellow
    
    # JWT Secrets
    $jwtSecret = Generate-SecureString -Length 64
    $jwtRefreshSecret = Generate-SecureString -Length 64
    
    # Encryption key
    $encryptionKey = Generate-SecureString -Length 32
    
} else {
    # Prompt for secrets
    Write-Host "📝 Please provide the following secrets:" -ForegroundColor Yellow
    
    $jwtSecret = Read-Host "JWT Secret (press Enter to generate random)"
    if (-not $jwtSecret) { $jwtSecret = Generate-SecureString -Length 64 }
    
    $jwtRefreshSecret = Read-Host "JWT Refresh Secret (press Enter to generate random)"
    if (-not $jwtRefreshSecret) { $jwtRefreshSecret = Generate-SecureString -Length 64 }
    
    $encryptionKey = Read-Host "Encryption Key (press Enter to generate random)"
    if (-not $encryptionKey) { $encryptionKey = Generate-SecureString -Length 32 }
}

# Set core secrets
Set-KeyVaultSecret -SecretName "jwt-secret" -SecretValue $jwtSecret -Description "JWT signing secret"
Set-KeyVaultSecret -SecretName "jwt-refresh-secret" -SecretValue $jwtRefreshSecret -Description "JWT refresh token secret"
Set-KeyVaultSecret -SecretName "encryption-key" -SecretValue $encryptionKey -Description "Data encryption key"

# Database connection strings
Write-Host "`n📊 Database Configuration:" -ForegroundColor Cyan
$mongoConnection = Read-Host "MongoDB Connection String (or press Enter to use default)"
if (-not $mongoConnection) {
    $mongoConnection = "mongodb://localhost:27017/foodxchange-$Environment"
}
Set-KeyVaultSecret -SecretName "mongo-connection-string" -SecretValue $mongoConnection -Description "MongoDB connection string"

# Redis connection string (should be auto-populated from deployment)
$redisConnection = Read-Host "Redis Connection String (or press Enter to skip)"
if ($redisConnection) {
    Set-KeyVaultSecret -SecretName "redis-connection-string" -SecretValue $redisConnection -Description "Redis connection string"
}

# Azure Services
Write-Host "`n🤖 Azure AI Services Configuration:" -ForegroundColor Cyan
Write-Host "Please provide your Azure AI service keys and endpoints:" -ForegroundColor Yellow

$azureOpenAIKey = Read-Host "Azure OpenAI Key (or press Enter to skip)"
if ($azureOpenAIKey) {
    Set-KeyVaultSecret -SecretName "azure-openai-key" -SecretValue $azureOpenAIKey -Description "Azure OpenAI service key"
}

$azureTextAnalyticsKey = Read-Host "Azure Text Analytics Key (or press Enter to skip)"
if ($azureTextAnalyticsKey) {
    Set-KeyVaultSecret -SecretName "azure-text-analytics-key" -SecretValue $azureTextAnalyticsKey -Description "Azure Text Analytics service key"
}

$azureFormRecognizerKey = Read-Host "Azure Form Recognizer Key (or press Enter to skip)"
if ($azureFormRecognizerKey) {
    Set-KeyVaultSecret -SecretName "azure-form-recognizer-key" -SecretValue $azureFormRecognizerKey -Description "Azure Form Recognizer service key"
}

$azureSearchKey = Read-Host "Azure Cognitive Search Key (or press Enter to skip)"
if ($azureSearchKey) {
    Set-KeyVaultSecret -SecretName "azure-search-key" -SecretValue $azureSearchKey -Description "Azure Cognitive Search service key"
}

$azureStorageConnection = Read-Host "Azure Storage Connection String (or press Enter to skip)"
if ($azureStorageConnection) {
    Set-KeyVaultSecret -SecretName "azure-storage-connection-string" -SecretValue $azureStorageConnection -Description "Azure Storage connection string"
}

$azureServiceBusConnection = Read-Host "Azure Service Bus Connection String (or press Enter to skip)"
if ($azureServiceBusConnection) {
    Set-KeyVaultSecret -SecretName "azure-service-bus-connection-string" -SecretValue $azureServiceBusConnection -Description "Azure Service Bus connection string"
}

# External Services
Write-Host "`n📱 External Services Configuration:" -ForegroundColor Cyan
Write-Host "Configure external service credentials:" -ForegroundColor Yellow

$twilioAccountSid = Read-Host "Twilio Account SID (or press Enter to skip)"
if ($twilioAccountSid) {
    Set-KeyVaultSecret -SecretName "twilio-account-sid" -SecretValue $twilioAccountSid -Description "Twilio account SID"
}

$twilioAuthToken = Read-Host "Twilio Auth Token (or press Enter to skip)"
if ($twilioAuthToken) {
    Set-KeyVaultSecret -SecretName "twilio-auth-token" -SecretValue $twilioAuthToken -Description "Twilio auth token"
}

$sendGridApiKey = Read-Host "SendGrid API Key (or press Enter to skip)"
if ($sendGridApiKey) {
    Set-KeyVaultSecret -SecretName "sendgrid-api-key" -SecretValue $sendGridApiKey -Description "SendGrid API key"
}

# OAuth Configuration
Write-Host "`n🔐 OAuth Configuration:" -ForegroundColor Cyan
Write-Host "Configure OAuth providers:" -ForegroundColor Yellow

$googleClientId = Read-Host "Google Client ID (or press Enter to skip)"
if ($googleClientId) {
    Set-KeyVaultSecret -SecretName "google-client-id" -SecretValue $googleClientId -Description "Google OAuth client ID"
}

$googleClientSecret = Read-Host "Google Client Secret (or press Enter to skip)"
if ($googleClientSecret) {
    Set-KeyVaultSecret -SecretName "google-client-secret" -SecretValue $googleClientSecret -Description "Google OAuth client secret"
}

$microsoftClientId = Read-Host "Microsoft Client ID (or press Enter to skip)"
if ($microsoftClientId) {
    Set-KeyVaultSecret -SecretName "microsoft-client-id" -SecretValue $microsoftClientId -Description "Microsoft OAuth client ID"
}

$microsoftClientSecret = Read-Host "Microsoft Client Secret (or press Enter to skip)"
if ($microsoftClientSecret) {
    Set-KeyVaultSecret -SecretName "microsoft-client-secret" -SecretValue $microsoftClientSecret -Description "Microsoft OAuth client secret"
}

Write-Host "`n✅ Key Vault population completed!" -ForegroundColor Green
Write-Host "🔍 To view all secrets, run: az keyvault secret list --vault-name $KeyVaultName" -ForegroundColor Yellow
Write-Host "🔑 To retrieve a specific secret, run: az keyvault secret show --vault-name $KeyVaultName --name <secret-name>" -ForegroundColor Yellow

# Create a summary file
$summaryFile = "keyvault-secrets-summary-$Environment.md"
$summaryContent = @"
# FoodXchange Key Vault Secrets Summary

**Environment:** $Environment  
**Key Vault:** $KeyVaultName  
**Date:** $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

## Populated Secrets

### Core Application Secrets
- `jwt-secret` - JWT signing secret
- `jwt-refresh-secret` - JWT refresh token secret  
- `encryption-key` - Data encryption key

### Database Configuration
- `mongo-connection-string` - MongoDB connection string
- `redis-connection-string` - Redis connection string

### Azure AI Services
- `azure-openai-key` - Azure OpenAI service key
- `azure-text-analytics-key` - Azure Text Analytics service key
- `azure-form-recognizer-key` - Azure Form Recognizer service key
- `azure-search-key` - Azure Cognitive Search service key
- `azure-storage-connection-string` - Azure Storage connection string
- `azure-service-bus-connection-string` - Azure Service Bus connection string

### External Services
- `twilio-account-sid` - Twilio account SID
- `twilio-auth-token` - Twilio auth token
- `sendgrid-api-key` - SendGrid API key

### OAuth Configuration
- `google-client-id` - Google OAuth client ID
- `google-client-secret` - Google OAuth client secret
- `microsoft-client-id` - Microsoft OAuth client ID
- `microsoft-client-secret` - Microsoft OAuth client secret

## Usage

The application will automatically load these secrets from Key Vault when `USE_KEY_VAULT=true` is set in the environment variables.

## Next Steps

1. Update your `.env.$Environment` file with the correct Key Vault name
2. Ensure the application has proper permissions to access Key Vault
3. Test the application to verify all secrets are loaded correctly
4. Consider setting up automatic secret rotation for production
"@

$summaryContent | Out-File -FilePath $summaryFile -Encoding UTF8
Write-Host "📝 Summary saved to: $summaryFile" -ForegroundColor Yellow

Write-Host "`n🎉 Key Vault setup completed successfully!" -ForegroundColor Green