/**
 * Enterprise-grade Azure AI Service Integration
 * Provides unified interface for all Azure Cognitive Services
 */

import { DocumentAnalysisClient } from '@azure/ai-form-recognizer';
import { TextAnalyticsClient, AzureKeyCredential } from '@azure/ai-text-analytics';
import { ComputerVisionClient } from '@azure/cognitiveservices-computervision';
import { ApiKeyCredentials } from '@azure/ms-rest-js';
import { OpenAIClient } from '@azure/openai';

import { config, isAzureAIConfigured } from '../../../core/config';
import { ExternalServiceError } from '../../../core/errors';
import { Logger } from '../../../core/logging/logger';
import { CacheService } from '../../cache/CacheService';
import { MetricsService } from '../../monitoring/MetricsService';

const logger = new Logger('AzureAIService');

// Service configuration interfaces
interface AIServiceConfig {
  endpoint: string;
  key: string;
  retryAttempts?: number;
  timeout?: number;
}

interface AnalysisOptions {
  language?: string;
  includeStatistics?: boolean;
  modelVersion?: string;
  cache?: boolean;
  cacheExpiry?: number;
}

// Result interfaces
export interface TextAnalysisResult {
  sentiment: {
    overall: 'positive' | 'negative' | 'neutral' | 'mixed';
    scores: {
      positive: number;
      negative: number;
      neutral: number;
    };
  };
  keyPhrases: string[];
  entities: Array<{
    text: string;
    category: string;
    confidence: number;
    offset: number;
    length: number;
  }>;
  language: {
    name: string;
    iso6391Name: string;
    confidence: number;
  };
}

export interface ImageAnalysisResult {
  categories: Array<{
    name: string;
    score: number;
  }>;
  tags: Array<{
    name: string;
    confidence: number;
  }>;
  description: {
    captions: Array<{
      text: string;
      confidence: number;
    }>;
  };
  objects: Array<{
    rectangle: { x: number; y: number; w: number; h: number };
    object: string;
    confidence: number;
  }>;
  metadata: {
    width: number;
    height: number;
    format: string;
  };
}

export interface DocumentAnalysisResult {
  documentType: string;
  fields: Record<string, any>;
  pages: number;
  tables: Array<{
    rowCount: number;
    columnCount: number;
    cells: Array<{
      text: string;
      rowIndex: number;
      columnIndex: number;
    }>;
  }>;
  keyValuePairs: Array<{
    key: string;
    value: string;
    confidence: number;
  }>;
}

export interface AIGenerationResult {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

// Main Azure AI Service class
export class AzureAIService {
  private static instance: AzureAIService;

  private textAnalyticsClient?: TextAnalyticsClient;
  private computerVisionClient?: ComputerVisionClient;
  private documentAnalysisClient?: DocumentAnalysisClient;
  private openAIClient?: OpenAIClient;

  private readonly cache: CacheService;
  private readonly metrics: MetricsService;
  private initialized = false;

  private constructor() {
    this.cache = cacheService;
    this.metrics = metricsService;
  }

  public static getInstance(): AzureAIService {
    if (!AzureAIService.instance) {
      AzureAIService.instance = new AzureAIService();
    }
    return AzureAIService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    const aiConfig = config.azure.ai;

    try {
      // Initialize Text Analytics
      if (aiConfig.textAnalytics.endpoint && aiConfig.textAnalytics.key) {
        this.textAnalyticsClient = new TextAnalyticsClient(
          aiConfig.textAnalytics.endpoint,
          new AzureKeyCredential(aiConfig.textAnalytics.key)
        );
        logger.info('Text Analytics client initialized');
      }

      // Initialize Computer Vision
      if (aiConfig.computerVision.endpoint && aiConfig.computerVision.key) {
        this.computerVisionClient = new ComputerVisionClient(
          new ApiKeyCredentials({ inHeader: { 'Ocp-Apim-Subscription-Key': aiConfig.computerVision.key } }),
          aiConfig.computerVision.endpoint
        );
        logger.info('Computer Vision client initialized');
      }

      // Initialize Form Recognizer
      if (aiConfig.formRecognizer.endpoint && aiConfig.formRecognizer.key) {
        this.documentAnalysisClient = new DocumentAnalysisClient(
          aiConfig.formRecognizer.endpoint,
          new AzureKeyCredential(aiConfig.formRecognizer.key)
        );
        logger.info('Form Recognizer client initialized');
      }

      // Initialize OpenAI
      if (aiConfig.openAI.endpoint && aiConfig.openAI.key) {
        this.openAIClient = new OpenAIClient(
          aiConfig.openAI.endpoint,
          new AzureKeyCredential(aiConfig.openAI.key)
        );
        logger.info('OpenAI client initialized');
      }

      this.initialized = true;
      logger.info('Azure AI Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Azure AI Service', error);
      throw new ExternalServiceError('Azure AI', 'Failed to initialize service', error as Error);
    }
  }

  // Text Analysis Methods
  public async analyzeText(
    text: string,
    options: AnalysisOptions = {}
  ): Promise<TextAnalysisResult> {
    if (!this.textAnalyticsClient) {
      throw new ExternalServiceError('Azure AI', 'Text Analytics not configured');
    }

    const cacheKey = `text-analysis:${this.hashText(text)}:${JSON.stringify(options)}`;

    // Check cache if enabled
    if (options.cache) {
      const cached = await this.cache.get<TextAnalysisResult>(cacheKey);
      if (cached) {
        this.metrics.recordCacheHit('text-analysis');
        return cached;
      }
    }

    const startTime = Date.now();
    const contextLogger = logger.child('analyzeText');

    try {
      const documents = [{
        id: '1',
        text,
        language: options.language || 'en'
      }];

      // Perform parallel analysis
      const [sentimentResults, keyPhraseResults, entityResults] = await Promise.all([
        this.textAnalyticsClient.analyzeSentiment(documents, {
          includeStatistics: options.includeStatistics,
          modelVersion: options.modelVersion
        }),
        this.textAnalyticsClient.extractKeyPhrases(documents, {
          includeStatistics: options.includeStatistics,
          modelVersion: options.modelVersion
        }),
        this.textAnalyticsClient.recognizeEntities(documents, {
          includeStatistics: options.includeStatistics,
          modelVersion: options.modelVersion
        })
      ]);

      const sentiment = sentimentResults[0];
      const keyPhrases = keyPhraseResults[0];
      const entities = entityResults[0];

      if (sentiment.error || keyPhrases.error || entities.error) {
        throw new Error('Text analysis failed');
      }

      const result: TextAnalysisResult = {
        sentiment: {
          overall: sentiment.sentiment as any,
          scores: sentiment.confidenceScores
        },
        keyPhrases: keyPhrases.keyPhrases,
        entities: entities.entities.map(e => ({
          text: e.text,
          category: e.category,
          confidence: e.confidenceScore,
          offset: e.offset,
          length: e.length
        })),
        language: {
          name: documents[0].language,
          iso6391Name: documents[0].language,
          confidence: 1.0
        }
      };

      // Cache result if enabled
      if (options.cache) {
        await this.cache.set(cacheKey, result, options.cacheExpiry || 3600);
      }

      const duration = Date.now() - startTime;
      this.metrics.recordAPICall('text-analytics', duration, true);
      contextLogger.info('Text analysis completed', { duration });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.recordAPICall('text-analytics', duration, false);
      contextLogger.error('Text analysis failed', error);
      throw new ExternalServiceError('Azure Text Analytics', 'Analysis failed', error as Error);
    }
  }

  // Image Analysis Methods
  public async analyzeImage(
    imageUrl: string,
    options: AnalysisOptions = {}
  ): Promise<ImageAnalysisResult> {
    if (!this.computerVisionClient) {
      throw new ExternalServiceError('Azure AI', 'Computer Vision not configured');
    }

    const cacheKey = `image-analysis:${imageUrl}:${JSON.stringify(options)}`;

    if (options.cache) {
      const cached = await this.cache.get<ImageAnalysisResult>(cacheKey);
      if (cached) {
        this.metrics.recordCacheHit('image-analysis');
        return cached;
      }
    }

    const startTime = Date.now();
    const contextLogger = logger.child('analyzeImage');

    try {
      const visualFeatures = [
        'Categories',
        'Tags',
        'Description',
        'Objects',
        'ImageType'
      ];

      const analysis = await this.computerVisionClient.analyzeImage(
        imageUrl,
        { visualFeatures }
      );

      const result: ImageAnalysisResult = {
        categories: analysis.categories || [],
        tags: analysis.tags || [],
        description: analysis.description || { captions: [] },
        objects: analysis.objects || [],
        metadata: {
          width: analysis.metadata?.width || 0,
          height: analysis.metadata?.height || 0,
          format: analysis.metadata?.format || 'unknown'
        }
      };

      if (options.cache) {
        await this.cache.set(cacheKey, result, options.cacheExpiry || 3600);
      }

      const duration = Date.now() - startTime;
      this.metrics.recordAPICall('computer-vision', duration, true);
      contextLogger.info('Image analysis completed', { duration });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.recordAPICall('computer-vision', duration, false);
      contextLogger.error('Image analysis failed', error);
      throw new ExternalServiceError('Azure Computer Vision', 'Analysis failed', error as Error);
    }
  }

  // Document Analysis Methods
  public async analyzeDocument(
    documentUrl: string,
    documentType: string = 'prebuilt-document',
    options: AnalysisOptions = {}
  ): Promise<DocumentAnalysisResult> {
    if (!this.documentAnalysisClient) {
      throw new ExternalServiceError('Azure AI', 'Form Recognizer not configured');
    }

    const startTime = Date.now();
    const contextLogger = logger.child('analyzeDocument');

    try {
      const poller = await this.documentAnalysisClient.beginAnalyzeDocumentFromUrl(
        documentType,
        documentUrl
      );

      const result = await poller.pollUntilDone();

      const analysis: DocumentAnalysisResult = {
        documentType: result.modelId,
        fields: result.documents?.[0]?.fields || {},
        pages: result.pages?.length || 0,
        tables: result.tables?.map(table => ({
          rowCount: table.rowCount,
          columnCount: table.columnCount,
          cells: table.cells.map(cell => ({
            text: cell.content,
            rowIndex: cell.rowIndex,
            columnIndex: cell.columnIndex
          }))
        })) || [],
        keyValuePairs: result.keyValuePairs?.map(kv => ({
          key: kv.key.content,
          value: kv.value?.content || '',
          confidence: kv.confidence
        })) || []
      };

      const duration = Date.now() - startTime;
      this.metrics.recordAPICall('form-recognizer', duration, true);
      contextLogger.info('Document analysis completed', { duration });

      return analysis;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.recordAPICall('form-recognizer', duration, false);
      contextLogger.error('Document analysis failed', error);
      throw new ExternalServiceError('Azure Form Recognizer', 'Analysis failed', error as Error);
    }
  }

  // AI Generation Methods
  public async generateText(
    prompt: string,
    options: {
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      frequencyPenalty?: number;
      presencePenalty?: number;
      stop?: string[];
    } = {}
  ): Promise<AIGenerationResult> {
    if (!this.openAIClient || !config.azure.ai.openAI.deploymentName) {
      throw new ExternalServiceError('Azure AI', 'OpenAI not configured');
    }

    const startTime = Date.now();
    const contextLogger = logger.child('generateText');

    try {
      const response = await this.openAIClient.getCompletions(
        config.azure.ai.openAI.deploymentName,
        {
          prompt,
          maxTokens: options.maxTokens || 150,
          temperature: options.temperature || 0.7,
          topP: options.topP || 1,
          frequencyPenalty: options.frequencyPenalty || 0,
          presencePenalty: options.presencePenalty || 0,
          stop: options.stop
        }
      );

      const choice = response.choices[0];
      const result: AIGenerationResult = {
        text: choice.text.trim(),
        usage: {
          promptTokens: response.usage?.promptTokens || 0,
          completionTokens: response.usage?.completionTokens || 0,
          totalTokens: response.usage?.totalTokens || 0
        },
        finishReason: choice.finishReason || 'unknown'
      };

      const duration = Date.now() - startTime;
      this.metrics.recordAPICall('openai', duration, true);
      contextLogger.info('Text generation completed', { duration, tokens: result.usage.totalTokens });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.recordAPICall('openai', duration, false);
      contextLogger.error('Text generation failed', error);
      throw new ExternalServiceError('Azure OpenAI', 'Generation failed', error as Error);
    }
  }

  // Utility methods
  private hashText(text: string): string {
    // Simple hash function for caching
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  // Health check
  public async healthCheck(): Promise<{
    healthy: boolean;
    services: Record<string, boolean>;
  }> {
    const services: Record<string, boolean> = {
      textAnalytics: !!this.textAnalyticsClient,
      computerVision: !!this.computerVisionClient,
      formRecognizer: !!this.documentAnalysisClient,
      openAI: !!this.openAIClient
    };

    const healthy = Object.values(services).some(v => v);

    return { healthy, services };
  }
}

// Export singleton instance
export default AzureAIService.getInstance();
