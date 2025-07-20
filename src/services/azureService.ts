const { TextAnalyticsClient, AzureKeyCredential } = require('@azure/ai-text-analytics');
const { BlobServiceClient } = require('@azure/storage-blob');

class AzureService {
  constructor() {
    this.blobServiceClient = null;
    this.textAnalyticsClient = null;
    this.initialized = false;
    this.containerName = 'foodxchange-files';
  }

  async initialize() {
    try {
      // Initialize Blob Storage
      if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
        this.blobServiceClient = BlobServiceClient.fromConnectionString(
          process.env.AZURE_STORAGE_CONNECTION_STRING
        );

        // Create container if it doesn't exist
        const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
        await containerClient.createIfNotExists({ access: 'blob' });
      }

      // Initialize Text Analytics
      if (process.env.AZURE_TEXT_ANALYTICS_ENDPOINT && process.env.AZURE_TEXT_ANALYTICS_KEY) {
        this.textAnalyticsClient = new TextAnalyticsClient(
          process.env.AZURE_TEXT_ANALYTICS_ENDPOINT,
          new AzureKeyCredential(process.env.AZURE_TEXT_ANALYTICS_KEY)
        );
      }

      this.initialized = true;
      console.log('✅ Azure services initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize Azure services:', error);
    }
  }

  async uploadFile(fileName, fileBuffer, contentType = 'application/octet-stream') {
    if (!this.blobServiceClient) {
      throw new Error('Azure Blob Storage not initialized');
    }

    try {
      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      const blobName = `${Date.now()}-${fileName}`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
        blobHTTPHeaders: { blobContentType: contentType },
        metadata: {
          originalName: fileName,
          uploadedAt: new Date().toISOString()
        }
      });

      return {
        url: blockBlobClient.url,
        blobName,
        containerName: this.containerName
      };

    } catch (error) {
      console.error('Error uploading file to Azure:', error);
      throw error;
    }
  }

  async analyzeText(text) {
    if (!this.textAnalyticsClient) {
      return null;
    }

    try {
      const documents = [{ id: '1', text, language: 'en' }];

      const keyPhraseResults = await this.textAnalyticsClient.extractKeyPhrases(documents);
      const sentimentResults = await this.textAnalyticsClient.analyzeSentiment(documents);
      const entityResults = await this.textAnalyticsClient.recognizeEntities(documents);

      return {
        keyPhrases: keyPhraseResults[0].keyPhrases,
        sentiment: {
          overall: sentimentResults[0].sentiment,
          scores: sentimentResults[0].confidenceScores
        },
        entities: entityResults[0].entities.map(e => ({
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
}

module.exports = new AzureService();
