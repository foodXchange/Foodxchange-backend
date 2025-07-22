// AI-Powered Product Analysis Service
import aiConfig from './config';

class ProductAnalysisService {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      const services = await aiConfig.initialize();
      this.openAI = services.openAI;
      this.textAnalytics = services.textAnalytics;
      this.initialized = true;
    }
  }

  async analyzeProduct(productData) {
    await this.initialize();

    try {
      const analysis = {
        category: await this.categorizeProduct(productData),
        keywords: await this.extractKeywords(productData),
        compliance: await this.checkCompliance(productData),
        pricing: await this.analyzePricing(productData),
        quality: this.assessQuality(productData)
      };

      return {
        success: true,
        analysis,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Product analysis error:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  async categorizeProduct(productData) {
    if (!this.textAnalytics) {
      return this.enhancedCategorization(productData);
    }

    try {
      // Prepare text for analysis
      const productText = `${productData.name || ''} ${productData.description || ''} ${productData.tags?.join(' ') || ''}`.trim();

      // Use key phrase extraction for better categorization
      const documents = [{
        id: '1',
        text: productText,
        language: 'en'
      }];

      const keyPhraseResults = await this.textAnalytics.extractKeyPhrases(documents);
      const keyPhrases = keyPhraseResults[0]?.keyPhrases || [];

      // Use enhanced categorization with AI-extracted key phrases
      const categoryResult = this.enhancedCategorization({
        ...productData,
        extractedKeyPhrases: keyPhrases
      });

      // If we have high confidence from basic categorization, use it
      if (categoryResult.confidence >= 0.8) {
        return categoryResult;
      }

      // Otherwise, try entity recognition for better categorization
      const entityResults = await this.textAnalytics.recognizeEntities(documents);
      const entities = entityResults[0]?.entities || [];

      // Look for product-related entities
      const productEntities = entities.filter(e =>
        e.category === 'Product' ||
                e.category === 'Food' ||
                e.category === 'ConsumerGood'
      );

      if (productEntities.length > 0) {
        // Use entity information to improve categorization
        const enhancedData = {
          ...productData,
          extractedKeyPhrases: keyPhrases,
          recognizedEntities: productEntities.map(e => e.text)
        };
        return this.enhancedCategorization(enhancedData);
      }

      return categoryResult;
    } catch (error) {
      console.error('AI categorization failed, falling back to enhanced categorization:', error);
      return this.enhancedCategorization(productData);
    }
  }

  enhancedCategorization(productData) {
    // Enhanced categorization with more detailed categories and scoring
    const categoryMap = {
      'dairy': {
        keywords: ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'dairy', 'lactose', 'whey', 'curd', 'kefir', 'buttermilk', 'cottage cheese', 'mozzarella', 'cheddar', 'parmesan'],
        subcategories: {
          'milk-cream': ['milk', 'cream', 'half-and-half', 'buttermilk'],
          'cheese': ['cheese', 'cheddar', 'mozzarella', 'parmesan', 'swiss', 'feta', 'gouda'],
          'yogurt': ['yogurt', 'greek yogurt', 'probiotic', 'kefir'],
          'butter': ['butter', 'margarine', 'ghee']
        }
      },
      'meat': {
        keywords: ['beef', 'chicken', 'pork', 'lamb', 'turkey', 'meat', 'poultry', 'sausage', 'bacon', 'ham', 'steak', 'ground', 'minced', 'fillet', 'breast', 'thigh', 'wing', 'rib'],
        subcategories: {
          'beef': ['beef', 'steak', 'ground beef', 'ribeye', 'sirloin', 'tenderloin'],
          'poultry': ['chicken', 'turkey', 'duck', 'breast', 'thigh', 'wing'],
          'pork': ['pork', 'bacon', 'ham', 'sausage', 'chop', 'tenderloin'],
          'lamb': ['lamb', 'mutton', 'rack', 'shank']
        }
      },
      'seafood': {
        keywords: ['fish', 'seafood', 'salmon', 'tuna', 'shrimp', 'lobster', 'crab', 'oyster', 'mussel', 'squid', 'octopus', 'tilapia', 'cod', 'halibut', 'trout', 'prawns'],
        subcategories: {
          'fish': ['salmon', 'tuna', 'tilapia', 'cod', 'halibut', 'trout', 'bass', 'mackerel'],
          'shellfish': ['shrimp', 'lobster', 'crab', 'prawns', 'crayfish'],
          'mollusks': ['oyster', 'mussel', 'clam', 'scallop', 'squid', 'octopus']
        }
      },
      'produce': {
        keywords: ['fruit', 'vegetable', 'fresh', 'organic', 'apple', 'banana', 'orange', 'tomato', 'lettuce', 'carrot', 'potato', 'onion', 'pepper', 'broccoli', 'spinach', 'berries'],
        subcategories: {
          'fruits': ['apple', 'banana', 'orange', 'grape', 'strawberry', 'blueberry', 'mango', 'pineapple', 'watermelon', 'peach'],
          'vegetables': ['tomato', 'lettuce', 'carrot', 'broccoli', 'spinach', 'pepper', 'cucumber', 'zucchini'],
          'roots': ['potato', 'onion', 'garlic', 'ginger', 'radish', 'turnip', 'beet']
        }
      },
      'bakery': {
        keywords: ['bread', 'cake', 'pastry', 'cookie', 'muffin', 'croissant', 'bagel', 'donut', 'pie', 'tart', 'biscuit', 'roll', 'bun', 'loaf', 'sourdough', 'wheat', 'rye'],
        subcategories: {
          'bread': ['bread', 'loaf', 'baguette', 'sourdough', 'wheat', 'rye', 'multigrain'],
          'pastries': ['croissant', 'danish', 'puff pastry', 'turnover'],
          'cakes': ['cake', 'cupcake', 'muffin', 'brownie'],
          'cookies': ['cookie', 'biscuit', 'cracker']
        }
      },
      'beverages': {
        keywords: ['drink', 'juice', 'water', 'soda', 'coffee', 'tea', 'beverage', 'cola', 'lemonade', 'smoothie', 'energy drink', 'sports drink', 'mineral water', 'sparkling'],
        subcategories: {
          'juices': ['juice', 'orange juice', 'apple juice', 'smoothie'],
          'soft-drinks': ['soda', 'cola', 'lemonade', 'energy drink'],
          'hot-drinks': ['coffee', 'tea', 'hot chocolate', 'espresso'],
          'water': ['water', 'mineral water', 'sparkling water']
        }
      },
      'packaged-goods': {
        keywords: ['canned', 'frozen', 'packaged', 'instant', 'ready-to-eat', 'preserved', 'dried', 'dehydrated', 'shelf-stable'],
        subcategories: {
          'canned': ['canned', 'tin', 'preserved'],
          'frozen': ['frozen', 'ice cream', 'frozen meal'],
          'dried': ['dried', 'dehydrated', 'powder', 'instant']
        }
      },
      'condiments': {
        keywords: ['sauce', 'ketchup', 'mustard', 'mayonnaise', 'dressing', 'vinegar', 'oil', 'spice', 'seasoning', 'salt', 'pepper', 'herbs'],
        subcategories: {
          'sauces': ['sauce', 'ketchup', 'mustard', 'mayonnaise', 'hot sauce'],
          'oils': ['oil', 'olive oil', 'vegetable oil', 'coconut oil'],
          'spices': ['spice', 'seasoning', 'salt', 'pepper', 'herbs']
        }
      }
    };

    // Prepare search text
    const searchText = `${productData.name || ''} ${productData.description || ''} ${productData.tags?.join(' ') || ''} ${productData.extractedKeyPhrases?.join(' ') || ''} ${productData.recognizedEntities?.join(' ') || ''}`.toLowerCase();

    let bestMatch = { category: 'general', subcategory: null, confidence: 0 };

    // Score each category
    for (const [category, data] of Object.entries(categoryMap)) {
      let score = 0;
      let matchedKeywords = 0;
      let bestSubcategory = null;
      let bestSubcategoryScore = 0;

      // Check main category keywords
      for (const keyword of data.keywords) {
        if (searchText.includes(keyword)) {
          score += keyword.length > 5 ? 2 : 1; // Longer keywords get higher weight
          matchedKeywords++;
        }
      }

      // Check subcategories
      if (data.subcategories) {
        for (const [subcat, subKeywords] of Object.entries(data.subcategories)) {
          let subScore = 0;
          for (const keyword of subKeywords) {
            if (searchText.includes(keyword)) {
              subScore += keyword.length > 5 ? 3 : 2; // Subcategory matches are weighted higher
              matchedKeywords++;
            }
          }
          if (subScore > bestSubcategoryScore) {
            bestSubcategoryScore = subScore;
            bestSubcategory = subcat;
          }
        }
        score += bestSubcategoryScore;
      }

      // Calculate confidence based on matched keywords and total score
      const confidence = Math.min(0.95, (score / 10) + (matchedKeywords * 0.1));

      if (confidence > bestMatch.confidence) {
        bestMatch = {
          category,
          subcategory: bestSubcategory,
          confidence: Number(confidence.toFixed(2))
        };
      }
    }

    // If we have a specific category from productData and it's in our map, boost its confidence
    if (productData.category && categoryMap[productData.category.toLowerCase()]) {
      if (productData.category.toLowerCase() === bestMatch.category) {
        bestMatch.confidence = Math.min(0.95, bestMatch.confidence + 0.1);
      }
    }

    return {
      primary: bestMatch.category,
      subcategory: bestMatch.subcategory,
      confidence: bestMatch.confidence,
      method: 'enhanced_categorization'
    };
  }

  basicCategorization(productData) {
    // Simplified fallback categorization
    const categories = {
      'dairy': ['milk', 'cheese', 'yogurt', 'butter'],
      'meat': ['beef', 'chicken', 'pork', 'lamb'],
      'produce': ['fruit', 'vegetable', 'fresh'],
      'bakery': ['bread', 'cake', 'pastry'],
      'beverages': ['drink', 'juice', 'water', 'soda']
    };

    const description = (`${productData.name  } ${  productData.description}`).toLowerCase();

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => description.includes(keyword))) {
        return { primary: category, confidence: 0.7 };
      }
    }

    return { primary: 'general', confidence: 0.5 };
  }

  async extractKeywords(productData) {
    if (!this.textAnalytics) {
      return [];
    }

    const documents = [{
      id: '1',
      text: `${productData.name} ${productData.description}`,
      language: 'en'
    }];

    const keyPhraseResults = await this.textAnalytics.extractKeyPhrases(documents);
    return keyPhraseResults[0]?.keyPhrases || [];
  }

  async checkCompliance(productData) {
    // Check for required certifications and compliance
    const requiredCerts = ['FDA', 'HACCP', 'ISO'];
    const productCerts = productData.certifications || [];

    return {
      compliant: requiredCerts.some(cert =>
        productCerts.some(pCert => pCert.includes(cert))
      ),
      missing: requiredCerts.filter(cert =>
        !productCerts.some(pCert => pCert.includes(cert))
      ),
      certifications: productCerts
    };
  }

  async analyzePricing(productData) {
    // Basic pricing analysis
    return {
      competitive: true,
      suggestedPrice: productData.price * 1.1,
      priceRange: {
        min: productData.price * 0.9,
        max: productData.price * 1.2
      }
    };
  }

  assessQuality(productData) {
    let score = 50; // Base score

    // Add points for completeness
    if (productData.name) score += 10;
    if (productData.description?.length > 50) score += 10;
    if (productData.images?.length > 0) score += 10;
    if (productData.certifications?.length > 0) score += 10;
    if (productData.nutritionalInfo) score += 10;

    return {
      score: Math.min(score, 100),
      factors: {
        completeness: score >= 70,
        hasImages: productData.images?.length > 0,
        hasCertifications: productData.certifications?.length > 0
      }
    };
  }
}

export default new ProductAnalysisService();
