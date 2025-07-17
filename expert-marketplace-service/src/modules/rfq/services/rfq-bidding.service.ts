import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RFQBid, RFQBidDocument, BidStatus } from '../models/rfq-bid.model';
import { RFQService } from './rfq.service';
import { ExpertProfileService } from '../../expert-profile/services/expert-profile.service';
import { CacheService } from '../../cache/services/cache.service';
import { NotificationService } from '../../notification/services/notification.service';

@Injectable()
export class RFQBiddingService {
  private readonly logger = new Logger(RFQBiddingService.name);

  constructor(
    @InjectModel(RFQBid.name) private bidModel: Model<RFQBidDocument>,
    private readonly rfqService: RFQService,
    private readonly expertProfileService: ExpertProfileService,
    private readonly cacheService: CacheService,
    private readonly notificationService: NotificationService,
  ) {}

  async createBid(bidData: {
    rfqId: string;
    expertId: string;
    proposedBudget: any;
    proposedTimeline: any;
    coverLetter: string;
    approach: string;
    attachments?: string[];
    portfolioItems?: string[];
    proposedTeam?: any;
    deliverables: string[];
    terms?: any;
  }): Promise<RFQBidDocument> {
    // Validate RFQ exists and is open for bidding
    const rfq = await this.rfqService.findById(bidData.rfqId);
    if (!rfq || rfq.status !== 'published' && rfq.status !== 'matched') {
      throw new BadRequestException('RFQ is not open for bidding');
    }

    // Check if expert already has a bid for this RFQ
    const existingBid = await this.bidModel.findOne({
      rfqId: bidData.rfqId,
      expertId: new Types.ObjectId(bidData.expertId),
      status: { $nin: [BidStatus.WITHDRAWN, BidStatus.REJECTED] },
    });

    if (existingBid) {
      throw new BadRequestException('You already have an active bid for this RFQ');
    }

    // Create the bid
    const bid = new this.bidModel({
      ...bidData,
      expertId: new Types.ObjectId(bidData.expertId),
      status: BidStatus.DRAFT,
    });

    const savedBid = await bid.save();
    this.logger.log(`Created bid ${savedBid._id} for RFQ ${bidData.rfqId}`);
    
    return savedBid;
  }

  async submitBid(bidId: string): Promise<RFQBidDocument> {
    const bid = await this.bidModel.findById(bidId);
    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    if (bid.status !== BidStatus.DRAFT) {
      throw new BadRequestException('Only draft bids can be submitted');
    }

    // Validate bid completeness
    this.validateBidCompleteness(bid);

    // Calculate bid score
    const score = await this.calculateBidScore(bid);

    // Update bid status
    bid.status = BidStatus.SUBMITTED;
    bid.submittedAt = new Date();
    bid.score = score.overall;
    bid.evaluation = score;

    const submittedBid = await bid.save();

    // Update RFQ analytics
    await this.rfqService.updateAnalytics(bid.rfqId, {
      $inc: { 'analytics.totalBids': 1 },
    });

    // Send notification
    await this.notificationService.sendNewBidNotification(bid.rfqId, bidId);

    // Clear caches
    await this.cacheService.del(`bids:rfq:${bid.rfqId}`);

    this.logger.log(`Submitted bid ${bidId} for RFQ ${bid.rfqId}`);
    return submittedBid;
  }

  private validateBidCompleteness(bid: RFQBidDocument): void {
    const errors: string[] = [];

    if (!bid.proposedBudget || !bid.proposedBudget.amount) {
      errors.push('Proposed budget is required');
    }

    if (!bid.proposedTimeline || !bid.proposedTimeline.startDate || !bid.proposedTimeline.endDate) {
      errors.push('Proposed timeline is required');
    }

    if (!bid.coverLetter || bid.coverLetter.length < 100) {
      errors.push('Cover letter must be at least 100 characters');
    }

    if (!bid.approach || bid.approach.length < 100) {
      errors.push('Approach description must be at least 100 characters');
    }

    if (!bid.deliverables || bid.deliverables.length === 0) {
      errors.push('At least one deliverable must be specified');
    }

    if (errors.length > 0) {
      throw new BadRequestException(`Bid validation failed: ${errors.join(', ')}`);
    }
  }

  private async calculateBidScore(bid: RFQBidDocument): Promise<any> {
    const rfq = await this.rfqService.findById(bid.rfqId);
    const expert = await this.expertProfileService.findById(bid.expertId.toString());

    const evaluation = {
      budgetScore: 0,
      timelineScore: 0,
      experienceScore: 0,
      proposalScore: 0,
      overallScore: 0,
    };

    // Budget scoring (0-25 points)
    const rfqAvgBudget = (rfq.budget.min + rfq.budget.max) / 2;
    const budgetDiff = Math.abs(bid.proposedBudget.amount - rfqAvgBudget) / rfqAvgBudget;
    
    if (bid.proposedBudget.amount >= rfq.budget.min && bid.proposedBudget.amount <= rfq.budget.max) {
      evaluation.budgetScore = 25 - (budgetDiff * 10);
    } else if (bid.proposedBudget.amount < rfq.budget.min) {
      evaluation.budgetScore = 20; // Lower bid gets decent score
    } else {
      evaluation.budgetScore = Math.max(0, 15 - (budgetDiff * 20));
    }

    // Timeline scoring (0-25 points)
    const proposedDuration = this.calculateDurationInDays(
      bid.proposedTimeline.startDate,
      bid.proposedTimeline.endDate,
    );
    const rfqDuration = this.calculateDurationInDays(
      rfq.timeline.startDate,
      rfq.timeline.endDate,
    );
    const timelineDiff = Math.abs(proposedDuration - rfqDuration) / rfqDuration;
    
    if (timelineDiff <= 0.1) {
      evaluation.timelineScore = 25;
    } else if (timelineDiff <= 0.2) {
      evaluation.timelineScore = 20;
    } else {
      evaluation.timelineScore = Math.max(0, 15 - (timelineDiff * 20));
    }

    // Experience scoring (0-25 points)
    evaluation.experienceScore = Math.min(25, (expert.experience?.yearsOfExperience || 0) * 2.5);
    
    if (expert.rating?.average) {
      evaluation.experienceScore = (evaluation.experienceScore * 0.7) + (expert.rating.average * 5 * 0.3);
    }

    // Proposal quality scoring (0-25 points)
    let proposalScore = 0;
    
    // Cover letter length and quality
    if (bid.coverLetter.length >= 500) proposalScore += 5;
    else if (bid.coverLetter.length >= 300) proposalScore += 3;
    else proposalScore += 1;
    
    // Approach detail
    if (bid.approach.length >= 500) proposalScore += 5;
    else if (bid.approach.length >= 300) proposalScore += 3;
    else proposalScore += 1;
    
    // Deliverables
    proposalScore += Math.min(5, bid.deliverables.length);
    
    // Attachments and portfolio
    if (bid.attachments && bid.attachments.length > 0) proposalScore += 3;
    if (bid.portfolioItems && bid.portfolioItems.length > 0) proposalScore += 3;
    
    // Team proposal
    if (bid.proposedTeam && bid.proposedTeam.teamSize > 1) proposalScore += 2;
    
    // Terms
    if (bid.terms && bid.terms.guarantee) proposalScore += 2;
    
    evaluation.proposalScore = Math.min(25, proposalScore);

    // Calculate overall score
    evaluation.overallScore = 
      evaluation.budgetScore + 
      evaluation.timelineScore + 
      evaluation.experienceScore + 
      evaluation.proposalScore;

    return evaluation;
  }

  private calculateDurationInDays(startDate: Date, endDate: Date): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  async updateBid(
    bidId: string,
    expertId: string,
    updateData: Partial<RFQBidDocument>,
  ): Promise<RFQBidDocument> {
    const bid = await this.bidModel.findOne({
      _id: bidId,
      expertId: new Types.ObjectId(expertId),
    });

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    if (bid.status !== BidStatus.DRAFT) {
      throw new BadRequestException('Only draft bids can be updated');
    }

    Object.assign(bid, updateData);
    const updatedBid = await bid.save();

    // Clear cache
    await this.cacheService.del(`bid:${bidId}`);

    return updatedBid;
  }

  async withdrawBid(bidId: string, expertId: string): Promise<RFQBidDocument> {
    const bid = await this.bidModel.findOne({
      _id: bidId,
      expertId: new Types.ObjectId(expertId),
    });

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    if (bid.status === BidStatus.ACCEPTED) {
      throw new BadRequestException('Cannot withdraw accepted bid');
    }

    bid.status = BidStatus.WITHDRAWN;
    const withdrawnBid = await bid.save();

    // Update RFQ analytics if bid was submitted
    if (bid.submittedAt) {
      await this.rfqService.updateAnalytics(bid.rfqId, {
        $inc: { 'analytics.totalBids': -1 },
      });
    }

    // Clear caches
    await this.cacheService.del(`bid:${bidId}`);
    await this.cacheService.del(`bids:rfq:${bid.rfqId}`);

    this.logger.log(`Withdrew bid ${bidId} for RFQ ${bid.rfqId}`);
    return withdrawnBid;
  }

  async acceptBid(bidId: string): Promise<RFQBidDocument> {
    const bid = await this.bidModel.findById(bidId);
    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    bid.status = BidStatus.ACCEPTED;
    bid.reviewedAt = new Date();
    
    const acceptedBid = await bid.save();
    
    // Send notification
    await this.notificationService.sendBidAcceptedNotification(
      bidId,
      bid.expertId.toString(),
    );

    return acceptedBid;
  }

  async rejectBid(bidId: string, reason: string): Promise<RFQBidDocument> {
    const bid = await this.bidModel.findById(bidId);
    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    bid.status = BidStatus.REJECTED;
    bid.reviewedAt = new Date();
    bid.rejectionReason = reason;
    
    const rejectedBid = await bid.save();
    
    // Send notification
    await this.notificationService.sendBidRejectedNotification(
      bidId,
      bid.expertId.toString(),
      reason,
    );

    return rejectedBid;
  }

  async rejectOtherBids(rfqId: string, acceptedBidId: string): Promise<void> {
    const bids = await this.bidModel.find({
      rfqId,
      _id: { $ne: acceptedBidId },
      status: { $in: [BidStatus.SUBMITTED, BidStatus.SHORTLISTED] },
    });

    for (const bid of bids) {
      await this.rejectBid(bid._id.toString(), 'Another bid was selected');
    }
  }

  async cancelAllBidsForRFQ(rfqId: string): Promise<void> {
    await this.bidModel.updateMany(
      {
        rfqId,
        status: { $in: [BidStatus.DRAFT, BidStatus.SUBMITTED, BidStatus.SHORTLISTED] },
      },
      {
        $set: { status: BidStatus.WITHDRAWN },
      },
    );

    // Clear caches
    await this.cacheService.del(`bids:rfq:${rfqId}`);
  }

  async finalizeBidsForRFQ(rfqId: string): Promise<void> {
    await this.bidModel.updateMany(
      {
        rfqId,
        status: BidStatus.SUBMITTED,
      },
      {
        $set: { status: BidStatus.UNDER_REVIEW },
      },
    );
  }

  async expireBidsForRFQ(rfqId: string): Promise<void> {
    await this.bidModel.updateMany(
      {
        rfqId,
        status: { $in: [BidStatus.DRAFT, BidStatus.SUBMITTED] },
      },
      {
        $set: { 
          status: BidStatus.WITHDRAWN,
          metadata: { expiredAt: new Date() },
        },
      },
    );
  }

  async getBidsForRFQ(rfqId: string): Promise<RFQBidDocument[]> {
    const cacheKey = `bids:rfq:${rfqId}`;
    const cached = await this.cacheService.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const bids = await this.bidModel
      .find({ rfqId })
      .populate('expertId')
      .sort({ score: -1, submittedAt: -1 })
      .exec();

    await this.cacheService.set(cacheKey, bids, 300); // Cache for 5 minutes
    return bids;
  }

  async getBidsForExpert(expertId: string): Promise<RFQBidDocument[]> {
    return this.bidModel
      .find({ expertId: new Types.ObjectId(expertId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getBidById(bidId: string): Promise<RFQBidDocument> {
    const cacheKey = `bid:${bidId}`;
    const cached = await this.cacheService.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const bid = await this.bidModel
      .findById(bidId)
      .populate('expertId');

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    await this.cacheService.set(cacheKey, bid, 300); // Cache for 5 minutes
    return bid;
  }
}