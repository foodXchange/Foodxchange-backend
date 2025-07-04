// Azure Configuration for FoodXchange
// Leveraging Microsoft for Startups benefits

const { BlobServiceClient } = require('@azure/storage-blob');
const { TextAnalyticsClient, AzureKeyCredential } = require('@azure/ai-text-analytics');
const { FormRecognizerClient } = require('@azure/ai-form-recognizer');

class AzureService {
  constructor() {
    this.blobServiceClient = null;
    this.textAnalyticsClient = null;
    this.formRecognizerClient = null;
    this.initialized = false;
    this.containerName = 'foodxchange-files';
  }

  // Initialize Azure services
  async initialize() {
    try {
      // Initialize Blob Storage
      this.blobServiceClient = BlobServiceClient.fromConnectionString(
        process.env.AZURE_STORAGE_CONNECTION_STRING
      );
      
      // Initialize Text Analytics (for AI features)
      this.textAnalyticsClient = new TextAnalyticsClient(
        process.env.AZURE_TEXT_ANALYTICS_ENDPOINT,
        new AzureKeyCredential(process.env.AZURE_TEXT_ANALYTICS_KEY)
      );
      
      // Initialize Form Recognizer (for document processing)
      this.formRecognizerClient = new FormRecognizerClient(
        process.env.AZURE_FORM_RECOGNIZER_ENDPOINT,
        new AzureKeyCredential(process.env.AZURE_FORM_RECOGNIZER_KEY)
      );
      
      // Create blob container if it doesn't exist
      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      await containerClient.createIfNotExists({ access: 'blob' });
      
      this.initialized = true;
      console.log('✅ Azure services initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize Azure services:', error);
      throw error;
    }
  }

  // File Upload to Azure Blob Storage
  async uploadFile(fileName, fileBuffer, contentType = 'application/octet-stream') {
    if (!this.initialized) await this.initialize();
    
    try {
      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      const blobName = `${Date.now()}-${fileName}`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      
      // Upload file with metadata
      await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
        blobHTTPHeaders: { blobContentType: contentType },
        metadata: {
          originalName: fileName,
          uploadedAt: new Date().toISOString()
        }
      });
      
      // Return the URL
      return {
        url: blockBlobClient.url,
        blobName: blobName,
        containerName: this.containerName
      };
      
    } catch (error) {
      console.error('Error uploading file to Azure:', error);
      throw error;
    }
  }

  // AI Text Analysis for Products/Companies
  async analyzeText(text, type = 'general') {
    if (!this.initialized) await this.initialize();
    
    try {
      const documents = [{ id: '1', text: text, language: 'en' }];
      
      // Extract key phrases
      const keyPhraseResults = await this.textAnalyticsClient.extractKeyPhrases(documents);
      const keyPhrases = keyPhraseResults[0].keyPhrases;
      
      // Analyze sentiment
      const sentimentResults = await this.textAnalyticsClient.analyzeSentiment(documents);
      const sentiment = sentimentResults[0];
      
      // Recognize entities
      const entityResults = await this.textAnalyticsClient.recognizeEntities(documents);
      const entities = entityResults[0].entities;
      
      return {
        keyPhrases,
        sentiment: {
          overall: sentiment.sentiment,
          scores: sentiment.confidenceScores
        },
        entities: entities.map(e => ({
          text: e.text,
          category: e.category,
          confidence: e.confidenceScore
        }))
      };
      
    } catch (error) {
      console.error('Error analyzing text:', error);
      return null;
    }
  }

  // Document Processing (for invoices, certificates, etc.)
  async processDocument(documentUrl) {
    if (!this.initialized) await this.initialize();
    
    try {
      const poller = await this.formRecognizerClient.beginRecognizeContentFromUrl(documentUrl);
      const results = await poller.pollUntilDone();
      
      const extractedData = {
        text: '',
        tables: [],
        keyValuePairs: []
      };
      
      // Extract text and structure
      for (const page of results) {
        // Extract text
        for (const line of page.lines) {
          extractedData.text += line.text + '\n';
        }
        
        // Extract tables
        for (const table of page.tables || []) {
          const tableData = {
            rows: table.rowCount,
            columns: table.columnCount,
            cells: table.cells.map(cell => ({
              text: cell.text,
              rowIndex: cell.rowIndex,
              columnIndex: cell.columnIndex
            }))
          };
          extractedData.tables.push(tableData);
        }
      }
      
      return extractedData;
      
    } catch (error) {
      console.error('Error processing document:', error);
      return null;
    }
  }

  // Generate embeddings for similarity search
  async generateEmbeddings(text) {
    // This would use Azure OpenAI embeddings API
    // For now, return a placeholder
    return Array(384).fill(0).map(() => Math.random() - 0.5);
  }

  // Delete file from Azure Blob Storage
  async deleteFile(blobName) {
    if (!this.initialized) await this.initialize();
    
    try {
      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();
      
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }
}

// MongoDB Atlas Configuration
const mongoConfig = {
  // Using MongoDB Atlas with $5,000 credit from Founders Hub
  uri: process.env.MONGODB_URI || 'mongodb+srv://username:password@cluster.mongodb.net/foodxchange',
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 50,
    wtimeoutMS: 2500,
    retryWrites: true,
    retryReads: true,
    // Enable compression for better performance
    compressors: ['snappy', 'zlib'],
    // Read preference for scaling
    readPreference: 'secondaryPreferred'
  }
};

// Environment Variables Template
const envTemplate = {
  // MongoDB Atlas
  MONGODB_URI: 'mongodb+srv://username:password@cluster.mongodb.net/foodxchange',
  
  // Azure Storage
  AZURE_STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net',
  
  // Azure AI Services
  AZURE_TEXT_ANALYTICS_ENDPOINT: 'https://your-resource.cognitiveservices.azure.com/',
  AZURE_TEXT_ANALYTICS_KEY: 'your-text-analytics-key',
  AZURE_FORM_RECOGNIZER_ENDPOINT: 'https://your-resource.cognitiveservices.azure.com/',
  AZURE_FORM_RECOGNIZER_KEY: 'your-form-recognizer-key',
  
  // Azure OpenAI (for advanced AI features)
  AZURE_OPENAI_ENDPOINT: 'https://your-resource.openai.azure.com/',
  AZURE_OPENAI_KEY: 'your-openai-key',
  AZURE_OPENAI_DEPLOYMENT: 'gpt-35-turbo',
  
  // Application Settings
  NODE_ENV: 'development',
  PORT: 5000,
  JWT_SECRET: 'your-super-secret-jwt-key',
  JWT_REFRESH_SECRET: 'your-refresh-secret-key',
  
  // Email Service (using Azure Communication Services)
  AZURE_COMMUNICATION_CONNECTION_STRING: 'endpoint=https://...;accesskey=...',
  
  // Redis Cache (Azure Cache for Redis)
  REDIS_URL: 'redis://username:password@your-cache.redis.cache.windows.net:6380',
  
  // Application Insights (monitoring)
  APPINSIGHTS_INSTRUMENTATIONKEY: 'your-instrumentation-key'
};

module.exports = {
  AzureService,
  mongoConfig,
  envTemplate
};
