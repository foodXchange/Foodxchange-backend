import { OpenAIClient, AzureKeyCredential, ChatCompletions, ChatRequestMessage } from '@azure/openai';

import { trackAzureServiceCall } from '../../config/applicationInsights';
import { Logger } from '../../core/logging/logger';

const logger = new Logger('OpenAIService');

export interface SampleConversionPrediction {
  probability: number;
  factors: {
    positive: string[];
    negative: string[];
  };
  confidence: number;
  reasoning: string;
}

export interface ReorderRecommendation {
  recommendedQuantity: number;
  optimalFrequencyDays: number;
  reasoning: string;
  confidence: number;
  costSavingOpportunity?: number;
  seasonalityFactors?: string[];
}

export interface ProductMatchingSuggestion {
  score: number;
  reasoning: string;
  alternativeProducts?: Array<{
    productId: string;
    matchScore: number;
    reason: string;
  }>;
  improvements: string[];
}

export interface ComplianceAnalysis {
  complianceScore: number;
  missingRequirements: string[];
  recommendations: string[];
  riskLevel: 'low' | 'medium' | 'high';
  certificationSuggestions: string[];
}

export interface NegotiationInsights {
  recommendedStrategy: string;
  priceRange: {
    min: number;
    max: number;
    optimal: number;
  };
  keyPoints: string[];
  marketComparison: string;
  timing: string;
}

export class OpenAIService {
  private client: OpenAIClient | null = null;
  private isInitialized = false;
  private readonly deploymentId: string;

  constructor() {
    this.deploymentId = process.env.AZURE_OPENAI_DEPLOYMENT_ID || 'gpt-4-turbo';
    this.initialize();
  }

  private initialize(): void {
    try {
      const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
      const apiKey = process.env.AZURE_OPENAI_KEY;

      if (!endpoint || !apiKey) {
        logger.warn('Azure OpenAI not configured - missing endpoint or key');
        return;
      }

      this.client = new OpenAIClient(
        endpoint,
        new AzureKeyCredential(apiKey)
      );

      this.isInitialized = true;
      logger.info('✅ Azure OpenAI service initialized', { deploymentId: this.deploymentId });
    } catch (error) {
      logger.error('❌ Failed to initialize Azure OpenAI', error);
    }
  }

  private async callOpenAI(
    messages: ChatRequestMessage[],
    operation: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: 'json' | 'text';
    }
  ): Promise<string> {
    if (!this.isInitialized || !this.client) {
      throw new Error('OpenAI service not initialized');
    }

    const startTime = Date.now();
    let success = false;

    try {
      const response = await this.client.getChatCompletions(
        this.deploymentId,
        messages,
        {
          temperature: options?.temperature || 0.3,
          maxTokens: options?.maxTokens || 1000,
          ...(options?.responseFormat === 'json' && {
            responseFormat: { type: 'json_object' }
          })
        }
      );

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content received from OpenAI');
      }

      success = true;
      return content;
    } catch (error) {
      logger.error(`OpenAI ${operation} error`, error);
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      trackAzureServiceCall('OpenAI', operation, duration, success);
    }
  }

  public async predictSampleConversion(sampleData: {
    buyerHistory: {
      totalSamples: number;
      conversionRate: number;
      averageQualityScore: number;
      preferredCategories: string[];
    };
    product: {
      category: string;
      price: number;
      qualityScore: number;
      certifications: string[];
    };
    sampleInteraction: {
      requestTime: Date;
      deliveryTime?: Date;
      testingDuration?: number;
      communicationFrequency: number;
    };
    supplierProfile: {
      rating: number;
      reliabilityScore: number;
      responseTime: number;
    };
  }): Promise<SampleConversionPrediction> {
    const prompt = `
Analyze this B2B food sample data and predict the conversion probability to a purchase order.

BUYER HISTORY:
- Total samples requested: ${sampleData.buyerHistory.totalSamples}
- Historical conversion rate: ${(sampleData.buyerHistory.conversionRate * 100).toFixed(1)}%
- Average quality score: ${sampleData.buyerHistory.averageQualityScore}/10
- Preferred categories: ${sampleData.buyerHistory.preferredCategories.join(', ')}

PRODUCT DETAILS:
- Category: ${sampleData.product.category}
- Price: $${sampleData.product.price}
- Quality score: ${sampleData.product.qualityScore}/10
- Certifications: ${sampleData.product.certifications.join(', ')}

SAMPLE INTERACTION:
- Request date: ${sampleData.sampleInteraction.requestTime.toISOString()}
- Communication frequency: ${sampleData.sampleInteraction.communicationFrequency} interactions
${sampleData.sampleInteraction.testingDuration ? `- Testing duration: ${sampleData.sampleInteraction.testingDuration} days` : ''}

SUPPLIER PROFILE:
- Rating: ${sampleData.supplierProfile.rating}/5
- Reliability: ${sampleData.supplierProfile.reliabilityScore}/10
- Response time: ${sampleData.supplierProfile.responseTime} hours

Return a JSON response with:
{
  "probability": 0.XX (decimal between 0 and 1),
  "factors": {
    "positive": ["factor1", "factor2"],
    "negative": ["factor1", "factor2"]
  },
  "confidence": 0.XX (confidence in prediction),
  "reasoning": "detailed explanation"
}`;

    try {
      const messages: ChatRequestMessage[] = [
        {
          role: 'system',
          content: 'You are an AI expert in B2B food industry sales conversion prediction. Analyze data patterns and provide accurate probability assessments based on industry knowledge and data trends.'
        },
        {
          role: 'user',
          content: prompt
        }
      ];

      const response = await this.callOpenAI(messages, 'PredictSampleConversion', {
        temperature: 0.2,
        maxTokens: 800,
        responseFormat: 'json'
      });

      const result = JSON.parse(response);

      // Validate and sanitize response
      const prediction: SampleConversionPrediction = {
        probability: Math.max(0, Math.min(1, result.probability || 0.5)),
        factors: {
          positive: Array.isArray(result.factors?.positive) ? result.factors.positive : [],
          negative: Array.isArray(result.factors?.negative) ? result.factors.negative : []
        },
        confidence: Math.max(0, Math.min(1, result.confidence || 0.5)),
        reasoning: result.reasoning || 'Unable to generate detailed reasoning'
      };

      logger.info('Sample conversion prediction completed', {
        probability: prediction.probability,
        confidence: prediction.confidence,
        positiveFactors: prediction.factors.positive.length,
        negativeFactors: prediction.factors.negative.length
      });

      return prediction;
    } catch (error) {
      logger.error('Error predicting sample conversion', error);
      // Return default prediction on error
      return {
        probability: 0.5,
        factors: { positive: [], negative: ['Error in prediction'] },
        confidence: 0.3,
        reasoning: 'Error occurred during prediction analysis'
      };
    }
  }

  public async generateReorderRecommendations(
    orderHistory: Array<{
      date: Date;
      quantity: number;
      price: number;
      deliveryTime: number;
      qualityScore: number;
    }>,
    currentInventory: {
      quantity: number;
      lastRestockDate: Date;
      averageConsumption: number;
    },
    productInfo: {
      category: string;
      seasonality?: string;
      shelfLife: number;
    }
  ): Promise<ReorderRecommendation> {
    const prompt = `
Analyze B2B food order history and recommend optimal reorder quantities and timing.

ORDER HISTORY (last ${orderHistory.length} orders):
${orderHistory.map((order, i) =>
    `Order ${i+1}: ${order.date.toISOString().split('T')[0]} - ${order.quantity} units @ $${order.price} (Quality: ${order.qualityScore}/10, Delivery: ${order.deliveryTime} days)`
  ).join('\n')}

CURRENT INVENTORY:
- Current stock: ${currentInventory.quantity} units
- Last restock: ${currentInventory.lastRestockDate.toISOString().split('T')[0]}
- Average consumption: ${currentInventory.averageConsumption} units/day

PRODUCT INFO:
- Category: ${productInfo.category}
- Shelf life: ${productInfo.shelfLife} days
${productInfo.seasonality ? `- Seasonality: ${productInfo.seasonality}` : ''}

Return JSON with optimization recommendations:
{
  "recommendedQuantity": number,
  "optimalFrequencyDays": number,
  "reasoning": "detailed explanation",
  "confidence": 0.XX,
  "costSavingOpportunity": number (optional),
  "seasonalityFactors": ["factor1", "factor2"] (optional)
}`;

    try {
      const messages: ChatRequestMessage[] = [
        {
          role: 'system',
          content: 'You are an AI expert in inventory optimization and supply chain management for the food industry. Provide data-driven recommendations that minimize costs while ensuring adequate stock levels.'
        },
        {
          role: 'user',
          content: prompt
        }
      ];

      const response = await this.callOpenAI(messages, 'GenerateReorderRecommendations', {
        temperature: 0.1,
        maxTokens: 600,
        responseFormat: 'json'
      });

      const result = JSON.parse(response);

      const recommendation: ReorderRecommendation = {
        recommendedQuantity: Math.max(1, result.recommendedQuantity || 0),
        optimalFrequencyDays: Math.max(1, result.optimalFrequencyDays || 7),
        reasoning: result.reasoning || 'Unable to generate detailed reasoning',
        confidence: Math.max(0, Math.min(1, result.confidence || 0.5)),
        costSavingOpportunity: result.costSavingOpportunity,
        seasonalityFactors: Array.isArray(result.seasonalityFactors) ? result.seasonalityFactors : undefined
      };

      logger.info('Reorder recommendations generated', {
        recommendedQuantity: recommendation.recommendedQuantity,
        frequency: recommendation.optimalFrequencyDays,
        confidence: recommendation.confidence
      });

      return recommendation;
    } catch (error) {
      logger.error('Error generating reorder recommendations', error);
      return {
        recommendedQuantity: currentInventory.averageConsumption * 7,
        optimalFrequencyDays: 7,
        reasoning: 'Error occurred during analysis. Using conservative estimate.',
        confidence: 0.3
      };
    }
  }

  public async analyzeProductMatching(
    buyerRequirements: {
      category: string;
      specifications: Record<string, any>;
      budget: number;
      certifications: string[];
      qualityRequirements: string[];
    },
    supplierProduct: {
      name: string;
      category: string;
      specifications: Record<string, any>;
      price: number;
      certifications: string[];
      qualityMetrics: Record<string, number>;
    }
  ): Promise<ProductMatchingSuggestion> {
    const prompt = `
Analyze how well this supplier product matches buyer requirements in B2B food marketplace.

BUYER REQUIREMENTS:
- Category: ${buyerRequirements.category}
- Budget: $${buyerRequirements.budget}
- Required certifications: ${buyerRequirements.certifications.join(', ')}
- Quality requirements: ${buyerRequirements.qualityRequirements.join(', ')}
- Specifications: ${JSON.stringify(buyerRequirements.specifications)}

SUPPLIER PRODUCT:
- Name: ${supplierProduct.name}
- Category: ${supplierProduct.category}
- Price: $${supplierProduct.price}
- Certifications: ${supplierProduct.certifications.join(', ')}
- Quality metrics: ${JSON.stringify(supplierProduct.qualityMetrics)}
- Specifications: ${JSON.stringify(supplierProduct.specifications)}

Return JSON analysis:
{
  "score": 0.XX (0-1 match score),
  "reasoning": "detailed explanation",
  "improvements": ["suggestion1", "suggestion2"],
  "alternativeProducts": [
    {
      "productId": "alt1",
      "matchScore": 0.XX,
      "reason": "why it's better"
    }
  ]
}`;

    try {
      const messages: ChatRequestMessage[] = [
        {
          role: 'system',
          content: 'You are an AI expert in B2B food product matching and procurement. Analyze compatibility between buyer requirements and supplier offerings.'
        },
        {
          role: 'user',
          content: prompt
        }
      ];

      const response = await this.callOpenAI(messages, 'AnalyzeProductMatching', {
        temperature: 0.2,
        maxTokens: 700,
        responseFormat: 'json'
      });

      const result = JSON.parse(response);

      return {
        score: Math.max(0, Math.min(1, result.score || 0)),
        reasoning: result.reasoning || 'Unable to generate detailed analysis',
        alternativeProducts: Array.isArray(result.alternativeProducts) ? result.alternativeProducts : undefined,
        improvements: Array.isArray(result.improvements) ? result.improvements : []
      };
    } catch (error) {
      logger.error('Error analyzing product matching', error);
      return {
        score: 0.5,
        reasoning: 'Error occurred during matching analysis',
        improvements: ['Unable to analyze - please check product details']
      };
    }
  }

  public async analyzeComplianceDocuments(
    documents: Array<{
      type: string;
      content: string;
      extractedData: Record<string, any>;
    }>,
    requiredCompliance: string[]
  ): Promise<ComplianceAnalysis> {
    const prompt = `
Analyze compliance documents for B2B food trading requirements.

REQUIRED COMPLIANCE:
${requiredCompliance.map(req => `- ${req}`).join('\n')}

SUBMITTED DOCUMENTS:
${documents.map((doc, i) =>
    `Document ${i+1} (${doc.type}):\nExtracted data: ${JSON.stringify(doc.extractedData)}\nContent preview: ${doc.content.substring(0, 200)}...`
  ).join('\n\n')}

Analyze compliance gaps and provide recommendations:
{
  "complianceScore": 0.XX (0-1 compliance level),
  "missingRequirements": ["req1", "req2"],
  "recommendations": ["action1", "action2"],
  "riskLevel": "low|medium|high",
  "certificationSuggestions": ["cert1", "cert2"]
}`;

    try {
      const messages: ChatRequestMessage[] = [
        {
          role: 'system',
          content: 'You are an AI expert in food safety compliance and regulatory requirements. Analyze documents for compliance gaps and provide actionable recommendations.'
        },
        {
          role: 'user',
          content: prompt
        }
      ];

      const response = await this.callOpenAI(messages, 'AnalyzeCompliance', {
        temperature: 0.1,
        maxTokens: 800,
        responseFormat: 'json'
      });

      const result = JSON.parse(response);

      return {
        complianceScore: Math.max(0, Math.min(1, result.complianceScore || 0)),
        missingRequirements: Array.isArray(result.missingRequirements) ? result.missingRequirements : [],
        recommendations: Array.isArray(result.recommendations) ? result.recommendations : [],
        riskLevel: ['low', 'medium', 'high'].includes(result.riskLevel) ? result.riskLevel : 'medium',
        certificationSuggestions: Array.isArray(result.certificationSuggestions) ? result.certificationSuggestions : []
      };
    } catch (error) {
      logger.error('Error analyzing compliance', error);
      return {
        complianceScore: 0.5,
        missingRequirements: ['Unable to analyze compliance'],
        recommendations: ['Please review documents and resubmit'],
        riskLevel: 'high',
        certificationSuggestions: []
      };
    }
  }

  public async generateNegotiationInsights(
    negotiationContext: {
      productCategory: string;
      requestedQuantity: number;
      supplierPrice: number;
      marketPrice: number;
      buyerHistory: {
        orderVolume: number;
        relationshipDuration: number;
        paymentHistory: string;
      };
      seasonality: string;
      urgency: 'low' | 'medium' | 'high';
    }
  ): Promise<NegotiationInsights> {
    const prompt = `
Generate B2B negotiation insights for food procurement.

NEGOTIATION CONTEXT:
- Product: ${negotiationContext.productCategory}
- Quantity: ${negotiationContext.requestedQuantity} units
- Supplier price: $${negotiationContext.supplierPrice}
- Market price: $${negotiationContext.marketPrice}
- Urgency: ${negotiationContext.urgency}
- Seasonality: ${negotiationContext.seasonality}

BUYER PROFILE:
- Order volume: ${negotiationContext.buyerHistory.orderVolume} units/month
- Relationship: ${negotiationContext.buyerHistory.relationshipDuration} months
- Payment history: ${negotiationContext.buyerHistory.paymentHistory}

Provide strategic negotiation advice:
{
  "recommendedStrategy": "approach description",
  "priceRange": {
    "min": number,
    "max": number,
    "optimal": number
  },
  "keyPoints": ["point1", "point2"],
  "marketComparison": "market context",
  "timing": "best timing advice"
}`;

    try {
      const messages: ChatRequestMessage[] = [
        {
          role: 'system',
          content: 'You are an AI expert in B2B negotiation strategy and food industry pricing. Provide strategic advice for successful procurement negotiations.'
        },
        {
          role: 'user',
          content: prompt
        }
      ];

      const response = await this.callOpenAI(messages, 'GenerateNegotiationInsights', {
        temperature: 0.3,
        maxTokens: 700,
        responseFormat: 'json'
      });

      const result = JSON.parse(response);

      return {
        recommendedStrategy: result.recommendedStrategy || 'Standard negotiation approach',
        priceRange: {
          min: result.priceRange?.min || negotiationContext.supplierPrice * 0.9,
          max: result.priceRange?.max || negotiationContext.supplierPrice * 1.1,
          optimal: result.priceRange?.optimal || negotiationContext.supplierPrice
        },
        keyPoints: Array.isArray(result.keyPoints) ? result.keyPoints : [],
        marketComparison: result.marketComparison || 'Market analysis unavailable',
        timing: result.timing || 'Consider current market conditions'
      };
    } catch (error) {
      logger.error('Error generating negotiation insights', error);
      return {
        recommendedStrategy: 'Standard price negotiation based on volume and relationship',
        priceRange: {
          min: negotiationContext.supplierPrice * 0.95,
          max: negotiationContext.supplierPrice * 1.05,
          optimal: negotiationContext.supplierPrice
        },
        keyPoints: ['Volume commitment', 'Payment terms', 'Long-term relationship'],
        marketComparison: 'Unable to analyze current market conditions',
        timing: 'Negotiate based on current urgency level'
      };
    }
  }

  public getHealthStatus(): { healthy: boolean; details: Record<string, any> } {
    return {
      healthy: this.isInitialized,
      details: {
        initialized: this.isInitialized,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT ? 'configured' : 'missing',
        apiKey: process.env.AZURE_OPENAI_KEY ? 'configured' : 'missing',
        deploymentId: this.deploymentId
      }
    };
  }

  // Additional methods for AI controller compatibility
  public async generateProductInsights(productData: any): Promise<any> {
    const messages: ChatRequestMessage[] = [
      {
        role: 'system',
        content: 'You are an AI assistant specialized in food product analysis.'
      },
      {
        role: 'user',
        content: `Analyze this product and provide insights: ${JSON.stringify(productData)}`
      }
    ];

    const response = await this.callOpenAI(messages, 'generateProductInsights');
    return { insights: response, confidence: 0.85 };
  }

  public async matchProductsToRFQ(rfqData: any, products: any[]): Promise<any> {
    return this.analyzeProductMatching(rfqData, products);
  }

  public async generatePricingSuggestion(data: any): Promise<any> {
    const insights = await this.generateNegotiationInsights(data);
    return {
      suggestedPrice: insights.priceRange.optimal,
      priceRange: insights.priceRange,
      reasoning: insights.recommendedStrategy
    };
  }

  public async checkCompliance(data: any): Promise<any> {
    return this.analyzeComplianceDocuments(data);
  }

  public async generateProductDescription(productData: any): Promise<any> {
    const messages: ChatRequestMessage[] = [
      {
        role: 'system',
        content: 'You are an AI assistant specialized in writing compelling product descriptions for food products. Return a JSON object with: description (string), keyPoints (array of strings), and seoKeywords (array of strings).'
      },
      {
        role: 'user',
        content: `Generate a product description for: ${JSON.stringify(productData)}`
      }
    ];

    const response = await this.callOpenAI(messages, 'generateProductDescription', { responseFormat: 'json' });
    try {
      return JSON.parse(response);
    } catch {
      return {
        description: response,
        keyPoints: [],
        seoKeywords: []
      };
    }
  }
}

// Export singleton instance
export const openAIService = new OpenAIService();
export default openAIService;
