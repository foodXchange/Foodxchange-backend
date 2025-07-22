import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';

import { cacheHelpers, cacheKeys } from '../config/redis';
import { ValidationError, NotFoundError } from '../core/errors';
import { Logger } from '../core/logging/logger';
import { Company } from '../models/Company';
import { Product } from '../models/Product';
import { RFQ, IRFQ } from '../models/RFQ';
import { uploadToAzureBlob, deleteFromAzureBlob } from '../services/azure/BlobStorageService';
import NotificationService from '../services/notifications/NotificationService';

const logger = new Logger('RFQController');
const notificationService = NotificationService;

export class RFQController {
  /**
   * Get all RFQs with filtering
   */
  getRFQs = asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const sort = (req.query.sort as string) || '-createdAt';

    // Build filter
    const filter: any = { tenantId: req.tenantId };

    // Role-based filtering
    if (req.user.role === 'supplier') {
      // Suppliers see public RFQs and those they're invited to
      filter.$or = [
        { visibility: 'public', status: 'published' },
        { invitedSuppliers: req.user.company, status: 'published' },
        { 'quotes.supplier': req.user.company }
      ];
    } else {
      // Buyers see their own RFQs
      filter.buyerCompany = req.user.company;
    }

    // Status filter
    if (req.query.status) {
      filter.status = req.query.status;
    } else {
      // Default: exclude cancelled and expired
      filter.status = { $nin: ['cancelled', 'expired'] };
    }

    // Category filter
    if (req.query.category) {
      filter.category = req.query.category;
    }

    // Date range filter
    if (req.query.fromDate || req.query.toDate) {
      filter.dueDate = {};
      if (req.query.fromDate) {
        filter.dueDate.$gte = new Date(req.query.fromDate as string);
      }
      if (req.query.toDate) {
        filter.dueDate.$lte = new Date(req.query.toDate as string);
      }
    }

    const skip = (page - 1) * limit;

    const [rfqs, total] = await Promise.all([
      RFQ.find(filter)
        .populate('buyer', 'name email')
        .populate('buyerCompany', 'name')
        .populate('items.productId', 'name sku')
        .select('-activityLog')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      RFQ.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        rfqs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  });

  /**
   * Get single RFQ
   */
  getRFQ = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const rfq = await RFQ.findOne({
      _id: id,
      $or: [
        { tenantId: req.tenantId },
        { visibility: 'public', status: 'published' },
        { invitedSuppliers: req.user.company }
      ]
    })
      .populate('buyer', 'name email phone')
      .populate('buyerCompany', 'name address contactInfo')
      .populate('items.productId')
      .populate('quotes.supplier', 'name rating')
      .populate('awardedTo', 'name');

    if (!rfq) {
      throw new NotFoundError('RFQ not found');
    }

    // Hide other suppliers' quotes if user is a supplier
    if (req.user.role === 'supplier' && req.user.company !== rfq.buyerCompany.toString()) {
      rfq.quotes = rfq.quotes.filter(q =>
        q.supplier._id.toString() === req.user.company
      );
    }

    res.json({
      success: true,
      data: rfq
    });
  });

  /**
   * Create new RFQ
   */
  createRFQ = asyncHandler(async (req: Request, res: Response) => {
    const rfqData = {
      ...req.body,
      buyer: new mongoose.Types.ObjectId(req.userId),
      buyerCompany: req.user.company,
      tenantId: req.tenantId,
      createdBy: new mongoose.Types.ObjectId(req.userId)
    };

    // Validate items
    if (!rfqData.items || rfqData.items.length === 0) {
      throw new ValidationError('At least one item is required');
    }

    // Validate product IDs if provided
    for (const item of rfqData.items) {
      if (item.productId) {
        const product = await Product.findById(item.productId);
        if (!product || product.tenantId !== req.tenantId) {
          throw new ValidationError(`Invalid product ID: ${item.productId}`);
        }
      }
    }

    // Validate invited suppliers if visibility is 'invited'
    if (rfqData.visibility === 'invited') {
      if (!rfqData.invitedSuppliers || rfqData.invitedSuppliers.length === 0) {
        throw new ValidationError('Invited suppliers required for invited RFQs');
      }

      // Validate supplier IDs
      const suppliers = await Company.find({
        _id: { $in: rfqData.invitedSuppliers },
        type: 'supplier'
      });

      if (suppliers.length !== rfqData.invitedSuppliers.length) {
        throw new ValidationError('Invalid supplier IDs');
      }
    }

    const rfq = new RFQ(rfqData);
    await rfq.save();

    // Add creation activity log
    await rfq.addActivityLog('rfq_created', new mongoose.Types.ObjectId(req.userId).toString(), {
      title: rfq.title,
      itemCount: rfq.items.length
    });
    await rfq.save();

    // Send notifications if published
    if (rfq.status === 'published') {
      await this.sendRFQNotifications(rfq);
    }

    logger.info('RFQ created', {
      rfqId: rfq._id,
      rfqNumber: rfq.rfqNumber,
      buyerCompany: rfq.buyerCompany,
      status: rfq.status
    });

    res.status(201).json({
      success: true,
      message: 'RFQ created successfully',
      data: rfq
    });
  });

  /**
   * Update RFQ
   */
  updateRFQ = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const rfq = await RFQ.findOne({
      _id: id,
      buyerCompany: req.user.company,
      status: { $in: ['draft', 'published'] }
    });

    if (!rfq) {
      throw new NotFoundError('RFQ not found or cannot be updated');
    }

    // Restrict updates based on status
    const allowedUpdates = rfq.status === 'draft' ?
      Object.keys(req.body) :
      ['description', 'attachments', 'additionalRequirements'];

    // Update only allowed fields
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        (rfq as any)[key] = req.body[key];
      }
    });

    rfq.updatedBy = new mongoose.Types.ObjectId(req.userId);
    rfq.version += 1;

    await rfq.save();

    await rfq.addActivityLog('rfq_updated', new mongoose.Types.ObjectId(req.userId).toString(), {
      updatedFields: Object.keys(req.body)
    });
    await rfq.save();

    res.json({
      success: true,
      message: 'RFQ updated successfully',
      data: rfq
    });
  });

  /**
   * Publish RFQ
   */
  publishRFQ = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const rfq = await RFQ.findOne({
      _id: id,
      buyerCompany: req.user.company,
      status: 'draft'
    });

    if (!rfq) {
      throw new NotFoundError('RFQ not found or already published');
    }

    rfq.status = 'published';
    rfq.issuedDate = new Date();

    await rfq.save();

    await rfq.addActivityLog('rfq_published', new mongoose.Types.ObjectId(req.userId).toString());
    await rfq.save();

    // Send notifications
    await this.sendRFQNotifications(rfq);

    logger.info('RFQ published', {
      rfqId: rfq._id,
      rfqNumber: rfq.rfqNumber
    });

    res.json({
      success: true,
      message: 'RFQ published successfully',
      data: rfq
    });
  });

  /**
   * Submit quote for RFQ
   */
  submitQuote = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const rfq = await RFQ.findById(id);

    if (!rfq) {
      throw new NotFoundError('RFQ not found');
    }

    // Check if supplier can submit quote
    if (!rfq.canSubmitQuote(req.user.company)) {
      throw new ValidationError('Cannot submit quote for this RFQ');
    }

    // Validate quote items match RFQ items
    if (req.body.items.length !== rfq.items.length) {
      throw new ValidationError('Quote must include all RFQ items');
    }

    const quote = {
      supplier: req.user.company,
      ...req.body,
      submittedAt: new Date(),
      status: 'submitted'
    };

    // Calculate total amount
    quote.totalAmount = quote.items.reduce((sum: number, item: any) =>
      sum + (item.price * item.quantity), 0
    );

    await rfq.submitQuote(quote);

    // Send notification to buyer
    await notificationService.notify({
      userId: rfq.buyer.toString(),
      type: 'proposal_submitted',
      title: 'New Quote Received',
      message: `New quote received for RFQ ${rfq.rfqNumber}`,
      priority: 'medium',
      data: { rfqId: rfq._id, quoteId: quote._id }
    });

    logger.info('Quote submitted', {
      rfqId: rfq._id,
      supplier: req.user.company,
      amount: quote.totalAmount
    });

    res.json({
      success: true,
      message: 'Quote submitted successfully',
      data: quote
    });
  });

  /**
   * Update quote
   */
  updateQuote = asyncHandler(async (req: Request, res: Response) => {
    const { id, quoteId } = req.params;

    const rfq = await RFQ.findById(id);

    if (!rfq) {
      throw new NotFoundError('RFQ not found');
    }

    const quoteIndex = rfq.quotes.findIndex(q =>
      q._id?.toString() === quoteId &&
      q.supplier.toString() === req.user.company &&
      q.status === 'submitted'
    );

    if (quoteIndex === -1) {
      throw new NotFoundError('Quote not found or cannot be updated');
    }

    // Update quote
    Object.assign(rfq.quotes[quoteIndex], {
      ...req.body,
      status: 'revised',
      totalAmount: req.body.items.reduce((sum: number, item: any) =>
        sum + (item.price * item.quantity), 0
      )
    });

    await rfq.save();

    await rfq.addActivityLog('quote_updated', req.user.company, {
      quoteId
    });
    await rfq.save();

    res.json({
      success: true,
      message: 'Quote updated successfully',
      data: rfq.quotes[quoteIndex]
    });
  });

  /**
   * Withdraw quote
   */
  withdrawQuote = asyncHandler(async (req: Request, res: Response) => {
    const { id, quoteId } = req.params;

    const rfq = await RFQ.findById(id);

    if (!rfq) {
      throw new NotFoundError('RFQ not found');
    }

    const quote = rfq.quotes.find(q =>
      q._id?.toString() === quoteId &&
      q.supplier.toString() === req.user.company
    );

    if (!quote) {
      throw new NotFoundError('Quote not found');
    }

    if (['accepted', 'rejected'].includes(quote.status)) {
      throw new ValidationError('Cannot withdraw quote in current status');
    }

    quote.status = 'withdrawn';
    await rfq.save();

    await rfq.addActivityLog('quote_withdrawn', req.user.company, {
      quoteId,
      reason: req.body.reason
    });
    await rfq.save();

    res.json({
      success: true,
      message: 'Quote withdrawn successfully'
    });
  });

  /**
   * Evaluate quotes
   */
  evaluateQuotes = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const rfq = await RFQ.findOne({
      _id: id,
      buyerCompany: req.user.company,
      status: { $in: ['published', 'closed'] }
    });

    if (!rfq) {
      throw new NotFoundError('RFQ not found');
    }

    if (rfq.quotes.filter(q => q.status === 'submitted').length === 0) {
      throw new ValidationError('No quotes to evaluate');
    }

    await rfq.evaluateQuotes();

    await rfq.addActivityLog('quotes_evaluated', new mongoose.Types.ObjectId(req.userId).toString());
    await rfq.save();

    res.json({
      success: true,
      message: 'Quotes evaluated successfully',
      data: rfq.quotes.filter(q => q.status === 'submitted')
    });
  });

  /**
   * Award RFQ
   */
  awardRFQ = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { supplierId, quoteId, reason } = req.body;

    const rfq = await RFQ.findOne({
      _id: id,
      buyerCompany: req.user.company,
      status: { $in: ['published', 'closed'] }
    });

    if (!rfq) {
      throw new NotFoundError('RFQ not found');
    }

    rfq.awardReason = reason;
    await rfq.awardToSupplier(supplierId, quoteId);

    // Send notifications
    const quote = rfq.quotes.find(q => q._id?.toString() === quoteId);
    if (quote) {
      // Notify winner
      await notificationService.notify({
        userId: supplierId,
        type: 'proposal_accepted',
        title: 'RFQ Awarded',
        message: `Congratulations! You have been awarded RFQ ${rfq.rfqNumber}`,
        priority: 'high',
        data: { rfqId: rfq._id, quoteId }
      });

      // Notify other suppliers
      const otherSuppliers = rfq.quotes
        .filter(q => q.supplier.toString() !== supplierId && q.status === 'rejected')
        .map(q => q.supplier);

      for (const supplier of otherSuppliers) {
        await notificationService.notify({
          userId: supplier.toString(),
          type: 'proposal_rejected',
          title: 'RFQ Update',
          message: `RFQ ${rfq.rfqNumber} has been awarded to another supplier`,
          priority: 'low',
          data: { rfqId: rfq._id }
        });
      }
    }

    logger.info('RFQ awarded', {
      rfqId: rfq._id,
      rfqNumber: rfq.rfqNumber,
      awardedTo: supplierId,
      amount: quote?.totalAmount
    });

    res.json({
      success: true,
      message: 'RFQ awarded successfully',
      data: rfq
    });
  });

  /**
   * Cancel RFQ
   */
  cancelRFQ = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;

    const rfq = await RFQ.findOne({
      _id: id,
      buyerCompany: req.user.company
    });

    if (!rfq) {
      throw new NotFoundError('RFQ not found');
    }

    await rfq.cancelRFQ(reason);

    // Notify suppliers who submitted quotes
    const suppliers = rfq.quotes
      .filter(q => q.status === 'submitted')
      .map(q => q.supplier);

    for (const supplier of suppliers) {
      await notificationService.notify({
        userId: supplier.toString(),
        type: 'system_alert',
        title: 'RFQ Cancelled',
        message: `RFQ ${rfq.rfqNumber} has been cancelled`,
        priority: 'medium',
        data: { rfqId: rfq._id, reason }
      });
    }

    logger.info('RFQ cancelled', {
      rfqId: rfq._id,
      rfqNumber: rfq.rfqNumber,
      reason
    });

    res.json({
      success: true,
      message: 'RFQ cancelled successfully'
    });
  });

  /**
   * Extend RFQ deadline
   */
  extendDeadline = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { newDate } = req.body;

    const rfq = await RFQ.findOne({
      _id: id,
      buyerCompany: req.user.company,
      status: 'published'
    });

    if (!rfq) {
      throw new NotFoundError('RFQ not found or not active');
    }

    await rfq.extendDeadline(new Date(newDate));

    // Notify invited suppliers
    const suppliers = rfq.visibility === 'invited' ?
      rfq.invitedSuppliers :
      rfq.quotes.map(q => q.supplier);

    for (const supplier of suppliers) {
      await notificationService.notify({
        userId: supplier.toString(),
        type: 'system_alert',
        title: 'RFQ Deadline Extended',
        message: `Deadline for RFQ ${rfq.rfqNumber} has been extended`,
        priority: 'medium',
        data: { rfqId: rfq._id, newDeadline: newDate }
      });
    }

    res.json({
      success: true,
      message: 'Deadline extended successfully',
      data: rfq
    });
  });

  /**
   * Upload RFQ attachments
   */
  uploadAttachments = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const rfq = await RFQ.findOne({
      _id: id,
      $or: [
        { buyerCompany: req.user.company },
        { 'quotes.supplier': req.user.company }
      ]
    });

    if (!rfq) {
      throw new NotFoundError('RFQ not found');
    }

    if (!req.files || !Array.isArray(req.files)) {
      throw new ValidationError('No files uploaded');
    }

    const uploadedAttachments = [];

    for (const file of req.files) {
      const url = await uploadToAzureBlob(
        file,
        'rfq-attachments',
        `${req.tenantId}/${rfq._id}`
      );

      const attachment = {
        name: file.originalname,
        url,
        type: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
        uploadedBy: new mongoose.Types.ObjectId(req.userId)
      };

      rfq.attachments.push(attachment);
      uploadedAttachments.push(attachment);
    }

    await rfq.save();

    await rfq.addActivityLog('attachments_uploaded', new mongoose.Types.ObjectId(req.userId).toString(), {
      count: uploadedAttachments.length
    });
    await rfq.save();

    res.json({
      success: true,
      message: 'Attachments uploaded successfully',
      data: uploadedAttachments
    });
  });

  /**
   * Get RFQ analytics
   */
  getRFQAnalytics = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user.company;
    const { fromDate, toDate } = req.query;

    const dateFilter: any = {};
    if (fromDate) dateFilter.$gte = new Date(fromDate as string);
    if (toDate) dateFilter.$lte = new Date(toDate as string);

    const filter: any = { buyerCompany: companyId };
    if (Object.keys(dateFilter).length > 0) {
      filter.createdAt = dateFilter;
    }

    const [
      totalRFQs,
      publishedRFQs,
      awardedRFQs,
      averageQuotes,
      averageSavings
    ] = await Promise.all([
      RFQ.countDocuments(filter),
      RFQ.countDocuments({ ...filter, status: 'published' }),
      RFQ.countDocuments({ ...filter, status: 'awarded' }),
      RFQ.aggregate([
        { $match: filter },
        { $project: { quoteCount: { $size: '$quotes' } } },
        { $group: { _id: null, avg: { $avg: '$quoteCount' } } }
      ]),
      RFQ.aggregate([
        { $match: { ...filter, status: 'awarded' } },
        { $unwind: '$items' },
        { $lookup: {
          from: 'quotes',
          localField: 'awardedQuote',
          foreignField: '_id',
          as: 'awardedQuoteData'
        }},
        { $project: {
          targetPrice: '$items.targetPrice',
          awardedPrice: { $arrayElemAt: ['$awardedQuoteData.totalAmount', 0] }
        }},
        { $group: {
          _id: null,
          avgSavingsPercent: {
            $avg: {
              $multiply: [
                { $divide: [
                  { $subtract: ['$targetPrice', '$awardedPrice'] },
                  '$targetPrice'
                ]},
                100
              ]
            }
          }
        }}
      ])
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalRFQs,
          publishedRFQs,
          awardedRFQs,
          conversionRate: totalRFQs > 0 ? (awardedRFQs / totalRFQs) * 100 : 0
        },
        performance: {
          averageQuotesPerRFQ: averageQuotes[0]?.avg || 0,
          averageSavingsPercent: averageSavings[0]?.avgSavingsPercent || 0
        }
      }
    });
  });

  /**
   * Send RFQ notifications
   */
  private async sendRFQNotifications(rfq: IRFQ): Promise<void> {
    try {
      if (rfq.visibility === 'public') {
        // Notify all active suppliers in the category
        const suppliers = await Company.find({
          type: 'supplier',
          status: 'active',
          'profile.categories': rfq.category
        });

        for (const supplier of suppliers) {
          await notificationService.notify({
            userId: supplier._id.toString(),
            type: 'rfq_created',
            title: 'New RFQ Available',
            message: `New RFQ: ${rfq.title}`,
            priority: 'medium',
            data: { rfqId: rfq._id }
          });
        }
      } else if (rfq.visibility === 'invited') {
        // Notify invited suppliers only
        for (const supplierId of rfq.invitedSuppliers || []) {
          await notificationService.notify({
            userId: supplierId.toString(),
            type: 'rfq_created',
            title: 'RFQ Invitation',
            message: `You're invited to quote on: ${rfq.title}`,
            priority: 'high',
            data: { rfqId: rfq._id }
          });
        }
      }
    } catch (error) {
      logger.error('Failed to send RFQ notifications:', error);
    }
  }
}

export default RFQController;
