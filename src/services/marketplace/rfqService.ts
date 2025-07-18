import { RFQ, IRFQ } from '../../models/marketplace/RFQ';
import { Proposal, IProposal } from '../../models/marketplace/Proposal';
import { Product } from '../../models/marketplace/Product';
import { User } from '../../models/auth/User';
import { Logger } from '../../core/logging/logger';
import { NotFoundError, ValidationError, ForbiddenError } from '../../core/errors';
import { CacheService } from '../../infrastructure/cache/CacheService';
import { MetricsService } from '../../core/monitoring/metrics';
import { EventEmitter } from 'events';
import mongoose from 'mongoose';

const logger = new Logger('RFQService');
const metrics = metricsService;

export interface RFQCreateData {
  title: string;
  description: string;
  category: string;
  products: Array<{
    name: string;
    quantity: number;
    unit: string;
    specifications?: Record<string, any>;
  }>;
  deliveryDate: Date;
  deliveryLocation: string;
  paymentTerms?: string;
  additionalRequirements?: string;
  budget?: {
    min: number;
    max: number;
    currency: string;
  };
}

export interface ProposalCreateData {
  rfqId: string;
  products: Array<{
    productId?: string;
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
  }>;
  totalAmount: number;
  currency: string;
  deliveryDate: Date;
  validUntil: Date;
  paymentTerms: string;
  notes?: string;
  attachments?: string[];
}

export interface RFQFilters {
  status?: 'draft' | 'open' | 'closed' | 'awarded' | 'cancelled';
  category?: string;
  buyer?: string;
  minBudget?: number;
  maxBudget?: number;
  deliveryDateFrom?: Date;
  deliveryDateTo?: Date;
}

export class RFQService extends EventEmitter {
  private cache: CacheService;

  constructor() {
    super();
    this.cache = cacheService;
  }

  async createRFQ(buyerId: string, data: RFQCreateData): Promise<IRFQ> {
    const timer = metrics.startTimer('rfq_create_duration');
    
    try {
      logger.info('Creating new RFQ', { buyerId, title: data.title });

      // Validate buyer
      const buyer = await User.findById(buyerId);
      if (!buyer || buyer.role !== 'buyer') {
        throw new ValidationError('Only buyers can create RFQs');
      }

      // Create RFQ
      const rfq = new RFQ({
        ...data,
        buyer: buyerId,
        status: 'draft',
        proposals: [],
        viewedBy: [],
      });

      await rfq.save();
      
      // Clear caches
      await this.clearRFQCaches();
      
      // Emit event
      this.emit('rfq:created', rfq);
      
      metrics.increment('rfqs_created');
      timer();
      
      logger.info('RFQ created successfully', { rfqId: rfq._id });
      return rfq;
    } catch (error) {
      timer();
      throw error;
    }
  }

  async updateRFQ(
    rfqId: string,
    buyerId: string,
    updates: Partial<RFQCreateData>
  ): Promise<IRFQ> {
    const timer = metrics.startTimer('rfq_update_duration');
    
    try {
      logger.info('Updating RFQ', { rfqId, buyerId });

      const rfq = await RFQ.findById(rfqId);
      if (!rfq) {
        throw new NotFoundError('RFQ', rfqId);
      }

      // Verify ownership
      if (rfq.buyer.toString() !== buyerId) {
        throw new ForbiddenError('You can only update your own RFQs');
      }

      // Can't update if already has proposals
      if (rfq.status !== 'draft' && rfq.proposals.length > 0) {
        throw new ValidationError('Cannot update RFQ with existing proposals');
      }

      // Apply updates
      Object.assign(rfq, updates);
      rfq.updatedAt = new Date();

      await rfq.save();
      
      // Clear caches
      await this.clearRFQCaches();
      await this.cache.delete(`rfq:${rfqId}`);
      
      // Emit event
      this.emit('rfq:updated', rfq);
      
      metrics.increment('rfqs_updated');
      timer();
      
      return rfq;
    } catch (error) {
      timer();
      throw error;
    }
  }

  async publishRFQ(rfqId: string, buyerId: string): Promise<IRFQ> {
    logger.info('Publishing RFQ', { rfqId, buyerId });

    const rfq = await RFQ.findById(rfqId);
    if (!rfq) {
      throw new NotFoundError('RFQ', rfqId);
    }

    if (rfq.buyer.toString() !== buyerId) {
      throw new ForbiddenError('You can only publish your own RFQs');
    }

    if (rfq.status !== 'draft') {
      throw new ValidationError('RFQ is already published');
    }

    rfq.status = 'open';
    rfq.publishedAt = new Date();
    await rfq.save();

    // Clear caches
    await this.clearRFQCaches();

    // Emit event for notifications
    this.emit('rfq:published', rfq);

    metrics.increment('rfqs_published');
    return rfq;
  }

  async getRFQ(rfqId: string, userId?: string): Promise<IRFQ> {
    const cacheKey = `rfq:${rfqId}`;
    
    // Check cache
    const cached = await this.cache.get<IRFQ>(cacheKey);
    if (cached) {
      metrics.increment('rfq_cache_hits');
      return cached;
    }

    const rfq = await RFQ.findById(rfqId)
      .populate('buyer', 'email profile company')
      .populate('category')
      .populate({
        path: 'proposals',
        populate: {
          path: 'supplier',
          select: 'name location',
        },
      });

    if (!rfq) {
      throw new NotFoundError('RFQ', rfqId);
    }

    // Track view if user is supplier
    if (userId) {
      const user = await User.findById(userId);
      if (user?.role === 'supplier' && !rfq.viewedBy.includes(userId)) {
        rfq.viewedBy.push(userId);
        await rfq.save();
      }
    }

    // Cache for 30 minutes
    await this.cache.set(cacheKey, rfq, 1800);
    metrics.increment('rfq_cache_misses');

    return rfq;
  }

  async listRFQs(
    filters: RFQFilters = {},
    page: number = 1,
    limit: number = 20,
    sort: string = '-createdAt'
  ): Promise<{
    rfqs: IRFQ[];
    total: number;
    page: number;
    pages: number;
  }> {
    const timer = metrics.startTimer('rfq_list_duration');
    
    try {
      // Build query
      const query: any = {};
      
      if (filters.status) {
        query.status = filters.status;
      } else {
        // Default to showing only open RFQs
        query.status = 'open';
      }
      
      if (filters.category) {
        query.category = filters.category;
      }
      
      if (filters.buyer) {
        query.buyer = filters.buyer;
      }
      
      if (filters.minBudget !== undefined || filters.maxBudget !== undefined) {
        query['budget.max'] = {};
        if (filters.minBudget !== undefined) {
          query['budget.max'].$gte = filters.minBudget;
        }
        if (filters.maxBudget !== undefined) {
          query['budget.min'] = { $lte: filters.maxBudget };
        }
      }
      
      if (filters.deliveryDateFrom || filters.deliveryDateTo) {
        query.deliveryDate = {};
        if (filters.deliveryDateFrom) {
          query.deliveryDate.$gte = filters.deliveryDateFrom;
        }
        if (filters.deliveryDateTo) {
          query.deliveryDate.$lte = filters.deliveryDateTo;
        }
      }

      // Execute query
      const skip = (page - 1) * limit;
      
      const [rfqs, total] = await Promise.all([
        RFQ.find(query)
          .populate('buyer', 'email profile company')
          .populate('category')
          .sort(sort)
          .skip(skip)
          .limit(limit),
        RFQ.countDocuments(query),
      ]);

      const result = {
        rfqs,
        total,
        page,
        pages: Math.ceil(total / limit),
      };

      timer();
      return result;
    } catch (error) {
      timer();
      throw error;
    }
  }

  async getBuyerRFQs(buyerId: string): Promise<IRFQ[]> {
    return RFQ.find({ buyer: buyerId })
      .populate('category')
      .populate({
        path: 'proposals',
        populate: {
          path: 'supplier',
          select: 'name location',
        },
      })
      .sort('-createdAt');
  }

  async createProposal(
    supplierId: string,
    data: ProposalCreateData
  ): Promise<IProposal> {
    const timer = metrics.startTimer('proposal_create_duration');
    
    try {
      logger.info('Creating proposal', { supplierId, rfqId: data.rfqId });

      // Validate RFQ
      const rfq = await RFQ.findById(data.rfqId);
      if (!rfq) {
        throw new NotFoundError('RFQ', data.rfqId);
      }

      if (rfq.status !== 'open') {
        throw new ValidationError('RFQ is not accepting proposals');
      }

      // Check if supplier already submitted a proposal
      const existingProposal = await Proposal.findOne({
        rfq: data.rfqId,
        supplier: supplierId,
      });

      if (existingProposal) {
        throw new ValidationError('You have already submitted a proposal for this RFQ');
      }

      // Validate products if product IDs provided
      for (const item of data.products) {
        if (item.productId) {
          const product = await Product.findById(item.productId);
          if (!product || product.supplier.toString() !== supplierId) {
            throw new ValidationError(`Invalid product: ${item.productId}`);
          }
        }
      }

      // Create proposal
      const proposal = new Proposal({
        rfq: data.rfqId,
        supplier: supplierId,
        products: data.products,
        totalAmount: data.totalAmount,
        currency: data.currency,
        deliveryDate: data.deliveryDate,
        validUntil: data.validUntil,
        paymentTerms: data.paymentTerms,
        notes: data.notes,
        attachments: data.attachments,
        status: 'submitted',
      });

      await proposal.save();

      // Add proposal to RFQ
      rfq.proposals.push(proposal._id);
      await rfq.save();

      // Clear caches
      await this.cache.delete(`rfq:${data.rfqId}`);
      await this.clearRFQCaches();

      // Emit event
      this.emit('proposal:created', { proposal, rfq });

      metrics.increment('proposals_created');
      timer();

      return proposal;
    } catch (error) {
      timer();
      throw error;
    }
  }

  async updateProposal(
    proposalId: string,
    supplierId: string,
    updates: Partial<ProposalCreateData>
  ): Promise<IProposal> {
    logger.info('Updating proposal', { proposalId, supplierId });

    const proposal = await Proposal.findById(proposalId);
    if (!proposal) {
      throw new NotFoundError('Proposal', proposalId);
    }

    if (proposal.supplier.toString() !== supplierId) {
      throw new ForbiddenError('You can only update your own proposals');
    }

    if (proposal.status !== 'submitted') {
      throw new ValidationError('Cannot update proposal after review');
    }

    // Apply updates
    Object.assign(proposal, updates);
    proposal.updatedAt = new Date();

    await proposal.save();

    // Clear caches
    await this.cache.delete(`rfq:${proposal.rfq}`);

    // Emit event
    this.emit('proposal:updated', proposal);

    metrics.increment('proposals_updated');
    return proposal;
  }

  async getProposal(proposalId: string, userId: string): Promise<IProposal> {
    const proposal = await Proposal.findById(proposalId)
      .populate('supplier', 'name location')
      .populate('rfq');

    if (!proposal) {
      throw new NotFoundError('Proposal', proposalId);
    }

    // Check access - either supplier or RFQ buyer
    const rfq = await RFQ.findById(proposal.rfq);
    const canAccess = 
      proposal.supplier.toString() === userId ||
      rfq?.buyer.toString() === userId;

    if (!canAccess) {
      throw new ForbiddenError('You do not have access to this proposal');
    }

    return proposal;
  }

  async getSupplierProposals(supplierId: string): Promise<IProposal[]> {
    return Proposal.find({ supplier: supplierId })
      .populate('rfq')
      .sort('-createdAt');
  }

  async reviewProposal(
    proposalId: string,
    buyerId: string,
    decision: 'accepted' | 'rejected',
    feedback?: string
  ): Promise<IProposal> {
    logger.info('Reviewing proposal', { proposalId, buyerId, decision });

    const proposal = await Proposal.findById(proposalId).populate('rfq');
    if (!proposal) {
      throw new NotFoundError('Proposal', proposalId);
    }

    const rfq = await RFQ.findById(proposal.rfq);
    if (!rfq || rfq.buyer.toString() !== buyerId) {
      throw new ForbiddenError('You can only review proposals for your own RFQs');
    }

    proposal.status = decision === 'accepted' ? 'accepted' : 'rejected';
    proposal.reviewedAt = new Date();
    proposal.reviewFeedback = feedback;

    await proposal.save();

    // If accepted, update RFQ status
    if (decision === 'accepted') {
      rfq.status = 'awarded';
      rfq.awardedTo = proposal.supplier;
      rfq.awardedAt = new Date();
      await rfq.save();

      // Reject other proposals
      await Proposal.updateMany(
        {
          rfq: rfq._id,
          _id: { $ne: proposalId },
          status: 'submitted',
        },
        {
          status: 'rejected',
          reviewedAt: new Date(),
          reviewFeedback: 'Another proposal was selected',
        }
      );
    }

    // Clear caches
    await this.cache.delete(`rfq:${proposal.rfq}`);

    // Emit event
    this.emit('proposal:reviewed', { proposal, decision });

    metrics.increment(`proposals_${decision}`);
    return proposal;
  }

  async closeRFQ(rfqId: string, buyerId: string): Promise<IRFQ> {
    logger.info('Closing RFQ', { rfqId, buyerId });

    const rfq = await RFQ.findById(rfqId);
    if (!rfq) {
      throw new NotFoundError('RFQ', rfqId);
    }

    if (rfq.buyer.toString() !== buyerId) {
      throw new ForbiddenError('You can only close your own RFQs');
    }

    if (rfq.status === 'closed' || rfq.status === 'cancelled') {
      throw new ValidationError('RFQ is already closed');
    }

    rfq.status = 'closed';
    rfq.closedAt = new Date();
    await rfq.save();

    // Reject all pending proposals
    await Proposal.updateMany(
      {
        rfq: rfqId,
        status: 'submitted',
      },
      {
        status: 'rejected',
        reviewedAt: new Date(),
        reviewFeedback: 'RFQ was closed',
      }
    );

    // Clear caches
    await this.clearRFQCaches();
    await this.cache.delete(`rfq:${rfqId}`);

    // Emit event
    this.emit('rfq:closed', rfq);

    metrics.increment('rfqs_closed');
    return rfq;
  }

  async getRFQAnalytics(rfqId: string): Promise<any> {
    const rfq = await this.getRFQ(rfqId);
    
    const proposals = await Proposal.find({ rfq: rfqId });
    
    const analytics = {
      rfqId,
      totalViews: rfq.viewedBy.length,
      totalProposals: proposals.length,
      averagePrice: proposals.length > 0
        ? proposals.reduce((sum, p) => sum + p.totalAmount, 0) / proposals.length
        : 0,
      priceRange: {
        min: Math.min(...proposals.map(p => p.totalAmount)),
        max: Math.max(...proposals.map(p => p.totalAmount)),
      },
      proposalsByStatus: {
        submitted: proposals.filter(p => p.status === 'submitted').length,
        accepted: proposals.filter(p => p.status === 'accepted').length,
        rejected: proposals.filter(p => p.status === 'rejected').length,
      },
      responseTime: this.calculateAverageResponseTime(rfq, proposals),
    };

    return analytics;
  }

  private calculateAverageResponseTime(rfq: IRFQ, proposals: IProposal[]): number {
    if (proposals.length === 0 || !rfq.publishedAt) return 0;

    const responseTimes = proposals.map(p => 
      p.createdAt.getTime() - rfq.publishedAt!.getTime()
    );

    return responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
  }

  private async clearRFQCaches(): Promise<void> {
    await this.cache.deletePattern('rfqs:list:*');
  }
}

export default new RFQService();