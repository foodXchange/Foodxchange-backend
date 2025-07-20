// Example: Using Secure Configuration in FoodXchange
const secureConfig = require('./config/secure-config');

async function initializeAIServices() {
  try {
    // Load secrets
    const secrets = await secureConfig.loadSecrets();
    const endpoints = secureConfig.getEndpoints();

    // Initialize Azure OpenAI
    const { OpenAIClient, AzureKeyCredential } = require('@azure/openai');
    const openAIClient = new OpenAIClient(
      endpoints.openAI,
      new AzureKeyCredential(secrets.openAIKey)
    );

    // Initialize Text Analytics
    const { TextAnalyticsClient } = require('@azure/ai-text-analytics');
    const textAnalyticsClient = new TextAnalyticsClient(
      endpoints.textAnalytics,
      new AzureKeyCredential(secrets.textAnalyticsKey)
    );

    console.log('✅ AI services initialized successfully');

    return {
      openAI: openAIClient,
      textAnalytics: textAnalyticsClient
    };

  } catch (error) {
    console.error('Failed to initialize AI services:', error);
    throw error;
  }
}

module.exports = { initializeAIServices };
