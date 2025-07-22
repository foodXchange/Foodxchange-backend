import aiService from './azureAIService';

class ProductAnalysisService {
  constructor() {
    this.aiService = aiService;
  }

  async analyzeProduct(product) {
    try {
      const analysis = {
        productId: product._id || product.id,
        productName: product.name,
        textAnalysis: null,
        imageAnalysis: [],
        qualityAssessment: {},
        enhancedDescription: '',
        complianceFlags: []
      };

      // Analyze product description with Text Analytics
      if (product.description) {
        analysis.textAnalysis = await this.analyzeProductText(product.description);
      }

      // Analyze product images with Computer Vision
      if (product.imageUrls && product.imageUrls.length > 0) {
        for (const imageUrl of product.imageUrls.slice(0, 3)) { // Limit to 3 images
          const imageAnalysis = await this.analyzeProductImage(imageUrl);
          if (imageAnalysis) {
            analysis.imageAnalysis.push(imageAnalysis);
          }
        }
      }

      // Generate quality assessment
      analysis.qualityAssessment = this.assessProductQuality(
        analysis.textAnalysis,
        analysis.imageAnalysis
      );

      // Generate enhanced description
      analysis.enhancedDescription = this.generateEnhancedDescription(
        product,
        analysis.textAnalysis,
        analysis.imageAnalysis
      );

      // Check compliance requirements
      analysis.complianceFlags = this.checkCompliance(
        analysis.textAnalysis,
        product
      );

      return analysis;

    } catch (error) {
      console.error('Error analyzing product:', error);
      throw error;
    }
  }

  async analyzeProductText(description) {
    try {
      const textClient = this.aiService.getTextAnalyticsClient();
      const documents = [{ id: '1', text: description, language: 'en' }];

      // Extract key phrases
      const keyPhraseResults = await textClient.extractKeyPhrases(documents);
      const {keyPhrases} = keyPhraseResults[0];

      // Analyze sentiment
      const sentimentResults = await textClient.analyzeSentiment(documents);
      const sentiment = sentimentResults[0];

      // Recognize entities
      const entityResults = await textClient.recognizeEntities(documents);
      const {entities} = entityResults[0];

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
        })),
        extractedAttributes: this.extractProductAttributes(keyPhrases, entities)
      };

    } catch (error) {
      console.error('Error analyzing product text:', error);
      return null;
    }
  }

  async analyzeProductImage(imageUrl) {
    try {
      const visionClient = this.aiService.getVisionClient();

      // Analyze image for tags, description, and objects
      const analysisResult = await visionClient.analyzeImage(imageUrl, {
        visualFeatures: ['Tags', 'Description', 'Objects', 'Color', 'Categories']
      });

      return {
        imageUrl,
        tags: analysisResult.tags
          .filter(tag => tag.confidence > 0.7)
          .map(tag => ({
            name: tag.name,
            confidence: tag.confidence
          })),
        description: analysisResult.description.captions[0]?.text || '',
        objects: analysisResult.objects.map(obj => ({
          object: obj.object,
          confidence: obj.confidence,
          rectangle: obj.rectangle
        })),
        colors: {
          dominantColors: analysisResult.color.dominantColors,
          accentColor: analysisResult.color.accentColor,
          isBwImg: analysisResult.color.isBwImg
        },
        categories: analysisResult.categories.map(cat => ({
          name: cat.name,
          score: cat.score
        }))
      };

    } catch (error) {
      console.error('Error analyzing product image:', error);
      return null;
    }
  }

  extractProductAttributes(keyPhrases, entities) {
    const attributes = {};

    // Extract weight/volume information
    const weightRegex = /(\d+(?:\.\d+)?)\s*(kg|g|lb|oz|ml|l|gallon)/gi;
    const weightMatches = keyPhrases.join(' ').match(weightRegex);
    if (weightMatches) {
      attributes.weight = weightMatches[0];
    }

    // Extract packaging information
    const packagingTerms = ['bottle', 'can', 'box', 'bag', 'jar', 'container', 'pack'];
    const packaging = keyPhrases.filter(phrase =>
      packagingTerms.some(term => phrase.toLowerCase().includes(term))
    );
    if (packaging.length > 0) {
      attributes.packaging = packaging;
    }

    // Extract dietary attributes
    const dietaryTerms = ['organic', 'kosher', 'halal', 'vegan', 'vegetarian', 'gluten-free', 'non-gmo'];
    const dietaryAttributes = keyPhrases.filter(phrase =>
      dietaryTerms.some(term => phrase.toLowerCase().includes(term))
    );
    if (dietaryAttributes.length > 0) {
      attributes.dietary = dietaryAttributes;
    }

    // Extract brand information from entities
    const brands = entities.filter(entity => entity.category === 'Organization');
    if (brands.length > 0) {
      attributes.brands = brands.map(brand => brand.text);
    }

    return attributes;
  }

  assessProductQuality(textAnalysis, imageAnalyses) {
    let qualityScore = 0;
    const qualityFactors = [];

    // Text analysis quality indicators
    if (textAnalysis) {
      if (textAnalysis.sentiment.overall === 'positive') {
        qualityScore += 0.3;
        qualityFactors.push('Positive description sentiment');
      }

      if (textAnalysis.keyPhrases.some(phrase =>
        ['premium', 'high-quality', 'excellent', 'superior'].some(term =>
          phrase.toLowerCase().includes(term)
        )
      )) {
        qualityScore += 0.2;
        qualityFactors.push('Quality-related terms in description');
      }
    }

    // Image analysis quality indicators
    if (imageAnalyses && imageAnalyses.length > 0) {
      const avgTagConfidence = imageAnalyses
        .flatMap(img => img.tags)
        .reduce((sum, tag) => sum + tag.confidence, 0) /
        imageAnalyses.flatMap(img => img.tags).length;

      if (avgTagConfidence > 0.8) {
        qualityScore += 0.3;
        qualityFactors.push('High image recognition confidence');
      }

      // Check for freshness indicators
      const allTags = imageAnalyses.flatMap(img => img.tags.map(tag => tag.name));
      const freshnessIndicators = ['fresh', 'ripe', 'colorful', 'vibrant', 'green'];
      const hasPositiveIndicators = freshnessIndicators.some(indicator =>
        allTags.some(tag => tag.toLowerCase().includes(indicator))
      );

      if (hasPositiveIndicators) {
        qualityScore += 0.2;
        qualityFactors.push('Visual freshness indicators detected');
      }
    }

    return {
      overallQuality: qualityScore > 0.8 ? 'Excellent' :
        qualityScore > 0.6 ? 'Good' :
          qualityScore > 0.4 ? 'Fair' : 'Poor',
      qualityScore: Math.round(qualityScore * 100) / 100,
      factors: qualityFactors,
      imageCount: imageAnalyses ? imageAnalyses.length : 0
    };
  }

  generateEnhancedDescription(product, textAnalysis, imageAnalyses) {
    const enhancedElements = [product.description];

    // Add insights from text analysis
    if (textAnalysis?.extractedAttributes) {
      const attributes = textAnalysis.extractedAttributes;

      if (attributes.weight) {
        enhancedElements.push(`Package size: ${attributes.weight}`);
      }

      if (attributes.dietary && attributes.dietary.length > 0) {
        enhancedElements.push(`Dietary features: ${attributes.dietary.join(', ')}`);
      }
    }

    // Add insights from image analysis
    if (imageAnalyses && imageAnalyses.length > 0) {
      const commonTags = imageAnalyses
        .flatMap(img => img.tags)
        .filter(tag => tag.confidence > 0.8)
        .map(tag => tag.name)
        .slice(0, 5);

      if (commonTags.length > 0) {
        enhancedElements.push(`Visual characteristics: ${commonTags.join(', ')}`);
      }
    }

    return enhancedElements.filter(Boolean).join('. ');
  }

  checkCompliance(textAnalysis, product) {
    const complianceFlags = [];

    if (textAnalysis) {
      // Check for certification claims
      const certificationTerms = ['organic', 'kosher', 'halal', 'fda', 'usda', 'certified'];
      const hasCertificationClaims = textAnalysis.keyPhrases.some(phrase =>
        certificationTerms.some(term => phrase.toLowerCase().includes(term))
      );

      if (hasCertificationClaims) {
        complianceFlags.push({
          type: 'certification_claim',
          message: 'Product claims certifications - verify documentation',
          severity: 'medium'
        });
      }

      // Check for nutritional claims
      const nutritionalTerms = ['low-fat', 'sugar-free', 'low-sodium', 'high-protein'];
      const hasNutritionalClaims = textAnalysis.keyPhrases.some(phrase =>
        nutritionalTerms.some(term => phrase.toLowerCase().includes(term))
      );

      if (hasNutritionalClaims) {
        complianceFlags.push({
          type: 'nutritional_claim',
          message: 'Product makes nutritional claims - verify with lab analysis',
          severity: 'high'
        });
      }
    }

    return complianceFlags;
  }
}

export default new ProductAnalysisService();
