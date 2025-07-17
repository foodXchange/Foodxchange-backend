import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RFQ, RFQDocument } from '../models/rfq.model';
import { RFQBid, RFQBidDocument } from '../models/rfq-bid.model';
import { RFQMatch, RFQMatchDocument } from '../models/rfq-match.model';
import { CacheService } from '../../cache/services/cache.service';

@Injectable()
export class RFQAnalyticsService {
  private readonly logger = new Logger(RFQAnalyticsService.name);

  constructor(
    @InjectModel(RFQ.name) private rfqModel: Model<RFQDocument>,
    @InjectModel(RFQBid.name) private bidModel: Model<RFQBidDocument>,
    @InjectModel(RFQMatch.name) private matchModel: Model<RFQMatchDocument>,
    private readonly cacheService: CacheService,
  ) {}

  async getRFQAnalytics(rfqId: string): Promise<any> {
    const cacheKey = `analytics:rfq:${rfqId}`;
    const cached = await this.cacheService.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const rfq = await this.rfqModel.findOne({ rfqId });
    if (!rfq) {
      return null;
    }

    const [bids, matches] = await Promise.all([
      this.bidModel.find({ rfqId }).exec(),
      this.matchModel.find({ rfqId }).exec(),
    ]);

    const analytics = {
      rfqId,
      status: rfq.status,
      createdAt: rfq.createdAt,
      publishedAt: rfq.publishedAt,
      closedAt: rfq.closedAt,
      
      bidding: {
        totalBids: bids.length,
        submittedBids: bids.filter(b => b.status === 'submitted').length,
        draftBids: bids.filter(b => b.status === 'draft').length,
        withdrawnBids: bids.filter(b => b.status === 'withdrawn').length,
        averageBidAmount: this.calculateAverageBidAmount(bids),
        bidAmountRange: this.calculateBidAmountRange(bids),
        averageScore: this.calculateAverageScore(bids),
        topBids: this.getTopBids(bids, 5),
      },
      
      matching: {
        totalMatches: matches.length,
        notifiedExperts: matches.filter(m => m.status === 'notified').length,
        interestedExperts: matches.filter(m => m.status === 'interested').length,
        notInterestedExperts: matches.filter(m => m.status === 'not_interested').length,
        averageMatchScore: this.calculateAverageMatchScore(matches),
        matchScoreDistribution: this.calculateMatchScoreDistribution(matches),
        conversionRate: this.calculateConversionRate(matches, bids),
      },
      
      timeline: {
        daysActive: this.calculateDaysActive(rfq),
        daysRemaining: this.calculateDaysRemaining(rfq),
        timeToFirstBid: this.calculateTimeToFirstBid(rfq, bids),
        averageResponseTime: this.calculateAverageResponseTime(matches),
      },
      
      engagement: {
        viewCount: rfq.analytics?.viewCount || 0,
        lastViewedAt: rfq.analytics?.lastViewedAt,
        uniqueExperts: new Set([
          ...matches.map(m => m.expertId.toString()),
          ...bids.map(b => b.expertId.toString()),
        ]).size,
      },
    };

    await this.cacheService.set(cacheKey, analytics, 600); // Cache for 10 minutes
    return analytics;
  }

  private calculateAverageBidAmount(bids: RFQBidDocument[]): number {
    const submittedBids = bids.filter(b => b.status === 'submitted' && b.proposedBudget?.amount);
    if (submittedBids.length === 0) return 0;
    
    const total = submittedBids.reduce((sum, bid) => sum + bid.proposedBudget.amount, 0);
    return total / submittedBids.length;
  }

  private calculateBidAmountRange(bids: RFQBidDocument[]): { min: number; max: number } {
    const amounts = bids
      .filter(b => b.status === 'submitted' && b.proposedBudget?.amount)
      .map(b => b.proposedBudget.amount);
    
    if (amounts.length === 0) return { min: 0, max: 0 };
    
    return {
      min: Math.min(...amounts),
      max: Math.max(...amounts),
    };
  }

  private calculateAverageScore(bids: RFQBidDocument[]): number {
    const scoredBids = bids.filter(b => b.score != null);
    if (scoredBids.length === 0) return 0;
    
    const total = scoredBids.reduce((sum, bid) => sum + bid.score, 0);
    return total / scoredBids.length;
  }

  private getTopBids(bids: RFQBidDocument[], limit: number): any[] {
    return bids
      .filter(b => b.status === 'submitted')
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, limit)
      .map(bid => ({
        bidId: bid._id,
        expertId: bid.expertId,
        amount: bid.proposedBudget?.amount,
        score: bid.score,
        submittedAt: bid.submittedAt,
      }));
  }

  private calculateAverageMatchScore(matches: RFQMatchDocument[]): number {
    if (matches.length === 0) return 0;
    
    const total = matches.reduce((sum, match) => sum + match.matchScore, 0);
    return total / matches.length;
  }

  private calculateMatchScoreDistribution(matches: RFQMatchDocument[]): any {
    const distribution = {
      '90-100': 0,
      '80-89': 0,
      '70-79': 0,
      '60-69': 0,
      'below60': 0,
    };

    matches.forEach(match => {
      const score = match.matchScore * 100;
      if (score >= 90) distribution['90-100']++;
      else if (score >= 80) distribution['80-89']++;
      else if (score >= 70) distribution['70-79']++;
      else if (score >= 60) distribution['60-69']++;
      else distribution['below60']++;
    });

    return distribution;
  }

  private calculateConversionRate(matches: RFQMatchDocument[], bids: RFQBidDocument[]): number {
    if (matches.length === 0) return 0;
    
    const matchedExpertIds = new Set(matches.map(m => m.expertId.toString()));
    const biddingExpertIds = new Set(bids.map(b => b.expertId.toString()));
    
    const convertedExperts = [...matchedExpertIds].filter(id => biddingExpertIds.has(id)).length;
    return (convertedExperts / matches.length) * 100;
  }

  private calculateDaysActive(rfq: RFQDocument): number {
    if (!rfq.publishedAt) return 0;
    
    const endDate = rfq.closedAt || new Date();
    const diffTime = Math.abs(endDate.getTime() - rfq.publishedAt.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private calculateDaysRemaining(rfq: RFQDocument): number {
    if (rfq.status === 'closed' || rfq.status === 'cancelled' || !rfq.timeline?.endDate) {
      return 0;
    }
    
    const now = new Date();
    const endDate = new Date(rfq.timeline.endDate);
    
    if (endDate <= now) return 0;
    
    const diffTime = endDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private calculateTimeToFirstBid(rfq: RFQDocument, bids: RFQBidDocument[]): number | null {
    if (!rfq.publishedAt || bids.length === 0) return null;
    
    const firstBid = bids
      .filter(b => b.submittedAt)
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())[0];
    
    if (!firstBid) return null;
    
    const diffTime = firstBid.submittedAt.getTime() - rfq.publishedAt.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60)); // Return hours
  }

  private calculateAverageResponseTime(matches: RFQMatchDocument[]): number | null {
    const respondedMatches = matches.filter(m => m.respondedAt && m.notifiedAt);
    if (respondedMatches.length === 0) return null;
    
    const totalTime = respondedMatches.reduce((sum, match) => {
      const diffTime = match.respondedAt.getTime() - match.notifiedAt.getTime();
      return sum + diffTime;
    }, 0);
    
    return Math.ceil(totalTime / respondedMatches.length / (1000 * 60 * 60)); // Return hours
  }

  async getOverallAnalytics(filters: {
    startDate?: Date;
    endDate?: Date;
    status?: string[];
    categories?: string[];
  } = {}): Promise<any> {
    const cacheKey = `analytics:overall:${JSON.stringify(filters)}`;
    const cached = await this.cacheService.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const query: any = {};
    
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = filters.startDate;
      if (filters.endDate) query.createdAt.$lte = filters.endDate;
    }
    
    if (filters.status && filters.status.length > 0) {
      query.status = { $in: filters.status };
    }
    
    if (filters.categories && filters.categories.length > 0) {
      query.categories = { $in: filters.categories };
    }

    const [rfqs, allBids, allMatches] = await Promise.all([
      this.rfqModel.find(query).exec(),
      this.bidModel.find({}).exec(),
      this.matchModel.find({}).exec(),
    ]);

    const rfqIds = rfqs.map(r => r.rfqId);
    const relevantBids = allBids.filter(b => rfqIds.includes(b.rfqId));
    const relevantMatches = allMatches.filter(m => rfqIds.includes(m.rfqId));

    const analytics = {
      summary: {
        totalRFQs: rfqs.length,
        activeRFQs: rfqs.filter(r => r.status === 'published' || r.status === 'matched').length,
        completedRFQs: rfqs.filter(r => r.status === 'completed').length,
        cancelledRFQs: rfqs.filter(r => r.status === 'cancelled').length,
        totalBids: relevantBids.length,
        totalMatches: relevantMatches.length,
      },
      
      performance: {
        averageBidsPerRFQ: rfqs.length > 0 ? relevantBids.length / rfqs.length : 0,
        averageMatchesPerRFQ: rfqs.length > 0 ? relevantMatches.length / rfqs.length : 0,
        overallConversionRate: this.calculateConversionRate(relevantMatches, relevantBids),
        averageTimeToFirstBid: this.calculateAverageTimeToFirstBidOverall(rfqs, relevantBids),
      },
      
      trends: {
        rfqsByDay: this.groupByDay(rfqs, 'createdAt'),
        bidsByDay: this.groupByDay(relevantBids, 'submittedAt'),
        conversionByCategory: this.calculateConversionByCategory(rfqs, relevantMatches, relevantBids),
      },
      
      topCategories: this.getTopCategories(rfqs),
      topExperts: this.getTopExperts(relevantBids),
    };

    await this.cacheService.set(cacheKey, analytics, 1800); // Cache for 30 minutes
    return analytics;
  }

  private calculateAverageTimeToFirstBidOverall(rfqs: RFQDocument[], bids: RFQBidDocument[]): number | null {
    const times: number[] = [];
    
    for (const rfq of rfqs) {
      if (!rfq.publishedAt) continue;
      
      const rfqBids = bids.filter(b => b.rfqId === rfq.rfqId && b.submittedAt);
      if (rfqBids.length === 0) continue;
      
      const firstBid = rfqBids.sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())[0];
      const diffTime = firstBid.submittedAt.getTime() - rfq.publishedAt.getTime();
      times.push(diffTime);
    }
    
    if (times.length === 0) return null;
    
    const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
    return Math.ceil(avgTime / (1000 * 60 * 60)); // Return hours
  }

  private groupByDay(items: any[], dateField: string): any[] {
    const groups = new Map<string, number>();
    
    items.forEach(item => {
      const date = item[dateField];
      if (!date) return;
      
      const day = new Date(date).toISOString().split('T')[0];
      groups.set(day, (groups.get(day) || 0) + 1);
    });
    
    return Array.from(groups.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private calculateConversionByCategory(
    rfqs: RFQDocument[],
    matches: RFQMatchDocument[],
    bids: RFQBidDocument[],
  ): any[] {
    const categoryStats = new Map<string, { matches: number; bids: number }>();
    
    rfqs.forEach(rfq => {
      const rfqMatches = matches.filter(m => m.rfqId === rfq.rfqId);
      const rfqBids = bids.filter(b => b.rfqId === rfq.rfqId);
      
      rfq.categories.forEach(category => {
        const stats = categoryStats.get(category) || { matches: 0, bids: 0 };
        stats.matches += rfqMatches.length;
        stats.bids += rfqBids.length;
        categoryStats.set(category, stats);
      });
    });
    
    return Array.from(categoryStats.entries()).map(([category, stats]) => ({
      category,
      conversionRate: stats.matches > 0 ? (stats.bids / stats.matches) * 100 : 0,
      totalMatches: stats.matches,
      totalBids: stats.bids,
    }));
  }

  private getTopCategories(rfqs: RFQDocument[]): any[] {
    const categoryCounts = new Map<string, number>();
    
    rfqs.forEach(rfq => {
      rfq.categories.forEach(category => {
        categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
      });
    });
    
    return Array.from(categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private getTopExperts(bids: RFQBidDocument[]): any[] {
    const expertStats = new Map<string, { bids: number; accepted: number; totalScore: number }>();
    
    bids.forEach(bid => {
      const expertId = bid.expertId.toString();
      const stats = expertStats.get(expertId) || { bids: 0, accepted: 0, totalScore: 0 };
      
      stats.bids++;
      if (bid.status === 'accepted') stats.accepted++;
      if (bid.score) stats.totalScore += bid.score;
      
      expertStats.set(expertId, stats);
    });
    
    return Array.from(expertStats.entries())
      .map(([expertId, stats]) => ({
        expertId,
        totalBids: stats.bids,
        acceptedBids: stats.accepted,
        acceptanceRate: stats.bids > 0 ? (stats.accepted / stats.bids) * 100 : 0,
        averageScore: stats.bids > 0 ? stats.totalScore / stats.bids : 0,
      }))
      .sort((a, b) => b.acceptanceRate - a.acceptanceRate)
      .slice(0, 10);
  }
}