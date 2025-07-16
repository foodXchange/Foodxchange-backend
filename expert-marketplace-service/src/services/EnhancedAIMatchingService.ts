import { TextAnalyticsClient } from '@azure/ai-text-analytics';
import { Logger } from '../utils/logger';
import { config } from '../config';
import { ExpertProfile } from '../models/ExpertProfile.model';
import { ExpertService } from '../models/ExpertService.model';
import { advancedCacheService } from './AdvancedCacheService';

const logger = new Logger('EnhancedAIMatchingService');

export interface FoodIndustrySpecialization {
  category: string;
  subcategories: string[];
  certifications: string[];
  regulations: string[];
  commonChallenges: string[];
}

export interface MatchingCriteria {
  description: string;
  requirements: string[];
  industryFocus: string[];
  budget?: {
    min: number;
    max: number;
    currency: string;
  };
  timeline?: {
    startDate?: Date;
    endDate?: Date;
    urgency: 'low' | 'medium' | 'high' | 'urgent';
  };
  location?: {
    country: string;
    state?: string;
    city?: string;
    remote: boolean;
  };
  complianceRequirements?: string[];
  certificationNeeds?: string[];
  languagePreferences?: string[];
  previousExperience?: string[];
}

export interface EnhancedExpertMatch {
  expert: any;
  matchScore: number;
  confidenceLevel: number;
  matchReasons: string[];
  industrySpecificScore: number;
  complianceScore: number;
  experienceScore: number;
  availabilityScore: number;
  locationScore: number;
  budgetCompatibility: number;
  riskAssessment: {
    level: 'low' | 'medium' | 'high';
    factors: string[];
    mitigationSuggestions: string[];
  };
  recommendationRank: number;
  estimatedProjectFit: number;
}

export class EnhancedAIMatchingService {
  private textAnalyticsClient: TextAnalyticsClient;
  private foodIndustryKnowledgeBase: Map<string, FoodIndustrySpecialization>;
  private complianceDatabase: Map<string, string[]>;

  constructor() {
    this.initializeAzureAI();
    this.loadFoodIndustryKnowledge();
    this.loadComplianceDatabase();
  }

  private initializeAzureAI(): void {
    if (config.azure?.textAnalyticsKey && config.azure?.textAnalyticsEndpoint) {
      this.textAnalyticsClient = new TextAnalyticsClient(
        config.azure.textAnalyticsEndpoint,
        { 
          apiKey: config.azure.textAnalyticsKey 
        }
      );
    }
  }

  private loadFoodIndustryKnowledge(): void {
    this.foodIndustryKnowledgeBase = new Map([
      ['dairy', {
        category: 'Dairy Products',
        subcategories: ['milk', 'cheese', 'yogurt', 'butter', 'ice cream', 'whey products'],
        certifications: ['HACCP', 'SQF', 'BRC', 'IFS', 'Organic', 'Non-GMO'],
        regulations: ['FDA 21 CFR Part 113', 'EU Regulation 852/2004', 'FSIS Guidelines'],
        commonChallenges: ['cold chain management', 'shelf life optimization', 'bacterial contamination', 'lactose-free processing']
      }],
      ['meat_poultry', {
        category: 'Meat & Poultry',
        subcategories: ['beef', 'pork', 'chicken', 'turkey', 'lamb', 'processed meats', 'seafood'],
        certifications: ['HACCP', 'SQF', 'BRC', 'SSOP', 'Halal', 'Kosher', 'USDA Organic'],
        regulations: ['FSIS 9 CFR', 'FDA FSMA', 'EU Regulation 853/2004'],
        commonChallenges: ['pathogen control', 'traceability', 'antimicrobial resistance', 'humane handling']
      }],
      ['beverages', {
        category: 'Beverages',
        subcategories: ['soft drinks', 'juices', 'alcoholic beverages', 'functional drinks', 'plant-based beverages'],
        certifications: ['HACCP', 'SQF', 'BRC', 'TTB', 'Organic', 'Fair Trade'],
        regulations: ['FDA 21 CFR Part 117', 'TTB Regulations', 'EU Regulation 1169/2011'],
        commonChallenges: ['sugar reduction', 'natural preservatives', 'packaging sustainability', 'flavor stability']
      }],
      ['bakery_confectionery', {
        category: 'Bakery & Confectionery',
        subcategories: ['bread', 'pastries', 'cookies', 'chocolate', 'candy', 'gluten-free products'],
        certifications: ['HACCP', 'SQF', 'BRC', 'AIB', 'Gluten-Free', 'Allergen-Free'],
        regulations: ['FDA Food Allergen Labeling', 'EU Regulation 1169/2011'],
        commonChallenges: ['allergen management', 'shelf life extension', 'clean label formulations', 'texture optimization']
      }],
      ['fruits_vegetables', {
        category: 'Fruits & Vegetables',
        subcategories: ['fresh produce', 'frozen vegetables', 'dried fruits', 'canned vegetables', 'organic produce'],
        certifications: ['HACCP', 'SQF', 'BRC', 'GlobalGAP', 'USDA Organic', 'Fair Trade'],
        regulations: ['FDA FSMA Produce Safety Rule', 'EU Regulation 396/2005'],
        commonChallenges: ['pesticide residues', 'post-harvest handling', 'cold chain logistics', 'seasonal availability']
      }],
      ['supplements_nutraceuticals', {
        category: 'Supplements & Nutraceuticals',
        subcategories: ['vitamins', 'minerals', 'herbal supplements', 'probiotics', 'protein powders', 'functional ingredients'],
        certifications: ['NSF', 'USP', 'cGMP', 'HACCP', 'Organic', 'Non-GMO Project'],
        regulations: ['FDA DSHEA', 'EU Regulation 1924/2006', 'Health Canada NHP Regulations'],
        commonChallenges: ['bioavailability', 'stability testing', 'health claims substantiation', 'contamination control']
      }]
    ]);
  }

  private loadComplianceDatabase(): void {
    this.complianceDatabase = new Map([
      ['usa', ['FDA FSMA', 'HACCP', 'SQF', 'BRC', 'USDA Organic', 'Non-GMO Project', 'GRAS']],
      ['eu', ['EU Regulation 178/2002', 'HACCP', 'BRC', 'IFS', 'EU Organic', 'Novel Food Regulation']],
      ['canada', ['CFIA Safe Foods for Canadians Regulations', 'HACCP', 'SQF', 'BRC', 'Health Canada NHP']],
      ['global', ['Codex Alimentarius', 'ISO 22000', 'HACCP', 'SQF', 'BRC', 'IFS', 'FSSC 22000']]
    ]);
  }

  /**
   * Enhanced AI-powered expert matching with food industry specialization
   */
  async findOptimalExpertMatches(criteria: MatchingCriteria): Promise<EnhancedExpertMatch[]> {
    try {
      logger.info('Starting enhanced AI expert matching', { criteria });

      // Step 1: AI-powered requirement analysis
      const analyzedRequirements = await this.analyzeRequirementsWithAI(criteria);
      
      // Step 2: Industry-specific filtering
      const industryFilteredExperts = await this.getIndustrySpecificExperts(analyzedRequirements);
      
      // Step 3: Multi-dimensional scoring
      const scoredMatches = await this.calculateEnhancedMatchScores(
        industryFilteredExperts, 
        analyzedRequirements
      );
      
      // Step 4: Risk assessment and validation
      const validatedMatches = await this.performRiskAssessment(scoredMatches, criteria);
      
      // Step 5: Machine learning optimization
      const optimizedMatches = await this.optimizeWithML(validatedMatches, criteria);
      
      // Step 6: Cache results for similar queries
      await this.cacheMatchingResults(criteria, optimizedMatches);
      
      logger.info('Enhanced matching completed', { 
        totalMatches: optimizedMatches.length,
        avgMatchScore: optimizedMatches.reduce((sum, m) => sum + m.matchScore, 0) / optimizedMatches.length
      });
      
      return optimizedMatches.slice(0, 20); // Return top 20 matches
      
    } catch (error) {
      logger.error('Enhanced AI matching failed:', error);
      throw error;
    }
  }

  private async analyzeRequirementsWithAI(criteria: MatchingCriteria): Promise<any> {
    try {
      const analysisText = `${criteria.description} ${criteria.requirements.join(' ')}`;
      
      if (!this.textAnalyticsClient) {
        return this.fallbackRequirementAnalysis(criteria);
      }

      // Extract key phrases
      const keyPhrasesResult = await this.textAnalyticsClient.extractKeyPhrases([analysisText]);
      const keyPhrases = keyPhrasesResult[0].keyPhrases || [];

      // Extract entities
      const entitiesResult = await this.textAnalyticsClient.recognizeEntities([analysisText]);
      const entities = entitiesResult[0].entities || [];

      // Detect sentiment for urgency assessment
      const sentimentResult = await this.textAnalyticsClient.analyzeSentiment([analysisText]);
      const sentiment = sentimentResult[0];

      // Food industry specific analysis
      const industryContext = this.analyzeFoodIndustryContext(keyPhrases, entities);
      const complianceRequirements = this.extractComplianceRequirements(analysisText);
      const technicalComplexity = this.assessTechnicalComplexity(keyPhrases);

      return {
        originalCriteria: criteria,
        keyPhrases,
        entities,
        sentiment,
        industryContext,
        complianceRequirements,
        technicalComplexity,
        urgencyScore: this.calculateUrgencyScore(sentiment, criteria.timeline?.urgency),
        requiredExpertise: this.mapToExpertiseAreas(keyPhrases, entities),
        riskFactors: this.identifyRiskFactors(analysisText, criteria)
      };
    } catch (error) {
      logger.error('AI requirement analysis failed:', error);
      return this.fallbackRequirementAnalysis(criteria);
    }
  }

  private fallbackRequirementAnalysis(criteria: MatchingCriteria): any {
    return {
      originalCriteria: criteria,
      keyPhrases: criteria.requirements,
      entities: [],
      industryContext: this.analyzeFoodIndustryContext(criteria.requirements, []),
      complianceRequirements: criteria.complianceRequirements || [],
      technicalComplexity: 'medium',
      urgencyScore: criteria.timeline?.urgency === 'urgent' ? 1 : 0.5,
      requiredExpertise: criteria.industryFocus,
      riskFactors: []
    };
  }

  private analyzeFoodIndustryContext(keyPhrases: string[], entities: any[]): any {
    const detectedCategories: string[] = [];
    const requiredCertifications: string[] = [];
    const regulatoryContext: string[] = [];

    for (const [category, specialization] of this.foodIndustryKnowledgeBase.entries()) {
      const categoryMatch = keyPhrases.some(phrase => 
        specialization.subcategories.some(sub => 
          phrase.toLowerCase().includes(sub.toLowerCase())
        )
      );

      if (categoryMatch) {
        detectedCategories.push(category);
        requiredCertifications.push(...specialization.certifications);
        regulatoryContext.push(...specialization.regulations);
      }
    }

    return {
      detectedCategories: [...new Set(detectedCategories)],
      requiredCertifications: [...new Set(requiredCertifications)],
      regulatoryContext: [...new Set(regulatoryContext)],
      industrySpecific: true
    };
  }

  private extractComplianceRequirements(text: string): string[] {
    const complianceKeywords = [
      'FDA', 'HACCP', 'SQF', 'BRC', 'IFS', 'ISO 22000', 'FSSC 22000',
      'USDA', 'organic', 'halal', 'kosher', 'non-gmo', 'gluten-free',
      'allergen', 'traceability', 'audit', 'certification'
    ];

    return complianceKeywords.filter(keyword => 
      text.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private assessTechnicalComplexity(keyPhrases: string[]): 'low' | 'medium' | 'high' {
    const complexityIndicators = {
      low: ['packaging', 'labeling', 'basic quality', 'documentation'],
      medium: ['process optimization', 'formulation', 'shelf life', 'sensory'],
      high: ['novel ingredients', 'biotechnology', 'nanotechnology', 'genetic modification', 'advanced processing']
    };

    let complexityScore = 0;
    for (const phrase of keyPhrases) {
      if (complexityIndicators.high.some(indicator => phrase.toLowerCase().includes(indicator))) {
        complexityScore += 3;
      } else if (complexityIndicators.medium.some(indicator => phrase.toLowerCase().includes(indicator))) {
        complexityScore += 2;
      } else if (complexityIndicators.low.some(indicator => phrase.toLowerCase().includes(indicator))) {
        complexityScore += 1;
      }
    }

    if (complexityScore >= 6) return 'high';
    if (complexityScore >= 3) return 'medium';
    return 'low';
  }

  private calculateUrgencyScore(sentiment: any, urgency?: string): number {
    let score = 0.5; // Base score

    if (urgency) {
      const urgencyScores = { low: 0.2, medium: 0.5, high: 0.8, urgent: 1.0 };
      score = urgencyScores[urgency] || 0.5;
    }

    // Adjust based on sentiment if available
    if (sentiment?.sentiment === 'negative') {
      score = Math.min(score + 0.2, 1.0);
    }

    return score;
  }

  private mapToExpertiseAreas(keyPhrases: string[], entities: any[]): string[] {
    const expertiseMap = new Map([
      ['food safety', ['HACCP', 'pathogen control', 'contamination', 'microbiological', 'safety']],
      ['quality assurance', ['quality control', 'SQF', 'BRC', 'audit', 'inspection']],
      ['regulatory compliance', ['FDA', 'regulation', 'compliance', 'certification', 'approval']],
      ['product development', ['formulation', 'development', 'innovation', 'R&D', 'new product']],
      ['process engineering', ['processing', 'manufacturing', 'equipment', 'optimization', 'efficiency']],
      ['packaging', ['packaging', 'labeling', 'shelf life', 'barrier', 'sustainability']],
      ['nutrition', ['nutritional', 'dietary', 'health claims', 'functional foods', 'supplements']],
      ['supply chain', ['supply chain', 'logistics', 'sourcing', 'procurement', 'traceability']]
    ]);

    const detectedExpertise: string[] = [];
    
    for (const [expertise, keywords] of expertiseMap.entries()) {
      const hasMatch = keyPhrases.some(phrase => 
        keywords.some(keyword => phrase.toLowerCase().includes(keyword.toLowerCase()))
      );
      if (hasMatch) {
        detectedExpertise.push(expertise);
      }
    }

    return detectedExpertise;
  }

  private identifyRiskFactors(text: string, criteria: MatchingCriteria): string[] {
    const riskFactors: string[] = [];

    // Budget constraints
    if (criteria.budget && criteria.budget.max < 10000) {
      riskFactors.push('Limited budget may restrict expert availability');
    }

    // Timeline constraints
    if (criteria.timeline?.urgency === 'urgent') {
      riskFactors.push('Urgent timeline may limit expert selection');
    }

    // Complex requirements
    if (text.toLowerCase().includes('novel') || text.toLowerCase().includes('innovative')) {
      riskFactors.push('Novel requirements may require specialized expertise');
    }

    // Regulatory complexity
    const regulatoryKeywords = ['FDA', 'EU regulation', 'novel food', 'health claims'];
    if (regulatoryKeywords.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()))) {
      riskFactors.push('Complex regulatory requirements identified');
    }

    return riskFactors;
  }

  private async getIndustrySpecificExperts(analyzedRequirements: any): Promise<any[]> {
    try {
      // Check cache first
      const cacheKey = `industry_experts:${analyzedRequirements.industryContext.detectedCategories.join(':')}`;
      const cached = await advancedCacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      const query: any = {
        status: 'active',
        verificationStatus: { $in: ['verified', 'expert'] }
      };

      // Industry focus filtering
      if (analyzedRequirements.industryContext.detectedCategories.length > 0) {
        query['expertise.industryFocus'] = { 
          $in: analyzedRequirements.industryContext.detectedCategories 
        };
      }

      // Certification requirements
      if (analyzedRequirements.complianceRequirements.length > 0) {
        query['certifications.name'] = { 
          $in: analyzedRequirements.complianceRequirements 
        };
      }

      // Required expertise areas
      if (analyzedRequirements.requiredExpertise.length > 0) {
        query['expertise.specializations'] = { 
          $in: analyzedRequirements.requiredExpertise 
        };
      }

      const experts = await ExpertProfile.find(query)
        .populate('services')
        .populate('reviews')
        .lean();

      // Cache for 30 minutes
      await advancedCacheService.set(cacheKey, experts, { 
        ttl: 1800, 
        tags: ['experts', 'industry_filter'] 
      });

      return experts;
    } catch (error) {
      logger.error('Industry-specific expert filtering failed:', error);
      return [];
    }
  }

  private async calculateEnhancedMatchScores(
    experts: any[], 
    analyzedRequirements: any
  ): Promise<EnhancedExpertMatch[]> {
    const matches: EnhancedExpertMatch[] = [];

    for (const expert of experts) {
      try {
        const matchScore = await this.calculateComprehensiveScore(expert, analyzedRequirements);
        matches.push(matchScore);
      } catch (error) {
        logger.error('Score calculation failed for expert:', expert._id, error);
      }
    }

    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  private async calculateComprehensiveScore(
    expert: any, 
    analyzedRequirements: any
  ): Promise<EnhancedExpertMatch> {
    // Industry-specific scoring
    const industryScore = this.calculateIndustrySpecificScore(expert, analyzedRequirements);
    
    // Compliance and certification scoring
    const complianceScore = this.calculateComplianceScore(expert, analyzedRequirements);
    
    // Experience and expertise scoring
    const experienceScore = this.calculateExperienceScore(expert, analyzedRequirements);
    
    // Availability scoring
    const availabilityScore = this.calculateAvailabilityScore(expert, analyzedRequirements);
    
    // Location and logistics scoring
    const locationScore = this.calculateLocationScore(expert, analyzedRequirements);
    
    // Budget compatibility scoring
    const budgetScore = this.calculateBudgetCompatibility(expert, analyzedRequirements);
    
    // Portfolio and past work scoring
    const portfolioScore = this.calculatePortfolioScore(expert, analyzedRequirements);
    
    // Communication and language scoring
    const communicationScore = this.calculateCommunicationScore(expert, analyzedRequirements);

    // Weighted overall score
    const weights = {
      industry: 0.25,
      compliance: 0.20,
      experience: 0.20,
      availability: 0.10,
      location: 0.10,
      budget: 0.10,
      portfolio: 0.03,
      communication: 0.02
    };

    const overallScore = 
      (industryScore * weights.industry) +
      (complianceScore * weights.compliance) +
      (experienceScore * weights.experience) +
      (availabilityScore * weights.availability) +
      (locationScore * weights.location) +
      (budgetScore * weights.budget) +
      (portfolioScore * weights.portfolio) +
      (communicationScore * weights.communication);

    const matchReasons = this.generateMatchReasons(expert, {
      industryScore,
      complianceScore,
      experienceScore,
      availabilityScore,
      locationScore,
      budgetScore
    });

    const confidenceLevel = this.calculateConfidenceLevel({
      industryScore,
      complianceScore,
      experienceScore,
      availabilityScore
    });

    return {
      expert,
      matchScore: Math.round(overallScore * 100) / 100,
      confidenceLevel,
      matchReasons,
      industrySpecificScore: industryScore,
      complianceScore,
      experienceScore,
      availabilityScore,
      locationScore,
      budgetCompatibility: budgetScore,
      riskAssessment: {
        level: 'low', // Will be calculated in risk assessment step
        factors: [],
        mitigationSuggestions: []
      },
      recommendationRank: 0, // Will be set during final ranking
      estimatedProjectFit: overallScore
    };
  }

  private calculateIndustrySpecificScore(expert: any, analyzedRequirements: any): number {
    let score = 0;
    const detectedCategories = analyzedRequirements.industryContext.detectedCategories;
    
    if (!detectedCategories.length) return 0.5; // Neutral if no specific industry detected

    // Check direct industry focus match
    const industryMatches = expert.expertise?.industryFocus?.filter((focus: string) =>
      detectedCategories.some((cat: string) => 
        focus.toLowerCase().includes(cat.toLowerCase()) ||
        cat.toLowerCase().includes(focus.toLowerCase())
      )
    ).length || 0;

    score += (industryMatches / detectedCategories.length) * 0.4;

    // Check specialization relevance
    const specializationMatches = expert.expertise?.specializations?.filter((spec: string) =>
      analyzedRequirements.requiredExpertise.some((req: string) =>
        spec.toLowerCase().includes(req.toLowerCase()) ||
        req.toLowerCase().includes(spec.toLowerCase())
      )
    ).length || 0;

    score += (specializationMatches / Math.max(analyzedRequirements.requiredExpertise.length, 1)) * 0.4;

    // Years of industry experience bonus
    const industryYears = expert.experience?.yearsOfExperience || 0;
    if (industryYears >= 10) score += 0.2;
    else if (industryYears >= 5) score += 0.1;

    return Math.min(score, 1.0);
  }

  private calculateComplianceScore(expert: any, analyzedRequirements: any): number {
    const requiredCompliance = analyzedRequirements.complianceRequirements || [];
    if (!requiredCompliance.length) return 1.0; // No specific requirements

    const expertCertifications = expert.certifications?.map((cert: any) => cert.name.toLowerCase()) || [];
    
    const matchingCertifications = requiredCompliance.filter((req: string) =>
      expertCertifications.some((cert: string) => cert.includes(req.toLowerCase()))
    );

    const baseScore = matchingCertifications.length / requiredCompliance.length;
    
    // Bonus for additional relevant certifications
    const bonusCertifications = ['HACCP', 'SQF', 'BRC', 'IFS', 'ISO 22000'];
    const expertHasBonus = bonusCertifications.some(bonus =>
      expertCertifications.some(cert => cert.includes(bonus.toLowerCase()))
    );

    return Math.min(baseScore + (expertHasBonus ? 0.1 : 0), 1.0);
  }

  private calculateExperienceScore(expert: any, analyzedRequirements: any): number {
    let score = 0;

    // Years of experience
    const years = expert.experience?.yearsOfExperience || 0;
    score += Math.min(years / 15, 0.4); // Max 0.4 for 15+ years

    // Project complexity match
    const complexityLevel = analyzedRequirements.technicalComplexity;
    const expertLevel = expert.experience?.level || 'junior';
    
    const complexityMatch = {
      'low': { 'junior': 1.0, 'mid': 0.9, 'senior': 0.8, 'expert': 0.7 },
      'medium': { 'junior': 0.5, 'mid': 1.0, 'senior': 0.9, 'expert': 0.8 },
      'high': { 'junior': 0.2, 'mid': 0.6, 'senior': 1.0, 'expert': 1.0 }
    };

    score += (complexityMatch[complexityLevel]?.[expertLevel] || 0.5) * 0.3;

    // Rating and reviews
    const rating = expert.profile?.rating || 0;
    score += (rating / 5) * 0.2;

    // Number of completed projects
    const projectCount = expert.experience?.completedProjects || 0;
    score += Math.min(projectCount / 50, 0.1); // Max 0.1 for 50+ projects

    return Math.min(score, 1.0);
  }

  private calculateAvailabilityScore(expert: any, analyzedRequirements: any): number {
    if (!expert.availability) return 0.5;

    let score = 0;

    // Current availability status
    if (expert.availability.isAvailable) {
      score += 0.4;
    } else if (expert.availability.nextAvailableDate) {
      const daysUntilAvailable = Math.ceil(
        (new Date(expert.availability.nextAvailableDate).getTime() - Date.now()) / 
        (1000 * 60 * 60 * 24)
      );
      
      if (daysUntilAvailable <= 7) score += 0.3;
      else if (daysUntilAvailable <= 30) score += 0.2;
      else score += 0.1;
    }

    // Urgency match
    const urgencyScore = analyzedRequirements.urgencyScore || 0.5;
    if (urgencyScore > 0.8 && expert.availability.isAvailable) {
      score += 0.3; // Bonus for immediate availability when urgent
    }

    // Workload capacity
    const currentWorkload = expert.availability.currentWorkload || 0;
    if (currentWorkload < 70) score += 0.2;
    else if (currentWorkload < 90) score += 0.1;

    // Timezone compatibility (if location is specified)
    const timeline = analyzedRequirements.originalCriteria.timeline;
    if (timeline && expert.location?.timezone) {
      score += 0.1; // Bonus for timezone info available
    }

    return Math.min(score, 1.0);
  }

  private calculateLocationScore(expert: any, analyzedRequirements: any): number {
    const criteria = analyzedRequirements.originalCriteria;
    if (!criteria.location) return 1.0; // No location preference

    let score = 0;

    // Remote work capability
    if (criteria.location.remote && expert.workPreferences?.remoteWork) {
      score += 0.5;
    }

    // Geographic proximity
    if (expert.location) {
      if (expert.location.country === criteria.location.country) {
        score += 0.3;
        
        if (criteria.location.state && expert.location.state === criteria.location.state) {
          score += 0.1;
          
          if (criteria.location.city && expert.location.city === criteria.location.city) {
            score += 0.1;
          }
        }
      }
    }

    // Travel willingness
    if (expert.workPreferences?.willingToTravel && !criteria.location.remote) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  private calculateBudgetCompatibility(expert: any, analyzedRequirements: any): number {
    const budget = analyzedRequirements.originalCriteria.budget;
    if (!budget) return 1.0; // No budget specified

    const expertRates = expert.rates;
    if (!expertRates) return 0.5; // No rate information

    // Check hourly rate compatibility
    if (expertRates.hourlyRate) {
      const estimatedHours = 40; // Default estimation
      const estimatedCost = expertRates.hourlyRate * estimatedHours;
      
      if (estimatedCost <= budget.max) {
        return estimatedCost >= budget.min ? 1.0 : 0.8;
      } else {
        return Math.max(0.1, 1 - ((estimatedCost - budget.max) / budget.max));
      }
    }

    // Check project rate compatibility
    if (expertRates.projectRate) {
      if (expertRates.projectRate <= budget.max) {
        return expertRates.projectRate >= budget.min ? 1.0 : 0.8;
      } else {
        return Math.max(0.1, 1 - ((expertRates.projectRate - budget.max) / budget.max));
      }
    }

    return 0.5; // Uncertain compatibility
  }

  private calculatePortfolioScore(expert: any, analyzedRequirements: any): number {
    if (!expert.portfolio || !expert.portfolio.length) return 0.3;

    let score = 0;
    const detectedCategories = analyzedRequirements.industryContext.detectedCategories;

    // Portfolio relevance
    const relevantProjects = expert.portfolio.filter((project: any) =>
      detectedCategories.some((category: string) =>
        project.description?.toLowerCase().includes(category.toLowerCase()) ||
        project.tags?.some((tag: string) => tag.toLowerCase().includes(category.toLowerCase()))
      )
    );

    score += (relevantProjects.length / expert.portfolio.length) * 0.5;

    // Recent work bonus
    const recentProjects = expert.portfolio.filter((project: any) => {
      const projectDate = new Date(project.completedAt || project.createdAt);
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      return projectDate > twoYearsAgo;
    });

    score += (recentProjects.length / expert.portfolio.length) * 0.3;

    // Quality indicators
    const highQualityProjects = expert.portfolio.filter((project: any) =>
      project.rating >= 4.5 || project.outcome === 'successful'
    );

    score += (highQualityProjects.length / expert.portfolio.length) * 0.2;

    return Math.min(score, 1.0);
  }

  private calculateCommunicationScore(expert: any, analyzedRequirements: any): number {
    let score = 0.5; // Base score

    // Language compatibility
    const requiredLanguages = analyzedRequirements.originalCriteria.languagePreferences || ['english'];
    const expertLanguages = expert.languages || ['english'];

    const languageMatch = requiredLanguages.some((reqLang: string) =>
      expertLanguages.some((expertLang: string) =>
        expertLang.toLowerCase().includes(reqLang.toLowerCase())
      )
    );

    if (languageMatch) score += 0.3;

    // Communication style and responsiveness
    if (expert.profile?.responseTime === 'immediate') score += 0.1;
    else if (expert.profile?.responseTime === 'within_hours') score += 0.05;

    // Professional communication indicators
    if (expert.profile?.communicationStyle === 'professional') score += 0.1;

    return Math.min(score, 1.0);
  }

  private generateMatchReasons(expert: any, scores: any): string[] {
    const reasons: string[] = [];

    if (scores.industryScore >= 0.8) {
      reasons.push('Strong industry specialization match');
    }
    if (scores.complianceScore >= 0.9) {
      reasons.push('Excellent certification and compliance coverage');
    }
    if (scores.experienceScore >= 0.8) {
      reasons.push('Extensive relevant experience');
    }
    if (scores.availabilityScore >= 0.8) {
      reasons.push('High availability for your timeline');
    }
    if (scores.budgetScore >= 0.9) {
      reasons.push('Excellent budget compatibility');
    }
    if (expert.profile?.rating >= 4.5) {
      reasons.push(`Outstanding client rating (${expert.profile.rating}/5)`);
    }

    return reasons;
  }

  private calculateConfidenceLevel(scores: any): number {
    const keyScores = [
      scores.industryScore,
      scores.complianceScore,
      scores.experienceScore,
      scores.availabilityScore
    ];

    const avgScore = keyScores.reduce((sum, score) => sum + score, 0) / keyScores.length;
    const consistency = 1 - (Math.max(...keyScores) - Math.min(...keyScores));

    return Math.round((avgScore * 0.7 + consistency * 0.3) * 100) / 100;
  }

  private async performRiskAssessment(
    matches: EnhancedExpertMatch[], 
    criteria: MatchingCriteria
  ): Promise<EnhancedExpertMatch[]> {
    return matches.map(match => {
      const riskFactors: string[] = [];
      const mitigationSuggestions: string[] = [];
      let riskLevel: 'low' | 'medium' | 'high' = 'low';

      // Budget risk
      if (match.budgetCompatibility < 0.7) {
        riskFactors.push('Budget compatibility concerns');
        mitigationSuggestions.push('Consider negotiating project scope or timeline');
        riskLevel = 'medium';
      }

      // Experience risk
      if (match.experienceScore < 0.6) {
        riskFactors.push('Limited relevant experience');
        mitigationSuggestions.push('Consider additional oversight or mentoring');
        riskLevel = 'medium';
      }

      // Availability risk
      if (match.availabilityScore < 0.5 && criteria.timeline?.urgency === 'urgent') {
        riskFactors.push('Availability may not meet urgent timeline');
        mitigationSuggestions.push('Confirm availability before proceeding');
        riskLevel = 'high';
      }

      // Compliance risk
      if (match.complianceScore < 0.8 && criteria.complianceRequirements?.length) {
        riskFactors.push('Incomplete compliance certification coverage');
        mitigationSuggestions.push('Verify additional certifications or plan compliance support');
        riskLevel = 'medium';
      }

      match.riskAssessment = {
        level: riskLevel,
        factors: riskFactors,
        mitigationSuggestions
      };

      return match;
    });
  }

  private async optimizeWithML(
    matches: EnhancedExpertMatch[], 
    criteria: MatchingCriteria
  ): Promise<EnhancedExpertMatch[]> {
    // Apply machine learning optimizations
    // This would integrate with your ML models for continuous improvement
    
    // For now, apply business rules optimization
    return matches.map((match, index) => {
      match.recommendationRank = index + 1;
      
      // Boost matches with excellent past performance
      if (match.expert.profile?.rating >= 4.8 && match.expert.experience?.completedProjects >= 20) {
        match.matchScore = Math.min(match.matchScore * 1.05, 1.0);
      }
      
      // Penalize matches with potential risks
      if (match.riskAssessment.level === 'high') {
        match.matchScore = match.matchScore * 0.9;
      }
      
      return match;
    }).sort((a, b) => b.matchScore - a.matchScore);
  }

  private async cacheMatchingResults(
    criteria: MatchingCriteria, 
    matches: EnhancedExpertMatch[]
  ): Promise<void> {
    const cacheKey = this.generateCacheKey(criteria);
    await advancedCacheService.set(cacheKey, matches, {
      ttl: 3600, // 1 hour
      tags: ['expert_matching', 'ai_results'],
      version: '2.0'
    });
  }

  private generateCacheKey(criteria: MatchingCriteria): string {
    const keyComponents = [
      criteria.industryFocus.join(','),
      criteria.budget?.max || 'unlimited',
      criteria.timeline?.urgency || 'normal',
      criteria.location?.country || 'global'
    ];
    return `enhanced_matching:${keyComponents.join(':')}`;
  }

  /**
   * Get cached matching results if available
   */
  async getCachedMatches(criteria: MatchingCriteria): Promise<EnhancedExpertMatch[] | null> {
    const cacheKey = this.generateCacheKey(criteria);
    return await advancedCacheService.get<EnhancedExpertMatch[]>(cacheKey);
  }

  /**
   * Food industry specific insights
   */
  getFoodIndustryInsights(category: string): FoodIndustrySpecialization | null {
    return this.foodIndustryKnowledgeBase.get(category) || null;
  }

  /**
   * Get compliance requirements for specific regions
   */
  getComplianceRequirements(region: string): string[] {
    return this.complianceDatabase.get(region.toLowerCase()) || [];
  }
}

export const enhancedAIMatchingService = new EnhancedAIMatchingService();