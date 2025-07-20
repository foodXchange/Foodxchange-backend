const { FormRecognizerClient } = require('@azure/ai-form-recognizer');
const { TextAnalyticsClient, AzureKeyCredential } = require('@azure/ai-text-analytics');
const { ComputerVisionClient } = require('@azure/cognitiveservices-computervision');
const { SearchClient } = require('@azure/search-documents');

class AzureAIService {
  constructor() {
    this.textAnalyticsClient = null;
    this.visionClient = null;
    this.formRecognizerClient = null;
    this.searchClient = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      // Initialize Text Analytics
      if (process.env.AZURE_TEXT_ANALYTICS_ENDPOINT && process.env.AZURE_TEXT_ANALYTICS_KEY) {
        this.textAnalyticsClient = new TextAnalyticsClient(
          process.env.AZURE_TEXT_ANALYTICS_ENDPOINT,
          new AzureKeyCredential(process.env.AZURE_TEXT_ANALYTICS_KEY)
        );
      }

      // Initialize Computer Vision
      if (process.env.AZURE_VISION_ENDPOINT && process.env.AZURE_VISION_KEY) {
        this.visionClient = new ComputerVisionClient(
          new AzureKeyCredential(process.env.AZURE_VISION_KEY),
          process.env.AZURE_VISION_ENDPOINT
        );
      }

      // Initialize Form Recognizer
      if (process.env.AZURE_FORM_RECOGNIZER_ENDPOINT && process.env.AZURE_FORM_RECOGNIZER_KEY) {
        this.formRecognizerClient = new FormRecognizerClient(
          process.env.AZURE_FORM_RECOGNIZER_ENDPOINT,
          new AzureKeyCredential(process.env.AZURE_FORM_RECOGNIZER_KEY)
        );
      }

      // Initialize Cognitive Search
      if (process.env.AZURE_SEARCH_ENDPOINT && process.env.AZURE_SEARCH_KEY) {
        this.searchClient = new SearchClient(
          process.env.AZURE_SEARCH_ENDPOINT,
          'foodxchange-index',
          new AzureKeyCredential(process.env.AZURE_SEARCH_KEY)
        );
      }

      this.initialized = true;
      console.log('✅ Azure AI Services initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize Azure AI services:', error);
      throw error;
    }
  }

  isInitialized() {
    return this.initialized;
  }

  getTextAnalyticsClient() {
    if (!this.textAnalyticsClient) {
      throw new Error('Text Analytics client not initialized');
    }
    return this.textAnalyticsClient;
  }

  getVisionClient() {
    if (!this.visionClient) {
      throw new Error('Computer Vision client not initialized');
    }
    return this.visionClient;
  }

  getFormRecognizerClient() {
    if (!this.formRecognizerClient) {
      throw new Error('Form Recognizer client not initialized');
    }
    return this.formRecognizerClient;
  }

  getSearchClient() {
    if (!this.searchClient) {
      throw new Error('Search client not initialized');
    }
    return this.searchClient;
  }
}

// Export singleton instance
const aiService = new AzureAIService();
module.exports = aiService;
