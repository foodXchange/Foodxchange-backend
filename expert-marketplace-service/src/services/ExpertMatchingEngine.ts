import { TextAnalyticsClient } from '@azure/ai-text-analytics';
import { ExpertProfile, ExpertService } from '../models';
import { Logger } from '../utils/logger';
import { config } from '../config';

const logger = new Logger('ExpertMatchingEngine');

interface ExpertMatch {
  expertId: string;
  matchScore: number;
  matchReasons: string[];
  expertise: string[];
  availability: boolean;
  estimatedResponseTime: number;
  pricing: {
    hourlyRate: number;
    estimatedProjectCost?: number;
  };
}

interface MatchingCriteria {
  requiredExpertise: string[];
  preferredExpertise: string[];
  budgetRange?: { min: number; max: number };
  urgency: 'low' | 'medium' | 'high' | 'critical';
  projectComplexity: number; // 1-10
  requiredCertifications?: string[];
  preferredLanguages?: string[];
  location?: {
    country?: string;
    maxDistanceKm?: number;
  };
}

export class ExpertMatchingEngine {
  private textAnalyticsClient: TextAnalyticsClient;

  constructor() {
    if (config.azure.textAnalytics.endpoint && config.azure.textAnalytics.key) {
      this.textAnalyticsClient = new TextAnalyticsClient(
        config.azure.textAnalytics.endpoint,
        {
          key: config.azure.textAnalytics.key,
        }
      );
    }
  }

  /**
   * Analyze RFQ and find matching experts
   */
  async analyzeRFQAndMatch(rfqData: {
    title: string;
    description: string;
    requirements: string[];
    budget?: number;
    urgency: string;
  }): Promise<ExpertMatch[]> {
    try {
      // Extract key phrases and entities from RFQ
      const extractedData = await this.extractRequirements(
        rfqData.title + ' ' + rfqData.description
      );

      // Build matching criteria
      const criteria: MatchingCriteria = {
        requiredExpertise: extractedData.keyPhrases,
        preferredExpertise: rfqData.requirements,
        budgetRange: rfqData.budget ? {
          min: rfqData.budget * 0.7,
          max: rfqData.budget * 1.3
        } : undefined,
        urgency: rfqData.urgency as any,
        projectComplexity: this.assessComplexity(rfqData),
      };

      // Find and score experts
      const matches = await this.findMatchingExperts(criteria);

      // Sort by match score
      return matches.sort((a, b) => b.matchScore - a.matchScore);
    } catch (error) {
      logger.error('Error in RFQ analysis and matching', error);
      throw error;
    }
  }

  /**
   * Score expert fit for specific requirements
   */
  async scoreExpertFit(
    expertId: string, 
    requirements: string[]
  ): Promise<number> {
    const expert = await ExpertProfile.findById(expertId);
    if (!expert) return 0;

    let score = 0;
    const maxScore = 100;

    // Expertise match (40% weight)
    const expertiseScore = this.calculateExpertiseMatch(
      expert.expertise,
      requirements
    );
    score += expertiseScore * 0.4;

    // Experience level (20% weight)
    const experienceScore = this.calculateExperienceScore(expert);
    score += experienceScore * 0.2;

    // Rating and reviews (20% weight)
    const ratingScore = (expert.rating.average / 5) * 100;
    score += ratingScore * 0.2;

    // Availability (10% weight)
    const availabilityScore = await this.calculateAvailabilityScore(expertId);
    score += availabilityScore * 0.1;

    // Response time (10% weight)
    const responseScore = this.calculateResponseScore(expert.responseTime);
    score += responseScore * 0.1;

    return Math.min(score, maxScore);
  }

  /**
   * Predict project success probability
   */
  async predictProjectSuccess(
    expertId: string,
    projectType: string,
    projectComplexity: number
  ): Promise<number> {
    const expert = await ExpertProfile.findById(expertId)
      .populate('collaborations');
    
    if (!expert) return 0;

    // Historical success rate
    const historicalSuccess = await this.getHistoricalSuccessRate(
      expertId,
      projectType
    );

    // Complexity match
    const complexityMatch = this.assessComplexityMatch(
      expert,
      projectComplexity
    );

    // Current workload impact
    const workloadImpact = await this.assessWorkloadImpact(expertId);

    // Calculate weighted success probability
    const successProbability = 
      (historicalSuccess * 0.5) +
      (complexityMatch * 0.3) +
      (workloadImpact * 0.2);

    return Math.round(successProbability * 100) / 100;
  }

  /**
   * Extract requirements using Azure Text Analytics
   */
  private async extractRequirements(text: string): Promise<{
    keyPhrases: string[];
    entities: any[];
  }> {
    if (!this.textAnalyticsClient) {
      // Fallback to simple keyword extraction
      return this.simpleKeywordExtraction(text);
    }

    try {
      const documents = [{ id: '1', text, language: 'en' }];
      
      const [keyPhraseResult, entityResult] = await Promise.all([
        this.textAnalyticsClient.extractKeyPhrases(documents),
        this.textAnalyticsClient.recognizeEntities(documents)
      ]);

      const keyPhrases = keyPhraseResult[0]?.keyPhrases || [];
      const entities = entityResult[0]?.entities || [];

      return {
        keyPhrases: this.filterFoodIndustryKeywords(keyPhrases),
        entities: entities.filter(e => 
          ['Product', 'Organization', 'Skill'].includes(e.category)
        )
      };
    } catch (error) {
      logger.error('Azure Text Analytics error', error);
      return this.simpleKeywordExtraction(text);
    }
  }

  /**
   * Simple keyword extraction fallback
   */
  private simpleKeywordExtraction(text: string): {
    keyPhrases: string[];
    entities: any[];
  } {
    const foodKeywords = [
      'haccp', 'fda', 'usda', 'organic', 'halal', 'kosher',
      'food safety', 'quality', 'compliance', 'certification',
      'audit', 'inspection', 'testing', 'packaging', 'labeling',
      'nutrition', 'allergen', 'shelf life', 'cold chain',
      'import', 'export', 'sourcing', 'sustainability'
    ];

    const keyPhrases = foodKeywords.filter(keyword => 
      text.toLowerCase().includes(keyword)
    );

    return { keyPhrases, entities: [] };
  }

  /**
   * Filter for food industry specific keywords
   */
  private filterFoodIndustryKeywords(keywords: string[]): string[] {
    const relevantCategories = new Set([
      'food', 'safety', 'quality', 'compliance', 'certification',
      'haccp', 'fda', 'usda', 'organic', 'testing', 'audit',
      'inspection', 'packaging', 'nutrition', 'allergen',
      'import', 'export', 'logistics', 'cold chain'
    ]);

    return keywords.filter(keyword => {
      const lowerKeyword = keyword.toLowerCase();
      return Array.from(relevantCategories).some(category => 
        lowerKeyword.includes(category)
      );
    });
  }

  /**
   * Find matching experts based on criteria
   */
  private async findMatchingExperts(
    criteria: MatchingCriteria
  ): Promise<ExpertMatch[]> {
    // Build query
    const query: any = {
      status: 'active',
      verificationStatus: 'verified',
      isActive: true
    };

    // Add expertise filter
    if (criteria.requiredExpertise.length > 0) {
      query['expertise.category'] = {
        $in: criteria.requiredExpertise
      };
    }

    // Add budget filter
    if (criteria.budgetRange) {
      query['hourlyRate.min'] = { $lte: criteria.budgetRange.max };
      query['hourlyRate.max'] = { $gte: criteria.budgetRange.min };
    }

    // Add location filter
    if (criteria.location?.country) {
      query['location.country'] = criteria.location.country;
    }

    // Find experts
    const experts = await ExpertProfile.find(query)
      .limit(50)
      .lean();

    // Score and format matches
    const matches = await Promise.all(
      experts.map(async (expert) => {
        const matchScore = await this.calculateMatchScore(
          expert,
          criteria
        );

        return {
          expertId: expert._id.toString(),
          matchScore,
          matchReasons: this.generateMatchReasons(expert, criteria),
          expertise: expert.expertise.map(e => e.category),
          availability: await this.checkAvailability(expert._id),
          estimatedResponseTime: expert.responseTime,
          pricing: {
            hourlyRate: expert.hourlyRate.min,
            estimatedProjectCost: this.estimateProjectCost(
              expert,
              criteria.projectComplexity
            )
          }
        };
      })
    );

    return matches.filter(match => match.matchScore > 50);
  }

  /**
   * Calculate match score for an expert
   */
  private async calculateMatchScore(
    expert: any,
    criteria: MatchingCriteria
  ): Promise<number> {
    let score = 0;

    // Expertise match (40%)
    const expertiseMatch = this.calculateExpertiseMatch(
      expert.expertise,
      [...criteria.requiredExpertise, ...criteria.preferredExpertise]
    );
    score += expertiseMatch * 0.4;

    // Price match (20%)
    if (criteria.budgetRange) {
      const priceMatch = this.calculatePriceMatch(
        expert.hourlyRate,
        criteria.budgetRange
      );
      score += priceMatch * 0.2;
    } else {
      score += 20; // Full points if no budget specified
    }

    // Rating (15%)
    score += (expert.rating.average / 5) * 15;

    // Experience (15%)
    const experienceScore = this.calculateExperienceScore(expert);
    score += experienceScore * 0.15;

    // Availability for urgency (10%)
    if (criteria.urgency === 'critical' || criteria.urgency === 'high') {
      const isAvailable = await this.checkAvailability(expert._id);
      score += isAvailable ? 10 : 0;
    } else {
      score += 10; // Full points for non-urgent
    }

    return Math.round(score);
  }

  /**
   * Calculate expertise match percentage
   */
  private calculateExpertiseMatch(
    expertExpertise: any[],
    requiredExpertise: string[]
  ): number {
    if (requiredExpertise.length === 0) return 100;

    const expertCategories = new Set(
      expertExpertise.map(e => e.category.toLowerCase())
    );

    const matches = requiredExpertise.filter(req => 
      expertCategories.has(req.toLowerCase())
    ).length;

    return (matches / requiredExpertise.length) * 100;
  }

  /**
   * Other helper methods...
   */
  private calculateExperienceScore(expert: any): number {
    const factors = {
      yearsOfExperience: Math.min(expert.expertise[0]?.yearsOfExperience || 0, 10) * 5,
      completedProjects: Math.min(expert.completedProjects, 50) * 0.5,
      certifications: expert.expertise.reduce((sum: number, e: any) => 
        sum + (e.certifications?.length || 0), 0
      ) * 5
    };

    return Math.min(
      factors.yearsOfExperience + 
      factors.completedProjects + 
      factors.certifications,
      100
    );
  }

  private calculatePriceMatch(
    expertRate: { min: number; max: number },
    budgetRange: { min: number; max: number }
  ): number {
    const expertMid = (expertRate.min + expertRate.max) / 2;
    const budgetMid = (budgetRange.min + budgetRange.max) / 2;
    
    const difference = Math.abs(expertMid - budgetMid);
    const maxDifference = budgetRange.max - budgetRange.min;
    
    if (difference === 0) return 100;
    if (difference >= maxDifference) return 0;
    
    return 100 - (difference / maxDifference) * 100;
  }

  private async checkAvailability(expertId: string): Promise<boolean> {
    // Check if expert has available slots in next 48 hours
    const nextTwoDays = new Date();
    nextTwoDays.setHours(nextTwoDays.getHours() + 48);

    const availability = await ExpertProfile.findById(expertId)
      .select('availability lastActiveAt');

    if (!availability) return false;

    // Check if active in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    return availability.lastActiveAt > sevenDaysAgo;
  }

  private generateMatchReasons(
    expert: any,
    criteria: MatchingCriteria
  ): string[] {
    const reasons = [];

    // Expertise matches
    const matchedExpertise = expert.expertise.filter((e: any) =>
      criteria.requiredExpertise.includes(e.category)
    );
    
    if (matchedExpertise.length > 0) {
      reasons.push(`Expert in ${matchedExpertise.map((e: any) => e.category).join(', ')}`);
    }

    // High rating
    if (expert.rating.average >= 4.5) {
      reasons.push(`Highly rated (${expert.rating.average}/5)`);
    }

    // Experience
    if (expert.completedProjects > 20) {
      reasons.push(`${expert.completedProjects} completed projects`);
    }

    // Quick response
    if (expert.responseTime <= 2) {
      reasons.push('Fast response time');
    }

    return reasons;
  }

  private estimateProjectCost(
    expert: any,
    complexity: number
  ): number {
    const baseHours = complexity * 10; // Rough estimate
    const hourlyRate = (expert.hourlyRate.min + expert.hourlyRate.max) / 2;
    return baseHours * hourlyRate;
  }

  private assessComplexity(rfqData: any): number {
    let complexity = 5; // Base complexity

    // Adjust based on requirements
    if (rfqData.requirements.length > 10) complexity += 2;
    if (rfqData.requirements.length > 20) complexity += 2;
    
    // Adjust based on urgency
    if (rfqData.urgency === 'critical') complexity += 1;
    
    return Math.min(complexity, 10);
  }

  private async getHistoricalSuccessRate(
    expertId: string,
    projectType: string
  ): Promise<number> {
    // Implementation would query historical collaboration data
    // For now, return a mock value
    return 0.85;
  }

  private assessComplexityMatch(
    expert: any,
    projectComplexity: number
  ): number {
    // Assess if expert's experience matches project complexity
    const expertLevel = expert.completedProjects > 50 ? 10 : 
                       expert.completedProjects > 20 ? 7 : 5;
    
    const difference = Math.abs(expertLevel - projectComplexity);
    return 1 - (difference / 10);
  }

  private async assessWorkloadImpact(expertId: string): Promise<number> {
    // Check current active collaborations
    // Return value between 0-1 (1 = fully available)
    return 0.8;
  }

  private calculateAvailabilityScore(expertId: string): Promise<number> {
    // Implementation would check calendar availability
    return Promise.resolve(80);
  }

  private calculateResponseScore(responseTime: number): number {
    if (responseTime <= 1) return 100;
    if (responseTime <= 4) return 80;
    if (responseTime <= 12) return 60;
    if (responseTime <= 24) return 40;
    return 20;
  }
}