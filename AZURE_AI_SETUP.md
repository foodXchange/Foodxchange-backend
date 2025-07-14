# Azure AI Services Setup Guide

## Prerequisites

You need an Azure account and the following services created:

1. **Azure Cognitive Services Multi-Service Account** (or individual services)
2. **Azure OpenAI Service** (requires application approval)

## Step 1: Create Azure Resources

### Option A: Using Azure Portal

1. Go to [Azure Portal](https://portal.azure.com)
2. Create a new Resource Group (e.g., `foodxchange-rg`)
3. Create the following resources:

#### Text Analytics
- Search for "Language service"
- Create with name: `foodxchange-language`
- Select pricing tier: F0 (free) or S (standard)
- After creation, go to "Keys and Endpoint"
- Copy Endpoint and Key1

#### Computer Vision
- Search for "Computer Vision"
- Create with name: `foodxchange-vision`
- Select pricing tier: F0 (free) or S1
- After creation, go to "Keys and Endpoint"
- Copy Endpoint and Key1

#### Form Recognizer
- Search for "Form Recognizer"
- Create with name: `foodxchange-forms`
- Select pricing tier: F0 (free) or S0
- After creation, go to "Keys and Endpoint"
- Copy Endpoint and Key1

#### Azure OpenAI (Optional - Requires Approval)
- Search for "Azure OpenAI"
- Create with name: `foodxchange-openai`
- Deploy a model (e.g., `gpt-35-turbo`)
- Copy Endpoint, Key, and Deployment Name

### Option B: Using Azure CLI

```bash
# Login to Azure
az login

# Set variables
$RG="foodxchange-rg"
$LOCATION="eastus"

# Create resource group
az group create --name $RG --location $LOCATION

# Create Cognitive Services account (includes multiple services)
az cognitiveservices account create `
  --name "foodxchange-cognitive" `
  --resource-group $RG `
  --kind "CognitiveServices" `
  --sku "S0" `
  --location $LOCATION `
  --yes

# Get the endpoint and key
$ENDPOINT=$(az cognitiveservices account show `
  --name "foodxchange-cognitive" `
  --resource-group $RG `
  --query "properties.endpoint" -o tsv)

$KEY=$(az cognitiveservices account keys list `
  --name "foodxchange-cognitive" `
  --resource-group $RG `
  --query "key1" -o tsv)

Write-Host "Endpoint: $ENDPOINT"
Write-Host "Key: $KEY"
```

## Step 2: Update Environment Variables

Add these to your `.env` file:

```env
# Azure Cognitive Services (if using multi-service account)
AZURE_COGNITIVE_SERVICES_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_COGNITIVE_SERVICES_KEY=your-key-here

# Or individual services
AZURE_TEXT_ANALYTICS_ENDPOINT=https://your-language.cognitiveservices.azure.com/
AZURE_TEXT_ANALYTICS_KEY=your-key-here

AZURE_COMPUTER_VISION_ENDPOINT=https://your-vision.cognitiveservices.azure.com/
AZURE_COMPUTER_VISION_KEY=your-key-here

AZURE_FORM_RECOGNIZER_ENDPOINT=https://your-forms.cognitiveservices.azure.com/
AZURE_FORM_RECOGNIZER_KEY=your-key-here

# Azure OpenAI (if available)
AZURE_OPENAI_ENDPOINT=https://your-openai.openai.azure.com/
AZURE_OPENAI_KEY=your-key-here
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-35-turbo

# Azure Storage (for file uploads)
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=youraccountname;AccountKey=yourkey;EndpointSuffix=core.windows.net
AZURE_STORAGE_CONTAINER_NAME=foodxchange-files
```

## Step 3: Test Your Configuration

Run this test script to verify your Azure AI setup:

```typescript
// test-azure-ai.ts
import { AzureAIService } from './src/infrastructure/azure/ai/AzureAIService';

async function testAzureAI() {
  const ai = AzureAIService.getInstance();
  await ai.initialize();
  
  // Test text analysis
  const textResult = await ai.analyzeText('FoodXchange is the best B2B food marketplace!');
  console.log('Text Analysis:', textResult);
  
  // Test health check
  const health = await ai.healthCheck();
  console.log('AI Services Health:', health);
}

testAzureAI().catch(console.error);
```

## Step 4: Enable AI Features

In your `.env` file, enable AI features:

```env
ENABLE_AI_FEATURES=true
```

## Pricing Information

### Free Tier Limits (F0)
- **Text Analytics**: 5,000 transactions/month
- **Computer Vision**: 5,000 transactions/month
- **Form Recognizer**: 500 pages/month

### Standard Tier (S0/S1)
- **Text Analytics**: $1-$4 per 1,000 transactions
- **Computer Vision**: $1-$2.50 per 1,000 transactions
- **Form Recognizer**: $1.50 per 1,000 pages
- **OpenAI**: Varies by model and usage

## Security Best Practices

1. **Never commit API keys** to version control
2. **Use Azure Key Vault** for production
3. **Implement rate limiting** in your application
4. **Monitor usage** to avoid unexpected costs
5. **Use managed identities** when deployed to Azure

## Troubleshooting

### Common Issues

1. **401 Unauthorized**: Check your API key
2. **403 Forbidden**: Check service region and availability
3. **429 Too Many Requests**: You've hit rate limits
4. **503 Service Unavailable**: Service is down or endpoint is wrong

### Debug Commands

```bash
# Test endpoint connectivity
curl -X POST "YOUR_ENDPOINT/text/analytics/v3.1/sentiment" \
  -H "Ocp-Apim-Subscription-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"documents":[{"id":"1","text":"Hello world"}]}'
```

## Next Steps

1. Implement specific AI features:
   - Product description analysis
   - Compliance document scanning
   - Supplier matching algorithms
   - Image-based product recognition

2. Set up monitoring:
   - Azure Application Insights
   - Custom metrics for AI usage
   - Cost alerts

3. Optimize performance:
   - Implement caching for AI responses
   - Batch API calls when possible
   - Use async processing for large operations