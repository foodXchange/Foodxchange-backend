import { ComputerVisionClient } from '@azure/cognitiveservices-computervision';
import { ApiKeyCredentials } from '@azure/ms-rest-js';

import { trackAzureServiceCall } from '../../config/applicationInsights';
import { Logger } from '../../core/logging/logger';

const logger = new Logger('ComputerVisionService');

export interface ProductImageAnalysis {
  description: string;
  confidence: number;
  tags: ImageTag[];
  dominantColors: string[];
  qualityScore: number;
  objects: DetectedObject[];
  categories: ImageCategory[];
  faces: FaceDescription[];
  adult: {
    isAdultContent: boolean;
    isRacyContent: boolean;
    adultScore: number;
    racyScore: number;
  };
  brands: DetectedBrand[];
  landmarks: DetectedLandmark[];
}

export interface ImageTag {
  name: string;
  confidence: number;
  hint?: string;
}

export interface DetectedObject {
  object: string;
  confidence: number;
  rectangle: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface ImageCategory {
  name: string;
  score: number;
  detail?: {
    celebrities?: any[];
    landmarks?: any[];
  };
}

export interface FaceDescription {
  age: number;
  gender: string;
  rectangle: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  emotions?: {
    anger: number;
    contempt: number;
    disgust: number;
    fear: number;
    happiness: number;
    neutral: number;
    sadness: number;
    surprise: number;
  };
}

export interface DetectedBrand {
  name: string;
  confidence: number;
  rectangle: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface DetectedLandmark {
  name: string;
  confidence: number;
}

export interface FoodQualityAssessment {
  overallQuality: 'excellent' | 'good' | 'fair' | 'poor';
  qualityScore: number; // 0-10
  freshness: {
    score: number;
    indicators: string[];
  };
  visual: {
    color: string[];
    texture: string;
    appearance: string;
  };
  defects: string[];
  recommendations: string[];
  confidence: number;
}

class ComputerVisionService {
  private client: ComputerVisionClient | null = null;
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    try {
      const key = process.env.AZURE_COMPUTER_VISION_KEY;
      const endpoint = process.env.AZURE_COMPUTER_VISION_ENDPOINT;

      if (!key || !endpoint) {
        logger.warn('Azure Computer Vision not configured - missing key or endpoint');
        return;
      }

      this.client = new ComputerVisionClient(
        new ApiKeyCredentials({ inHeader: { 'Ocp-Apim-Subscription-Key': key } }),
        endpoint
      );

      this.isInitialized = true;
      logger.info('✅ Azure Computer Vision service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Azure Computer Vision', error);
    }
  }

  public async analyzeProductImage(imageUrl: string): Promise<ProductImageAnalysis> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Computer Vision service not initialized');
    }

    const startTime = Date.now();
    let success = false;

    try {
      logger.info('Starting product image analysis', { imageUrl });

      const features = [
        'Categories',
        'Tags',
        'Description',
        'Color',
        'Objects',
        'Faces',
        'Adult',
        'Brands'
      ];

      const result = await this.client.analyzeImage(imageUrl, {
        visualFeatures: features as any,
        details: ['Landmarks']
      });

      const analysis: ProductImageAnalysis = {
        description: result.description?.captions?.[0]?.text || '',
        confidence: result.description?.captions?.[0]?.confidence || 0,
        tags: result.tags?.map(tag => ({
          name: tag.name || '',
          confidence: tag.confidence || 0,
          hint: tag.hint
        })) || [],
        dominantColors: result.color?.dominantColors || [],
        qualityScore: this.calculateQualityScore(result),
        objects: result.objects?.map(obj => ({
          object: obj.object || '',
          confidence: obj.confidence || 0,
          rectangle: obj.rectangle || { x: 0, y: 0, w: 0, h: 0 }
        })) || [],
        categories: result.categories?.map(cat => ({
          name: cat.name || '',
          score: cat.score || 0,
          detail: cat.detail
        })) || [],
        faces: result.faces?.map(face => ({
          age: face.age || 0,
          gender: face.gender || 'unknown',
          rectangle: {
            left: face.faceRectangle?.left || 0,
            top: face.faceRectangle?.top || 0,
            width: face.faceRectangle?.width || 0,
            height: face.faceRectangle?.height || 0
          }
        })) || [],
        adult: {
          isAdultContent: result.adult?.isAdultContent || false,
          isRacyContent: result.adult?.isRacyContent || false,
          adultScore: result.adult?.adultScore || 0,
          racyScore: result.adult?.racyScore || 0
        },
        brands: result.brands?.map(brand => ({
          name: brand.name || '',
          confidence: brand.confidence || 0,
          rectangle: brand.rectangle || { x: 0, y: 0, w: 0, h: 0 }
        })) || [],
        landmarks: result.categories?.[0]?.detail?.landmarks?.map((landmark: any) => ({
          name: landmark.name || '',
          confidence: landmark.confidence || 0
        })) || []
      };

      success = true;
      const processingTime = Date.now() - startTime;

      logger.info('Product image analysis completed', {
        description: analysis.description,
        qualityScore: analysis.qualityScore,
        tagCount: analysis.tags.length,
        objectCount: analysis.objects.length,
        processingTime
      });

      return analysis;
    } catch (error) {
      logger.error('Error analyzing product image', error, { imageUrl });
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      trackAzureServiceCall('ComputerVision', 'AnalyzeImage', duration, success);
    }
  }

  public async assessFoodQuality(imageUrl: string, productType?: string): Promise<FoodQualityAssessment> {
    const analysis = await this.analyzeProductImage(imageUrl);

    return this.generateFoodQualityAssessment(analysis, productType);
  }

  private generateFoodQualityAssessment(
    analysis: ProductImageAnalysis,
    productType?: string
  ): FoodQualityAssessment {
    let qualityScore = 10;
    const defects: string[] = [];
    const recommendations: string[] = [];
    const freshnessIndicators: string[] = [];

    // Analyze tags for quality indicators
    const qualityTags = analysis.tags.filter(tag => tag.confidence > 0.7);

    // Negative quality indicators
    const negativeIndicators = ['rotten', 'spoiled', 'moldy', 'bruised', 'damaged', 'old', 'stale'];
    const positiveIndicators = ['fresh', 'ripe', 'organic', 'healthy', 'crisp', 'bright', 'clean'];

    for (const tag of qualityTags) {
      if (negativeIndicators.some(neg => tag.name.toLowerCase().includes(neg))) {
        qualityScore -= 2;
        defects.push(`Quality concern: ${tag.name}`);
      } else if (positiveIndicators.some(pos => tag.name.toLowerCase().includes(pos))) {
        freshnessIndicators.push(tag.name);
      }
    }

    // Color analysis for freshness
    const colors = analysis.dominantColors;
    if (colors.includes('Brown') && productType !== 'bread') {
      qualityScore -= 1;
      defects.push('Browning detected');
    }
    if (colors.includes('Green') && ['apple', 'banana', 'tomato'].includes(productType || '')) {
      freshnessIndicators.push('Good color retention');
    }

    // Object detection analysis
    if (analysis.objects.length === 0) {
      qualityScore -= 1;
      recommendations.push('Image quality could be improved for better analysis');
    }

    // Check for inappropriate content
    if (analysis.adult.isAdultContent || analysis.adult.isRacyContent) {
      qualityScore = 0;
      defects.push('Inappropriate content detected');
    }

    // Image clarity and quality
    if (analysis.confidence < 0.5) {
      qualityScore -= 1;
      recommendations.push('Consider retaking photo with better lighting');
    }

    // Ensure score is within bounds
    qualityScore = Math.max(0, Math.min(10, qualityScore));

    // Determine overall quality
    let overallQuality: 'excellent' | 'good' | 'fair' | 'poor';
    if (qualityScore >= 8) overallQuality = 'excellent';
    else if (qualityScore >= 6) overallQuality = 'good';
    else if (qualityScore >= 4) overallQuality = 'fair';
    else overallQuality = 'poor';

    // Generate recommendations based on score
    if (qualityScore < 7) {
      recommendations.push('Consider quality inspection before shipment');
    }
    if (defects.length > 0) {
      recommendations.push('Address quality issues before distribution');
    }
    if (freshnessIndicators.length === 0) {
      recommendations.push('Verify product freshness');
    }

    return {
      overallQuality,
      qualityScore,
      freshness: {
        score: Math.max(0, qualityScore - defects.length),
        indicators: freshnessIndicators
      },
      visual: {
        color: colors,
        texture: this.extractTextureInfo(analysis.tags),
        appearance: analysis.description
      },
      defects,
      recommendations,
      confidence: analysis.confidence
    };
  }

  private extractTextureInfo(tags: ImageTag[]): string {
    const textureWords = ['smooth', 'rough', 'soft', 'hard', 'crisp', 'tender', 'firm', 'juicy'];
    const textureTag = tags.find(tag =>
      textureWords.some(word => tag.name.toLowerCase().includes(word))
    );
    return textureTag?.name || 'unknown';
  }

  private calculateQualityScore(analysis: any): number {
    let score = 10;

    // Description confidence
    if (!analysis.description?.captions?.[0] || analysis.description.captions[0].confidence < 0.7) {
      score -= 2;
    }

    // Check for blur or poor quality indicators
    if (analysis.categories?.some((cat: any) => cat.name.includes('blurry'))) {
      score -= 3;
    }

    // Object detection success
    if (!analysis.objects || analysis.objects.length === 0) {
      score -= 1;
    }

    // Adult content check
    if (analysis.adult?.isAdultContent || analysis.adult?.isRacyContent) {
      score -= 5;
    }

    // Tag quality and quantity
    const goodTags = analysis.tags?.filter((tag: any) => tag.confidence > 0.8) || [];
    if (goodTags.length < 3) {
      score -= 1;
    }

    return Math.max(0, Math.min(10, score));
  }

  public async extractText(imageUrl: string): Promise<{ text: string; confidence: number }> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Computer Vision service not initialized');
    }

    const startTime = Date.now();
    let success = false;

    try {
      logger.info('Starting text extraction', { imageUrl });

      // Start OCR operation
      const operation = await this.client.readInStream(
        async () => fetch(imageUrl).then(res => res.body as any)
      );

      const operationId = operation.operationLocation.split('/').pop();

      // Poll for results
      let result;
      let attempts = 0;
      const maxAttempts = 10;

      do {
        await new Promise(resolve => setTimeout(resolve, 1000));
        result = await this.client.getReadResult(operationId);
        attempts++;
      } while (result.status === 'running' && attempts < maxAttempts);

      if (result.status !== 'succeeded') {
        throw new Error(`OCR operation failed with status: ${result.status}`);
      }

      const extractedText = result.analyzeResult?.readResults
        ?.map(page => page.lines?.map(line => line.text).join(' '))
        .join(' ') || '';

      const confidence = result.analyzeResult?.readResults?.[0]?.lines?.[0]?.words?.[0]?.confidence || 0;

      success = true;

      logger.info('Text extraction completed', {
        textLength: extractedText.length,
        confidence,
        processingTime: Date.now() - startTime
      });

      return {
        text: extractedText,
        confidence
      };
    } catch (error) {
      logger.error('Error extracting text from image', error, { imageUrl });
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      trackAzureServiceCall('ComputerVision', 'ExtractText', duration, success);
    }
  }

  public async generateThumbnail(
    imageUrl: string,
    width: number = 200,
    height: number = 200,
    smartCropping: boolean = true
  ): Promise<Buffer> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Computer Vision service not initialized');
    }

    const startTime = Date.now();
    let success = false;

    try {
      logger.info('Generating thumbnail', { imageUrl, width, height, smartCropping });

      const thumbnail = await this.client.generateThumbnailInStream(
        width,
        height,
        async () => fetch(imageUrl).then(res => res.body as any),
        { smartCropping }
      );

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of thumbnail) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      success = true;

      logger.info('Thumbnail generated successfully', {
        originalUrl: imageUrl,
        thumbnailSize: buffer.length,
        dimensions: `${width}x${height}`
      });

      return buffer;
    } catch (error) {
      logger.error('Error generating thumbnail', error, { imageUrl, width, height });
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      trackAzureServiceCall('ComputerVision', 'GenerateThumbnail', duration, success);
    }
  }

  public getHealthStatus(): { healthy: boolean; details: Record<string, any> } {
    return {
      healthy: this.isInitialized,
      details: {
        initialized: this.isInitialized,
        endpoint: process.env.AZURE_COMPUTER_VISION_ENDPOINT ? 'configured' : 'missing',
        apiKey: process.env.AZURE_COMPUTER_VISION_KEY ? 'configured' : 'missing'
      }
    };
  }

  // Helper methods for FoodXchange-specific use cases
  public async analyzeSampleImages(imageUrls: string[]): Promise<ProductImageAnalysis[]> {
    const analyses = await Promise.all(
      imageUrls.map(async url => this.analyzeProductImage(url))
    );

    logger.info('Sample images analyzed', {
      imageCount: imageUrls.length,
      averageQuality: analyses.reduce((sum, a) => sum + a.qualityScore, 0) / analyses.length
    });

    return analyses;
  }

  public async assessProductPhotos(
    imageUrls: string[],
    productType: string
  ): Promise<{
    overallQuality: number;
    bestImage: string;
    assessments: Array<{ url: string; assessment: FoodQualityAssessment }>;
  }> {
    const assessments = await Promise.all(
      imageUrls.map(async url => ({
        url,
        assessment: await this.assessFoodQuality(url, productType)
      }))
    );

    const overallQuality = assessments.reduce(
      (sum, item) => sum + item.assessment.qualityScore, 0
    ) / assessments.length;

    const bestImage = assessments.reduce((best, current) =>
      current.assessment.qualityScore > best.assessment.qualityScore ? current : best
    ).url;

    return {
      overallQuality,
      bestImage,
      assessments
    };
  }
}

// Export singleton instance
export const computerVisionService = new ComputerVisionService();
export default computerVisionService;
