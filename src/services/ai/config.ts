// Main AI Configuration for FoodXchange
const secureConfig = require('../config/secure-config');

class AIConfiguration {
  constructor() {
    this.initialized = false;
    this.services = {};
    this.config = {
      openAI: {
        deploymentName: 'gpt-4-turbo',
        apiVersion: '2024-02-01',
        temperature: 0.7,
        maxTokens: 2000
      },
      textAnalytics: {
        apiVersion: '2023-04-01'
      },
      formRecognizer: {
        apiVersion: '2023-07-31'
      },
      search: {
        apiVersion: '2023-11-01',
        indexName: 'foodxchange-products'
      }
    };
  }

  async initialize() {
    if (this.initialized) {
      return this.services;
    }

    try {
      console.log('🔄 Initializing AI services...');

      // Load secrets
      const secrets = await secureConfig.loadSecrets();
      const endpoints = secureConfig.getEndpoints();

      // Initialize services
      this.services = {
        openAI: await this.initOpenAI(endpoints.openAI, secrets.openAIKey),
        textAnalytics: await this.initTextAnalytics(endpoints.textAnalytics, secrets.textAnalyticsKey),
        formRecognizer: await this.initFormRecognizer(endpoints.formRecognizer, secrets.formRecognizerKey),
        search: await this.initSearch(endpoints.search, secrets.searchKey)
      };

      this.initialized = true;
      console.log('✅ AI services initialized successfully');

      return this.services;

    } catch (error) {
      console.error('❌ Failed to initialize AI services:', error);
      throw error;
    }
  }

  async initOpenAI(endpoint, key) {
    if (!endpoint || !key) {
      console.warn('⚠️  OpenAI credentials not configured');
      return null;
    }

    const { OpenAIClient, AzureKeyCredential } = require('@azure/openai');
    return new OpenAIClient(endpoint, new AzureKeyCredential(key));
  }

  async initTextAnalytics(endpoint, key) {
    if (!endpoint || !key) {
      console.warn('⚠️  Text Analytics credentials not configured');
      return null;
    }

    const { TextAnalyticsClient, AzureKeyCredential } = require('@azure/ai-text-analytics');
    return new TextAnalyticsClient(endpoint, new AzureKeyCredential(key));
  }

  async initFormRecognizer(endpoint, key) {
    if (!endpoint || !key) {
      console.warn('⚠️  Form Recognizer credentials not configured');
      return null;
    }

    const { DocumentAnalysisClient, AzureKeyCredential } = require('@azure/ai-form-recognizer');
    return new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));
  }

  async initSearch(endpoint, key) {
    if (!endpoint || !key) {
      console.warn('⚠️  Search credentials not configured');
      return null;
    }

    const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
    return new SearchClient(
      endpoint,
      this.config.search.indexName,
      new AzureKeyCredential(key)
    );
  }
}

module.exports = new AIConfiguration();
