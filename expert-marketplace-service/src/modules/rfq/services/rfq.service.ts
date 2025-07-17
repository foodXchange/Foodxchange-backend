import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RFQ, RFQDocument, RFQStatus } from '../models/rfq.model';
import { CacheService } from '../../cache/services/cache.service';

@Injectable()
export class RFQService {
  private readonly logger = new Logger(RFQService.name);

  constructor(
    @InjectModel(RFQ.name) private rfqModel: Model<RFQDocument>,
    private readonly cacheService: CacheService,
  ) {}

  async createFromWebhook(data: any): Promise<RFQDocument> {
    const rfq = new this.rfqModel({
      rfqId: data.id,
      title: data.title,
      description: data.description,
      buyerId: data.buyerId,
      buyerName: data.buyerName,
      buyerEmail: data.buyerEmail,
      buyerPhone: data.buyerPhone,
      categories: data.categories || [],
      tags: data.tags || [],
      budget: {
        min: data.budget?.min || 0,
        max: data.budget?.max || 0,
        currency: data.budget?.currency || 'USD',
      },
      timeline: {
        startDate: new Date(data.timeline?.startDate),
        endDate: new Date(data.timeline?.endDate),
        milestones: data.timeline?.milestones || [],
      },
      location: data.location || {},
      attachments: data.attachments || [],
      requirements: data.requirements || {},
      status: RFQStatus.DRAFT,
      priority: data.priority || 'medium',
      metadata: data.metadata || {},
      analytics: {
        totalBids: 0,
        averageBidAmount: 0,
        viewCount: 0,
        lastViewedAt: new Date(),
      },
    });

    const savedRFQ = await rfq.save();
    this.logger.log(`Created RFQ from webhook: ${savedRFQ.rfqId}`);
    return savedRFQ;
  }

  async updateFromWebhook(rfqId: string, data: any): Promise<RFQDocument> {
    const updateData: any = {};

    if (data.title) updateData.title = data.title;
    if (data.description) updateData.description = data.description;
    if (data.categories) updateData.categories = data.categories;
    if (data.tags) updateData.tags = data.tags;
    if (data.budget) updateData.budget = data.budget;
    if (data.timeline) updateData.timeline = data.timeline;
    if (data.location) updateData.location = data.location;
    if (data.attachments) updateData.attachments = data.attachments;
    if (data.requirements) updateData.requirements = data.requirements;
    if (data.priority) updateData.priority = data.priority;

    const rfq = await this.rfqModel.findOneAndUpdate(
      { rfqId },
      { $set: updateData },
      { new: true },
    );

    if (!rfq) {
      throw new NotFoundException(`RFQ with ID ${rfqId} not found`);
    }

    this.logger.log(`Updated RFQ from webhook: ${rfqId}`);
    return rfq;
  }

  async updateStatus(rfqId: string, status: string): Promise<RFQDocument> {
    const updateData: any = { status };

    if (status === 'published') {
      updateData.publishedAt = new Date();
    } else if (status === 'closed' || status === 'cancelled') {
      updateData.closedAt = new Date();
    }

    const rfq = await this.rfqModel.findOneAndUpdate(
      { rfqId },
      { $set: updateData },
      { new: true },
    );

    if (!rfq) {
      throw new NotFoundException(`RFQ with ID ${rfqId} not found`);
    }

    this.logger.log(`Updated RFQ status: ${rfqId} -> ${status}`);
    return rfq;
  }

  async awardRFQ(
    rfqId: string,
    expertId: string,
    bidId: string,
  ): Promise<RFQDocument> {
    const rfq = await this.rfqModel.findOneAndUpdate(
      { rfqId },
      {
        $set: {
          selectedExpert: new Types.ObjectId(expertId),
          status: RFQStatus.IN_PROGRESS,
          'metadata.awardedBidId': bidId,
          'metadata.awardedAt': new Date(),
        },
      },
      { new: true },
    );

    if (!rfq) {
      throw new NotFoundException(`RFQ with ID ${rfqId} not found`);
    }

    this.logger.log(`Awarded RFQ ${rfqId} to expert ${expertId}`);
    return rfq;
  }

  async updateAnalytics(rfqId: string, updates: any): Promise<void> {
    await this.rfqModel.updateOne({ rfqId }, updates);
  }

  async findById(rfqId: string): Promise<RFQDocument> {
    const cacheKey = `rfq:${rfqId}`;
    const cached = await this.cacheService.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const rfq = await this.rfqModel
      .findOne({ rfqId })
      .populate('matchedExperts')
      .populate('selectedExpert');

    if (!rfq) {
      throw new NotFoundException(`RFQ with ID ${rfqId} not found`);
    }

    await this.cacheService.set(cacheKey, rfq, 300); // Cache for 5 minutes
    return rfq;
  }

  async findAll(filters: any = {}): Promise<RFQDocument[]> {
    const query = this.rfqModel.find(filters);
    
    if (filters.status) {
      query.where('status').equals(filters.status);
    }
    
    if (filters.categories && filters.categories.length > 0) {
      query.where('categories').in(filters.categories);
    }
    
    if (filters.buyerId) {
      query.where('buyerId').equals(filters.buyerId);
    }

    return query
      .sort({ createdAt: -1 })
      .limit(filters.limit || 50)
      .exec();
  }

  async incrementViewCount(rfqId: string): Promise<void> {
    await this.rfqModel.updateOne(
      { rfqId },
      {
        $inc: { 'analytics.viewCount': 1 },
        $set: { 'analytics.lastViewedAt': new Date() },
      },
    );
  }

  async addMatchedExpert(rfqId: string, expertId: string): Promise<void> {
    await this.rfqModel.updateOne(
      { rfqId },
      {
        $addToSet: { matchedExperts: new Types.ObjectId(expertId) },
        $set: { status: RFQStatus.MATCHED },
      },
    );
  }

  async getActiveRFQsForMatching(): Promise<RFQDocument[]> {
    return this.rfqModel
      .find({
        status: { $in: [RFQStatus.PUBLISHED, RFQStatus.MATCHED] },
        'timeline.endDate': { $gt: new Date() },
      })
      .sort({ priority: -1, createdAt: -1 })
      .limit(100)
      .exec();
  }
}