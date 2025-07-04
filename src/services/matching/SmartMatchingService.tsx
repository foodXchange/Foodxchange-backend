const User = require('../models/User');
const Product = require('../models/Product');
const RFQ = require('../models/RFQ');
const Analytics = require('../models/analytics/Analytics');

class SmartMatchingService {
  constructor() {
    this.weights = {
      productMatch: 0.3,
      priceMatch: 0.25,
      certificationMatch: 0.2,
      locationMatch: 0.15,
      performanceScore: 0.1
    };
  }

  /**
   * Find best supplier matches for a buyer's requirements
   */
  async findSupplierMatches(buyerId, requirements) {
    try {
      const buyer = await User.findById(buyerId);
      if (!buyer || buyer.role !== 'buyer') {
        throw new Error('Invalid buyer');
      }

      // Get all active suppliers
      const suppliers = await User.find({ 
        role: 'supplier', 
        verified: true,
        active: true 
      }).populate('products');

      // Calculate match scores
      const matches = await Promise.all(
        suppliers.map(async (supplier) => {
          const score = await this.calculateMatchScore(buyer, supplier, requirements);
          return {
            supplier: {
              _id: supplier._id,
              company: supplier.company,
              location: supplier.location,
              certifications: supplier.certifications,
              rating: supplier.rating
            },
            score: score.total,
            breakdown: score.breakdown,
            matchedProducts: score.matchedProducts
          };
        })
      );

      // Sort by score and return top matches
      return matches
        .filter(m => m.score > 50) // Only return matches above 50%
        .sort((a, b) => b.score - a.score)
        .slice(0, 20); // Top 20 matches

    } catch (error) {
      console.error('Matching error:', error);
      throw error;
    }
  }

  /**
   * Calculate match score between buyer and supplier
   */
  async calculateMatchScore(buyer, supplier, requirements) {
    const breakdown = {
      productMatch: 0,
      priceMatch: 0,
      certificationMatch: 0,
      locationMatch: 0,
      performanceScore: 0
    };

    let matchedProducts = [];

    // 1. Product Category Match
    if (requirements.categories && supplier.products) {
      const supplierCategories = [...new Set(supplier.products.map(p => p.category))];
      const matchingCategories = requirements.categories.filter(c => 
        supplierCategories.includes(c)
      );
      
      breakdown.productMatch = (matchingCategories.length / requirements.categories.length) * 100;
      
      // Find specific matching products
      matchedProducts = supplier.products.filter(p => 
        requirements.categories.includes(p.category)
      );
    }

    // 2. Price Range Match
    if (requirements.priceRange && matchedProducts.length > 0) {
      const inRangeProducts = matchedProducts.filter(p => 
        p.price >= requirements.priceRange.min && 
        p.price <= requirements.priceRange.max
      );
      breakdown.priceMatch = (inRangeProducts.length / matchedProducts.length) * 100;
    }

    // 3. Certification Match
    if (requirements.certifications && supplier.certifications) {
      const matchingCerts = requirements.certifications.filter(c => 
        supplier.certifications.some(sc => sc.type === c && sc.status === 'active')
      );
      breakdown.certificationMatch = (matchingCerts.length / requirements.certifications.length) * 100;
    }

    // 4. Location/Shipping Match
    if (requirements.preferredRegions && supplier.location) {
      if (requirements.preferredRegions.includes(supplier.location.country)) {
        breakdown.locationMatch = 100;
      } else if (requirements.preferredRegions.includes(supplier.location.continent)) {
        breakdown.locationMatch = 70;
      } else {
        breakdown.locationMatch = 30; // Can still ship internationally
      }
    }

    // 5. Performance Score
    const analytics = await Analytics.findOne({ 
      user: supplier._id,
      'period.type': 'monthly'
    }).sort({ createdAt: -1 });

    if (analytics) {
      // Base on response rate, meeting success, and ratings
      const responseScore = analytics.metrics.responseRate || 0;
      const meetingScore = analytics.metrics.meetingSuccessRate || 0;
      const ratingScore = (supplier.rating / 5) * 100;
      
      breakdown.performanceScore = (responseScore + meetingScore + ratingScore) / 3;
    }

    // Calculate weighted total
    const total = Object.keys(breakdown).reduce((sum, key) => {
      return sum + (breakdown[key] * this.weights[key]);
    }, 0);

    return {
      total: Math.round(total),
      breakdown,
      matchedProducts: matchedProducts.slice(0, 5) // Top 5 matching products
    };
  }

  /**
   * Get AI-powered recommendations for improving match score
   */
  async getMatchImprovementTips(supplierId, buyerRequirements) {
    const tips = [];
    
    // Analyze gaps and provide recommendations
    // This would connect to an AI service in production
    
    tips.push({
      area: 'certifications',
      tip: 'Adding organic certification could increase your match rate by 25%',
      impact: 'high'
    });

    tips.push({
      area: 'response_time',
      tip: 'Responding within 2 hours increases conversion by 40%',
      impact: 'medium'
    });

    return tips;
  }
}

module.exports = new SmartMatchingService();
