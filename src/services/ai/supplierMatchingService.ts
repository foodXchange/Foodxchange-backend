const aiService = require('./azureAIService');

class SupplierMatchingService {
  constructor() {
    this.aiService = aiService;
  }

  async analyzeRFQ(rfqText) {
    try {
      const textClient = this.aiService.getTextAnalyticsClient();

      const documents = [{
        id: '1',
        text: rfqText,
        language: 'en'
      }];

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
        requirements: this.extractRequirements(keyPhrases, entities)
      };

    } catch (error) {
      console.error('Error analyzing RFQ:', error);
      throw error;
    }
  }

  extractRequirements(keyPhrases, entities) {
    const requirements = {
      products: [],
      quantities: [],
      locations: [],
      certifications: [],
      qualityTerms: []
    };

    // Extract products from entities
    const productEntities = entities.filter(e =>
      e.category === 'Product' || e.category === 'Other'
    );
    requirements.products = productEntities.map(e => e.text);

    // Extract locations
    const locationEntities = entities.filter(e => e.category === 'Location');
    requirements.locations = locationEntities.map(e => e.text);

    // Extract quantities from key phrases
    const quantityPattern = /\d+\s*(kg|ton|tonnes|lb|pounds|cases|boxes|units)/gi;
    requirements.quantities = keyPhrases.filter(phrase =>
      quantityPattern.test(phrase)
    );

    // Extract certifications and quality terms
    const certificationTerms = [
      'organic', 'kosher', 'halal', 'haccp', 'fda', 'eu', 'certified',
      'premium', 'grade', 'dop', 'brc', 'iso'
    ];

    requirements.certifications = keyPhrases.filter(phrase => {
      const lowerPhrase = phrase.toLowerCase();
      return certificationTerms.some(term => lowerPhrase.includes(term));
    });

    // Extract quality terms
    const qualityTerms = [
      'premium', 'high-quality', 'fresh', 'grade-a', 'top-quality',
      'excellent', 'superior', 'finest', 'best'
    ];

    requirements.qualityTerms = keyPhrases.filter(phrase => {
      const lowerPhrase = phrase.toLowerCase();
      return qualityTerms.some(term => lowerPhrase.includes(term));
    });

    return requirements;
  }

  async findMatchingSuppliers(rfqAnalysis, suppliers) {
    const matchedSuppliers = [];

    for (const supplier of suppliers) {
      const matchScore = this.calculateMatchScore(supplier, rfqAnalysis);

      if (matchScore.totalScore > 0.3) { // Minimum relevance threshold
        matchedSuppliers.push({
          supplier,
          matchScore: matchScore.totalScore,
          matchDetails: matchScore.details,
          reasoning: matchScore.reasoning
        });
      }
    }

    // Sort by match score descending
    return matchedSuppliers.sort((a, b) => b.matchScore - a.matchScore);
  }

  calculateMatchScore(supplier, rfqAnalysis) {
    const score = {
      productMatch: 0,
      locationMatch: 0,
      certificationMatch: 0,
      qualityMatch: 0,
      totalScore: 0,
      reasoning: []
    };

    // Product matching
    const productMatches = [];
    rfqAnalysis.requirements.products.forEach(reqProduct => {
      if (supplier.products && supplier.products.length > 0) {
        supplier.products.forEach(supplierProduct => {
          if (supplierProduct.toLowerCase().includes(reqProduct.toLowerCase()) ||
              reqProduct.toLowerCase().includes(supplierProduct.toLowerCase())) {
            productMatches.push(supplierProduct);
            score.productMatch += 0.3;
          }
        });
      }
    });

    if (productMatches.length > 0) {
      score.reasoning.push(`Supplies matching products: ${productMatches.join(', ')}`);
    }

    // Location matching
    const locationMatches = [];
    rfqAnalysis.requirements.locations.forEach(reqLocation => {
      if (supplier.location) {
        const supplierLocation = `${supplier.location.country} ${supplier.location.region || ''} ${supplier.location.city || ''}`;
        if (supplierLocation.toLowerCase().includes(reqLocation.toLowerCase())) {
          locationMatches.push(reqLocation);
          score.locationMatch += 0.2;
        }
      }
    });

    if (locationMatches.length > 0) {
      score.reasoning.push(`Located in/near: ${locationMatches.join(', ')}`);
    }

    // Certification matching
    const certMatches = [];
    rfqAnalysis.requirements.certifications.forEach(reqCert => {
      if (supplier.certifications && supplier.certifications.length > 0) {
        supplier.certifications.forEach(supplierCert => {
          if (supplierCert.toLowerCase().includes(reqCert.toLowerCase())) {
            certMatches.push(supplierCert);
            score.certificationMatch += 0.25;
          }
        });
      }
    });

    if (certMatches.length > 0) {
      score.reasoning.push(`Has certifications: ${certMatches.join(', ')}`);
    }

    // Quality indicators
    if (supplier.rating && supplier.rating > 4.0) {
      score.qualityMatch += 0.15;
      score.reasoning.push(`High supplier rating: ${supplier.rating}/5`);
    }

    // Calculate total weighted score
    score.totalScore = Math.min(1.0,
      score.productMatch * 0.4 +
      score.locationMatch * 0.2 +
      score.certificationMatch * 0.2 +
      score.qualityMatch * 0.2
    );

    score.details = {
      productMatch: score.productMatch,
      locationMatch: score.locationMatch,
      certificationMatch: score.certificationMatch,
      qualityMatch: score.qualityMatch
    };

    return score;
  }
}

module.exports = new SupplierMatchingService();
