// File: /src/services/aiMatchingService.ts

interface Supplier {
  id: string;
  name: string;
  country: string;
  productCategories: string[];
  certifications: string[];
  qualityRating: number;
  complianceRating: number;
  averagePrice: number;
  averageLeadTime: number;
  capacity: number;
  pastPerformance: {
    onTimeDelivery: number;
    qualityScore: number;
    communicationScore: number;
  };
  riskFactors: string[];
  specializations: string[];
}

interface RFQRequirement {
  productType: string;
  quantity: number;
  budget: number;
  deadline: string;
  specifications: any;
  complianceRequirements: string[];
  targetMarkets: string[];
  criticalRequirements?: string[];
}

interface MatchingResult {
  supplier: Supplier;
  compatibilityScore: number;
  matchReasons: string[];
  riskWarnings: string[];
  recommendations: string[];
  estimatedPrice: number;
  estimatedLeadTime: number;
  confidenceLevel: 'high' | 'medium' | 'low';
}

interface RiskAssessment {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: string[];
  preventionSuggestions: string[];
  historicalFailures: string[];
  complianceScore: number;
}

class AIMatchingService {
  private suppliers: Supplier[] = [
    {
      id: 'sup_001',
      name: 'Golden Grains Ltd',
      country: 'Australia',
      productCategories: ['cornflakes', 'oats', 'cereals'],
      certifications: ['ISO22000', 'HACCP', 'Organic', 'BRC'],
      qualityRating: 4.8,
      complianceRating: 95,
      averagePrice: 8.2,
      averageLeadTime: 14,
      capacity: 50000,
      pastPerformance: {
        onTimeDelivery: 96,
        qualityScore: 94,
        communicationScore: 92
      },
      riskFactors: [],
      specializations: ['premium_cereals', 'organic_products']
    },
    {
      id: 'sup_002',
      name: 'Sunrise Foods',
      country: 'India',
      productCategories: ['cornflakes', 'rice', 'spices'],
      certifications: ['ISO22000', 'FSSAI', 'Halal'],
      qualityRating: 4.5,
      complianceRating: 90,
      averagePrice: 6.8,
      averageLeadTime: 21,
      capacity: 80000,
      pastPerformance: {
        onTimeDelivery: 88,
        qualityScore: 89,
        communicationScore: 85
      },
      riskFactors: ['longer_lead_times', 'quality_variance'],
      specializations: ['bulk_production', 'cost_effective']
    },
    {
      id: 'sup_003',
      name: 'EuroCereals Co',
      country: 'Germany',
      productCategories: ['cornflakes', 'wheat', 'pasta'],
      certifications: ['EU Organic', 'BRC', 'IFS', 'ISO22000'],
      qualityRating: 4.9,
      complianceRating: 98,
      averagePrice: 9.1,
      averageLeadTime: 10,
      capacity: 30000,
      pastPerformance: {
        onTimeDelivery: 98,
        qualityScore: 97,
        communicationScore: 96
      },
      riskFactors: [],
      specializations: ['premium_quality', 'fast_delivery', 'eu_compliance']
    },
    {
      id: 'sup_004',
      name: 'Midwest Grain Corp',
      country: 'USA',
      productCategories: ['wheat', 'corn', 'soybeans'],
      certifications: ['FDA', 'USDA Organic', 'Non-GMO'],
      qualityRating: 4.6,
      complianceRating: 92,
      averagePrice: 7.5,
      averageLeadTime: 12,
      capacity: 120000,
      pastPerformance: {
        onTimeDelivery: 93,
        qualityScore: 91,
        communicationScore: 89
      },
      riskFactors: ['weather_dependent'],
      specializations: ['large_volumes', 'north_america']
    }
  ];

  findBestMatches(rfqRequirement: RFQRequirement, maxResults: number = 5): MatchingResult[] {
    console.log('🤖 AI analyzing RFQ requirements...');
    
    const matches = this.suppliers
      .filter(s => this.isEligibleSupplier(s, rfqRequirement))
      .map(s => this.calculateMatch(s, rfqRequirement))
      .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
      .slice(0, maxResults);
    
    console.log(`🎯 AI found ${matches.length} compatible suppliers`);
    return matches;
  }

  private isEligibleSupplier(supplier: Supplier, rfq: RFQRequirement): boolean {
    // Check product category match
    if (!supplier.productCategories.includes(rfq.productType)) {
      return false;
    }

    // Check capacity
    if (supplier.capacity < rfq.quantity) {
      return false;
    }

    // Check compliance requirements
    const requiredCerts = rfq.complianceRequirements;
    const hasRequiredCerts = requiredCerts.every(cert => 
      supplier.certifications.some(supplierCert => 
        supplierCert.toLowerCase().includes(cert.toLowerCase())
      )
    );

    return hasRequiredCerts;
  }

  private calculateMatch(supplier: Supplier, rfq: RFQRequirement): MatchingResult {
    const scores = {
      price: this.calculatePriceScore(supplier, rfq),
      quality: this.calculateQualityScore(supplier, rfq),
      compliance: this.calculateComplianceScore(supplier, rfq),
      delivery: this.calculateDeliveryScore(supplier, rfq),
      risk: this.calculateRiskScore(supplier, rfq),
      specialization: this.calculateSpecializationScore(supplier, rfq)
    };

    // Weighted compatibility score
    const compatibilityScore = Math.round(
      scores.price * 0.25 +
      scores.quality * 0.20 +
      scores.compliance * 0.20 +
      scores.delivery * 0.15 +
      scores.risk * 0.10 +
      scores.specialization * 0.10
    );

    const matchReasons = this.generateMatchReasons(supplier, rfq, scores);
    const riskWarnings = this.generateRiskWarnings(supplier, rfq);
    const recommendations = this.generateRecommendations(supplier, rfq, scores);
    const estimatedPrice = this.estimatePrice(supplier, rfq);
    const estimatedLeadTime = this.estimateLeadTime(supplier, rfq);
    const confidenceLevel = this.calculateConfidenceLevel(scores);

    return {
      supplier,
      compatibilityScore,
      matchReasons,
      riskWarnings,
      recommendations,
      estimatedPrice,
      estimatedLeadTime,
      confidenceLevel
    };
  }

  private calculatePriceScore(supplier: Supplier, rfq: RFQRequirement): number {
    const budgetPerUnit = rfq.budget / rfq.quantity;
    const priceRatio = supplier.averagePrice / budgetPerUnit;
    
    if (priceRatio <= 0.8) return 100;
    if (priceRatio <= 1.0) return 90;
    if (priceRatio <= 1.2) return 70;
    return 40;
  }

  private calculateQualityScore(supplier: Supplier, rfq: RFQRequirement): number {
    return Math.round(supplier.qualityRating * 20);
  }

  private calculateComplianceScore(supplier: Supplier, rfq: RFQRequirement): number {
    return supplier.complianceRating;
  }

  private calculateDeliveryScore(supplier: Supplier, rfq: RFQRequirement): number {
    const deadlineDays = Math.ceil((new Date(rfq.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const deliveryBuffer = deadlineDays - supplier.averageLeadTime;
    
    if (deliveryBuffer > 14) return 100;
    if (deliveryBuffer > 7) return 85;
    if (deliveryBuffer > 0) return 65;
    return 20;
  }

  private calculateRiskScore(supplier: Supplier, rfq: RFQRequirement): number {
    let riskScore = 100;
    
    supplier.riskFactors.forEach(risk => {
      switch (risk) {
        case 'longer_lead_times':
          riskScore -= 15;
          break;
        case 'quality_variance':
          riskScore -= 20;
          break;
        case 'weather_dependent':
          riskScore -= 10;
          break;
        default:
          riskScore -= 5;
      }
    });

    if (supplier.pastPerformance.onTimeDelivery < 90) riskScore -= 10;
    if (supplier.pastPerformance.qualityScore < 90) riskScore -= 15;

    return Math.max(0, riskScore);
  }

  private calculateSpecializationScore(supplier: Supplier, rfq: RFQRequirement): number {
    let score = 50;
    
    supplier.specializations.forEach(spec => {
      if (spec.includes(rfq.productType)) score += 20;
      if (spec === 'premium_quality' && rfq.budget > 40000) score += 15;
      if (spec === 'fast_delivery' && this.isUrgentDeadline(rfq.deadline)) score += 15;
      if (spec === 'organic_products' && rfq.complianceRequirements.includes('Organic')) score += 10;
    });

    return Math.min(100, score);
  }

  private isUrgentDeadline(deadline: string): boolean {
    const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days < 21;
  }

  private generateMatchReasons(supplier: Supplier, rfq: RFQRequirement, scores: any): string[] {
    const reasons = [];
    
    if (scores.price > 85) reasons.push('💰 Excellent price competitiveness');
    if (scores.quality > 90) reasons.push('⭐ Outstanding quality track record');
    if (scores.compliance > 95) reasons.push('✅ Perfect compliance match');
    if (scores.delivery > 85) reasons.push('🚚 Reliable delivery performance');
    if (supplier.specializations.includes('premium_quality')) reasons.push('🏆 Premium quality specialist');
    if (supplier.country === 'Australia' && rfq.targetMarkets?.includes('Asia')) {
      reasons.push('🌏 Strategic location for Asia markets');
    }

    return reasons.slice(0, 3); // Return top 3 reasons
  }

  private generateRiskWarnings(supplier: Supplier, rfq: RFQRequirement): string[] {
    const warnings = [];
    
    if (supplier.riskFactors.includes('quality_variance')) {
      warnings.push('⚠️ Historical quality variance - request quality samples');
    }
    if (supplier.riskFactors.includes('longer_lead_times')) {
      warnings.push('⏰ Longer lead times - plan for extended delivery');
    }
    if (supplier.pastPerformance.onTimeDelivery < 90) {
      warnings.push('📅 Below-average delivery performance');
    }

    return warnings;
  }

  private generateRecommendations(supplier: Supplier, rfq: RFQRequirement, scores: any): string[] {
    const recommendations = [];
    
    if (scores.price < 70) {
      recommendations.push('💡 Consider negotiating volume discounts');
    }
    if (scores.delivery < 80) {
      recommendations.push('📋 Request detailed delivery timeline with milestones');
    }
    if (supplier.qualityRating < 4.7) {
      recommendations.push('🔍 Request quality samples and certifications');
    }
    if (supplier.specializations.includes('bulk_production') && rfq.quantity > 10000) {
      recommendations.push('📈 Perfect for large volume requirements');
    }

    return recommendations.slice(0, 2); // Return top 2 recommendations
  }

  private estimatePrice(supplier: Supplier, rfq: RFQRequirement): number {
    let basePrice = supplier.averagePrice;
    
    // Volume discounts
    if (rfq.quantity > 10000) basePrice *= 0.95;
    if (rfq.quantity > 50000) basePrice *= 0.90;
    
    // Premium for special requirements
    if (rfq.specifications?.certification === 'organic') basePrice *= 1.15;
    if (rfq.specifications?.packaging === 'premium') basePrice *= 1.10;
    
    return Math.round(basePrice * 100) / 100;
  }

  private estimateLeadTime(supplier: Supplier, rfq: RFQRequirement): number {
    let leadTime = supplier.averageLeadTime;
    
    // Additional time for high volume
    if (rfq.quantity > supplier.capacity * 0.8) leadTime += 7;
    
    // Additional time for custom requirements
    if (rfq.specifications?.custom_packaging) leadTime += 3;
    
    return leadTime;
  }

  private calculateConfidenceLevel(scores: any): 'high' | 'medium' | 'low' {
    const avgScore = Object.values(scores).reduce((sum: number, score: any) => sum + score, 0) / Object.keys(scores).length;
    
    if (avgScore > 85) return 'high';
    if (avgScore > 70) return 'medium';
    return 'low';
  }

  assessSpecificationRisks(rfqRequirement: RFQRequirement): RiskAssessment {
    console.log('🤖 AI analyzing specification risks...');
    
    const riskFactors: string[] = [];
    const preventionSuggestions: string[] = [];
    const historicalFailures: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let complianceScore = 100;

    // Check for critical spec errors (like cornflake color)
    if (rfqRequirement.productType === 'cornflakes' && rfqRequirement.specifications?.color) {
      const color = rfqRequirement.specifications.color;
      const invalidColors = ['dark_brown', 'white', 'black'];
      
      if (invalidColors.includes(color)) {
        riskLevel = 'critical';
        complianceScore = 25;
        riskFactors.push('Invalid cornflake color specification detected');
        historicalFailures.push('9-month project failure in 2024 due to dark brown cornflake color');
        preventionSuggestions.push('Select approved colors: golden, light_brown, amber, or honey');
        preventionSuggestions.push('Request color samples before finalizing order');
      }
    }

    // Budget analysis
    const budgetPerUnit = rfqRequirement.budget / rfqRequirement.quantity;
    if (budgetPerUnit < 5 && rfqRequirement.productType === 'cornflakes') {
      riskLevel = riskLevel === 'critical' ? 'critical' : 'high';
      complianceScore -= 20;
      riskFactors.push('Budget significantly below market average');
      preventionSuggestions.push('Consider increasing budget to $7-9/unit for quality suppliers');
    }

    // Timeline analysis
    const deadlineDays = Math.ceil((new Date(rfqRequirement.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (deadlineDays < 14) {
      riskLevel = riskLevel === 'critical' ? 'critical' : 'medium';
      complianceScore -= 15;
      riskFactors.push('Tight deadline may limit supplier options');
      preventionSuggestions.push('Consider extending deadline by 1-2 weeks for better supplier participation');
    }

    // Compliance complexity
    if (rfqRequirement.complianceRequirements.length > 4) {
      riskLevel = riskLevel === 'critical' ? 'critical' : 'medium';
      complianceScore -= 10;
      riskFactors.push('Extensive compliance requirements may limit supplier pool');
      preventionSuggestions.push('Prioritize most critical certifications');
    }

    return {
      riskLevel,
      riskFactors,
      preventionSuggestions,
      historicalFailures,
      complianceScore
    };
  }

  getSmartNotifications(supplierId: string, newRFQ: RFQRequirement): string[] {
    const supplier = this.suppliers.find(s => s.id === supplierId);
    if (!supplier) return [];

    const notifications = [];

    if (supplier.productCategories.includes(newRFQ.productType)) {
      notifications.push(`🎯 Perfect match: New ${newRFQ.productType} RFQ posted`);
    }

    if (supplier.specializations.includes('premium_quality') && newRFQ.budget > 40000) {
      notifications.push('💎 High-value premium RFQ opportunity');
    }

    if (supplier.country === 'Australia' && newRFQ.targetMarkets?.includes('Asia')) {
      notifications.push('🌏 Geographic advantage for Asia market access');
    }

    if (newRFQ.quantity <= supplier.capacity * 0.8) {
      notifications.push('✅ Quantity within your production capacity');
    }

    return notifications.slice(0, 2); // Return top 2 notifications
  }
}

export const aiMatchingService = new AIMatchingService();
export default aiMatchingService;