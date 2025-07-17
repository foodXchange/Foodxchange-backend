import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RFQMatch, RFQMatchDocument, MatchType, MatchStatus } from '../models/rfq-match.model';
import { RFQService } from './rfq.service';
import { ExpertProfileService } from '../../expert-profile/services/expert-profile.service';
import { CacheService } from '../../cache/services/cache.service';
import * as geolib from 'geolib';

@Injectable()
export class RFQMatchingService {
  private readonly logger = new Logger(RFQMatchingService.name);

  constructor(
    @InjectModel(RFQMatch.name) private matchModel: Model<RFQMatchDocument>,
    private readonly rfqService: RFQService,
    private readonly expertProfileService: ExpertProfileService,
    private readonly cacheService: CacheService,
  ) {}

  async findMatchesForRFQ(rfqId: string): Promise<RFQMatchDocument[]> {
    this.logger.log(`Starting matching process for RFQ: ${rfqId}`);

    // Get RFQ details
    const rfq = await this.rfqService.findById(rfqId);

    // Get potential experts
    const experts = await this.expertProfileService.findPotentialMatches({
      categories: rfq.categories,
      location: rfq.location,
      budget: rfq.budget,
      requirements: rfq.requirements,
    });

    this.logger.log(`Found ${experts.length} potential experts for RFQ: ${rfqId}`);

    // Calculate match scores and create matches
    const matches: RFQMatchDocument[] = [];
    
    for (const expert of experts) {
      const matchScore = await this.calculateMatchScore(rfq, expert);
      
      if (matchScore.total >= 0.6) { // 60% minimum match threshold
        const match = await this.createMatch({
          rfqId,
          expertId: expert._id,
          matchType: MatchType.AUTO_MATCHED,
          matchScore: matchScore.total,
          scoreBreakdown: matchScore.breakdown,
          matchReasons: matchScore.reasons,
        });
        
        matches.push(match);
        
        // Add expert to RFQ's matched experts
        await this.rfqService.addMatchedExpert(rfqId, expert._id.toString());
      }
    }

    this.logger.log(`Created ${matches.length} matches for RFQ: ${rfqId}`);
    return matches;
  }

  private async calculateMatchScore(rfq: any, expert: any): Promise<{
    total: number;
    breakdown: any;
    reasons: string[];
  }> {
    const breakdown = {
      categoryMatch: 0,
      locationMatch: 0,
      budgetMatch: 0,
      timelineMatch: 0,
      skillsMatch: 0,
      experienceMatch: 0,
      ratingMatch: 0,
      availabilityMatch: 0,
    };
    const reasons: string[] = [];

    // Category matching (30% weight)
    const categoryIntersection = rfq.categories.filter((cat: string) =>
      expert.specializations.some((spec: any) => spec.category === cat),
    );
    breakdown.categoryMatch = (categoryIntersection.length / rfq.categories.length) * 0.3;
    if (categoryIntersection.length > 0) {
      reasons.push(`Expert specializes in ${categoryIntersection.join(', ')}`);
    }

    // Location matching (20% weight)
    if (rfq.location?.coordinates && expert.serviceAreas?.length > 0) {
      const distance = this.calculateMinDistance(rfq.location.coordinates, expert.serviceAreas);
      if (distance <= 50000) { // Within 50km
        breakdown.locationMatch = 0.2;
        reasons.push('Expert serves your location');
      } else if (distance <= 100000) { // Within 100km
        breakdown.locationMatch = 0.1;
        reasons.push('Expert is nearby your location');
      }
    } else if (expert.serviceAreas?.some((area: any) => area.isRemote)) {
      breakdown.locationMatch = 0.15;
      reasons.push('Expert offers remote services');
    }

    // Budget matching (15% weight)
    const expertRate = expert.pricing?.hourlyRate || 0;
    const avgBudget = (rfq.budget.min + rfq.budget.max) / 2;
    const estimatedHours = this.estimateProjectHours(rfq);
    const estimatedCost = expertRate * estimatedHours;
    
    if (estimatedCost >= rfq.budget.min && estimatedCost <= rfq.budget.max) {
      breakdown.budgetMatch = 0.15;
      reasons.push('Expert rate fits your budget');
    } else if (estimatedCost < rfq.budget.min * 1.2) {
      breakdown.budgetMatch = 0.1;
      reasons.push('Expert rate is competitive');
    }

    // Timeline matching (10% weight)
    const rfqDuration = this.calculateDurationInDays(rfq.timeline.startDate, rfq.timeline.endDate);
    const expertAvailable = this.checkExpertAvailability(expert, rfq.timeline);
    
    if (expertAvailable) {
      breakdown.timelineMatch = 0.1;
      reasons.push('Expert is available for your timeline');
    }

    // Skills matching (10% weight)
    if (rfq.requirements?.specificSkills?.length > 0) {
      const skillMatches = rfq.requirements.specificSkills.filter((skill: string) =>
        expert.skills?.some((expertSkill: any) => 
          expertSkill.name.toLowerCase().includes(skill.toLowerCase())
        ),
      );
      breakdown.skillsMatch = (skillMatches.length / rfq.requirements.specificSkills.length) * 0.1;
      if (skillMatches.length > 0) {
        reasons.push(`Expert has required skills: ${skillMatches.join(', ')}`);
      }
    } else {
      breakdown.skillsMatch = 0.1; // Full score if no specific skills required
    }

    // Experience matching (5% weight)
    if (rfq.requirements?.requiredExperience) {
      if (expert.experience?.yearsOfExperience >= rfq.requirements.requiredExperience) {
        breakdown.experienceMatch = 0.05;
        reasons.push(`Expert has ${expert.experience.yearsOfExperience} years of experience`);
      }
    } else {
      breakdown.experienceMatch = 0.05; // Full score if no experience requirement
    }

    // Rating matching (5% weight)
    if (rfq.requirements?.minRating) {
      if (expert.rating?.average >= rfq.requirements.minRating) {
        breakdown.ratingMatch = 0.05;
        reasons.push(`Expert has ${expert.rating.average.toFixed(1)} star rating`);
      }
    } else if (expert.rating?.average >= 4.0) {
      breakdown.ratingMatch = 0.05;
      reasons.push(`Expert has excellent ${expert.rating.average.toFixed(1)} star rating`);
    }

    // Availability matching (5% weight)
    if (expert.availability?.isAvailable) {
      breakdown.availabilityMatch = 0.05;
      reasons.push('Expert is currently available');
    }

    // Calculate total score
    const total = Object.values(breakdown).reduce((sum, score) => sum + score, 0);

    return { total, breakdown, reasons };
  }

  private calculateMinDistance(
    rfqCoordinates: { latitude: number; longitude: number },
    serviceAreas: any[],
  ): number {
    let minDistance = Infinity;

    for (const area of serviceAreas) {
      if (area.coordinates) {
        const distance = geolib.getDistance(
          { latitude: rfqCoordinates.latitude, longitude: rfqCoordinates.longitude },
          { latitude: area.coordinates.latitude, longitude: area.coordinates.longitude },
        );
        minDistance = Math.min(minDistance, distance);
      }
    }

    return minDistance;
  }

  private estimateProjectHours(rfq: any): number {
    // Simple estimation based on project duration
    const durationDays = this.calculateDurationInDays(
      rfq.timeline.startDate,
      rfq.timeline.endDate,
    );
    
    // Assume 6 hours per day for consulting work
    return durationDays * 6;
  }

  private calculateDurationInDays(startDate: Date, endDate: Date): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private checkExpertAvailability(expert: any, timeline: any): boolean {
    if (!expert.availability?.isAvailable) {
      return false;
    }

    // Check if expert has blocked dates that conflict with timeline
    if (expert.availability?.blockedDates) {
      const timelineStart = new Date(timeline.startDate);
      const timelineEnd = new Date(timeline.endDate);
      
      for (const blockedDate of expert.availability.blockedDates) {
        const blocked = new Date(blockedDate);
        if (blocked >= timelineStart && blocked <= timelineEnd) {
          return false;
        }
      }
    }

    return true;
  }

  async createMatch(matchData: {
    rfqId: string;
    expertId: Types.ObjectId;
    matchType: MatchType;
    matchScore: number;
    scoreBreakdown: any;
    matchReasons: string[];
  }): Promise<RFQMatchDocument> {
    const match = new this.matchModel({
      ...matchData,
      status: MatchStatus.PENDING,
      notifications: {
        emailSent: false,
        smsSent: false,
        pushSent: false,
        inAppSent: false,
      },
    });

    return match.save();
  }

  async updateMatchStatus(
    matchId: string,
    status: MatchStatus,
    response?: string,
  ): Promise<RFQMatchDocument> {
    const updateData: any = { status };
    
    if (status === MatchStatus.NOTIFIED) {
      updateData.notifiedAt = new Date();
    } else if (status === MatchStatus.VIEWED) {
      updateData.viewedAt = new Date();
    } else if (status === MatchStatus.INTERESTED || status === MatchStatus.NOT_INTERESTED) {
      updateData.respondedAt = new Date();
      if (response) {
        updateData.response = response;
      }
    }

    const match = await this.matchModel.findByIdAndUpdate(
      matchId,
      { $set: updateData },
      { new: true },
    );

    return match;
  }

  async getMatchesForExpert(expertId: string): Promise<RFQMatchDocument[]> {
    return this.matchModel
      .find({ expertId: new Types.ObjectId(expertId) })
      .sort({ createdAt: -1 })
      .populate('rfqId')
      .exec();
  }

  async getMatchesForRFQ(rfqId: string): Promise<RFQMatchDocument[]> {
    return this.matchModel
      .find({ rfqId })
      .sort({ matchScore: -1 })
      .populate('expertId')
      .exec();
  }
}