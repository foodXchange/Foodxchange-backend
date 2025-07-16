import { Request, Response } from 'express';
import { ExpertProfile, ExpertService, ExpertAvailability } from '../models';
import { Logger } from '../utils/logger';
import { asyncHandler } from '../middleware/asyncHandler';
import { CacheService } from '../services/CacheService';
import { ExpertMatchingEngine } from '../services/ExpertMatchingEngine';
import { 
  ValidationError, 
  NotFoundError, 
  AuthenticationError,
  ConflictError 
} from '../utils/errors';
import { 
  getSpecializationById,
  validateExpertSpecializations 
} from '../config/expertSpecializations';

const logger = new Logger('ExpertController');

export class ExpertController {
  private cacheService: CacheService;
  private matchingEngine: ExpertMatchingEngine;

  constructor() {
    this.cacheService = new CacheService();
    this.matchingEngine = new ExpertMatchingEngine();
  }

  /**
   * Get expert profile by ID
   */
  getExpertProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { expertId } = req.params;

    try {
      // Try cache first
      let expert = await this.cacheService.getCachedExpertProfile(expertId);

      if (!expert) {
        expert = await ExpertProfile.findById(expertId)
          .select('-documents -__v')
          .lean();

        if (!expert) {
          throw new NotFoundError('Expert');
        }

        // Cache the result
        await this.cacheService.cacheExpertProfile(expertId, expert);
      }

      // Get expert services
      const services = await ExpertService.find({ 
        expertId, 
        isActive: true 
      }).select('-__v').lean();

      res.status(200).json({
        success: true,
        data: {
          expert: {
            ...expert,
            services
          }
        }
      });
    } catch (error) {
      logger.error('Get expert profile failed:', error);
      throw error;
    }
  });

  /**
   * Update expert profile
   */
  updateExpertProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    const updateData = req.body;

    try {
      // Validate specializations if provided
      if (updateData.expertise) {
        const validation = validateExpertSpecializations(updateData.expertise);
        if (!validation.valid) {
          throw new ValidationError('Invalid specializations: ' + validation.errors.join(', '));
        }
      }

      // Update expert profile
      const expert = await ExpertProfile.findByIdAndUpdate(
        req.user.expertId,
        { $set: updateData },
        { new: true, runValidators: true }
      ).select('-documents -__v');

      if (!expert) {
        throw new NotFoundError('Expert');
      }

      // Invalidate cache
      await this.cacheService.invalidateExpertCache(req.user.expertId);

      logger.info('Expert profile updated', {
        expertId: req.user.expertId
      });

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: { expert }
      });
    } catch (error) {
      logger.error('Update expert profile failed:', error);
      throw error;
    }
  });

  /**
   * Upload profile photo
   */
  uploadProfilePhoto = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    const file = req.file;
    if (!file) {
      throw new ValidationError('Profile photo required');
    }

    try {
      // Upload to Azure Storage (placeholder)
      const photoUrl = await this.uploadToAzureStorage(file);

      // Update expert profile
      const expert = await ExpertProfile.findByIdAndUpdate(
        req.user.expertId,
        { profilePhoto: photoUrl },
        { new: true }
      ).select('profilePhoto');

      if (!expert) {
        throw new NotFoundError('Expert');
      }

      // Invalidate cache
      await this.cacheService.invalidateExpertCache(req.user.expertId);

      res.status(200).json({
        success: true,
        message: 'Profile photo uploaded successfully',
        data: { profilePhoto: expert.profilePhoto }
      });
    } catch (error) {
      logger.error('Profile photo upload failed:', error);
      throw error;
    }
  });

  /**
   * Update expert availability
   */
  updateAvailability = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    const { availability } = req.body;

    try {
      // Update availability in profile
      const expert = await ExpertProfile.findByIdAndUpdate(
        req.user.expertId,
        { availability },
        { new: true, runValidators: true }
      ).select('availability');

      if (!expert) {
        throw new NotFoundError('Expert');
      }

      // Invalidate cache
      await this.cacheService.invalidateExpertCache(req.user.expertId);

      logger.info('Expert availability updated', {
        expertId: req.user.expertId
      });

      res.status(200).json({
        success: true,
        message: 'Availability updated successfully',
        data: { availability: expert.availability }
      });
    } catch (error) {
      logger.error('Update availability failed:', error);
      throw error;
    }
  });

  /**
   * Get expert dashboard data
   */
  getDashboard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    try {
      const expertId = req.user.expertId;

      // Get expert basic info
      const expert = await ExpertProfile.findById(expertId)
        .select('firstName lastName rating completedProjects totalEarnings status verificationStatus')
        .lean();

      if (!expert) {
        throw new NotFoundError('Expert');
      }

      // Get active collaborations count
      const { ExpertCollaboration } = await import('../models');
      const activeCollaborations = await ExpertCollaboration.countDocuments({
        expertId,
        status: { $in: ['accepted', 'in_progress'] }
      });

      // Get pending collaborations count
      const pendingCollaborations = await ExpertCollaboration.countDocuments({
        expertId,
        status: 'requested'
      });

      // Get this month's earnings
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { ExpertPayment } = await import('../models');
      const monthlyEarnings = await ExpertPayment.aggregate([
        {
          $match: {
            expertId,
            status: 'completed',
            paidAt: { $gte: startOfMonth }
          }
        },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: '$netAmount' },
            paymentCount: { $sum: 1 }
          }
        }
      ]);

      // Get recent reviews
      const { ExpertReview } = await import('../models');
      const recentReviews = await ExpertReview.find({
        expertId,
        isVisible: true
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('clientId', 'firstName lastName')
      .select('rating comment aspects createdAt')
      .lean();

      // Get upcoming bookings
      const { ServiceBooking } = await import('../models');
      const upcomingBookings = await ServiceBooking.find({
        expertId,
        status: 'confirmed',
        scheduledDate: { $gte: new Date() }
      })
      .sort({ scheduledDate: 1 })
      .limit(5)
      .populate('clientId', 'firstName lastName')
      .populate('serviceId', 'title')
      .lean();

      const dashboardData = {
        expert: {
          name: `${expert.firstName} ${expert.lastName}`,
          rating: expert.rating,
          completedProjects: expert.completedProjects,
          totalEarnings: expert.totalEarnings,
          status: expert.status,
          verificationStatus: expert.verificationStatus
        },
        stats: {
          activeCollaborations,
          pendingCollaborations,
          monthlyEarnings: monthlyEarnings[0]?.totalEarnings || 0,
          monthlyPayments: monthlyEarnings[0]?.paymentCount || 0
        },
        recentReviews,
        upcomingBookings
      };

      res.status(200).json({
        success: true,
        data: dashboardData
      });
    } catch (error) {
      logger.error('Get dashboard failed:', error);
      throw error;
    }
  });

  /**
   * Get expert analytics
   */
  getAnalytics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    const { period = '30d' } = req.query;

    try {
      const expertId = req.user.expertId;
      
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      
      switch (period) {
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(endDate.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
        default:
          startDate.setDate(endDate.getDate() - 30);
      }

      // Get earnings analytics
      const { ExpertPayment } = await import('../models');
      const earningsData = await ExpertPayment.aggregate([
        {
          $match: {
            expertId,
            status: 'completed',
            paidAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$paidAt' },
              month: { $month: '$paidAt' },
              day: { $dayOfMonth: '$paidAt' }
            },
            earnings: { $sum: '$netAmount' },
            payments: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ]);

      // Get collaboration analytics
      const { ExpertCollaboration } = await import('../models');
      const collaborationData = await ExpertCollaboration.aggregate([
        {
          $match: {
            expertId,
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get review analytics
      const { ExpertReview } = await import('../models');
      const reviewData = await ExpertReview.aggregate([
        {
          $match: {
            expertId,
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating' },
            totalReviews: { $sum: 1 },
            avgExpertise: { $avg: '$aspects.expertise' },
            avgCommunication: { $avg: '$aspects.communication' },
            avgTimeliness: { $avg: '$aspects.timeliness' },
            avgValue: { $avg: '$aspects.value' }
          }
        }
      ]);

      const analytics = {
        period,
        dateRange: { startDate, endDate },
        earnings: {
          total: earningsData.reduce((sum, item) => sum + item.earnings, 0),
          average: earningsData.length > 0 ? 
            earningsData.reduce((sum, item) => sum + item.earnings, 0) / earningsData.length : 0,
          timeline: earningsData
        },
        collaborations: {
          total: collaborationData.reduce((sum, item) => sum + item.count, 0),
          byStatus: collaborationData.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {} as Record<string, number>)
        },
        reviews: reviewData[0] || {
          avgRating: 0,
          totalReviews: 0,
          avgExpertise: 0,
          avgCommunication: 0,
          avgTimeliness: 0,
          avgValue: 0
        }
      };

      res.status(200).json({
        success: true,
        data: analytics
      });
    } catch (error) {
      logger.error('Get analytics failed:', error);
      throw error;
    }
  });

  /**
   * Create expert service
   */
  createService = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    const serviceData = {
      ...req.body,
      expertId: req.user.expertId
    };

    try {
      // Check if expert is verified for service creation
      const expert = await ExpertProfile.findById(req.user.expertId)
        .select('verificationStatus');

      if (!expert || expert.verificationStatus !== 'verified') {
        throw new ConflictError('Expert verification required to create services');
      }

      const service = new ExpertService(serviceData);
      await service.save();

      logger.info('Expert service created', {
        expertId: req.user.expertId,
        serviceId: service._id
      });

      res.status(201).json({
        success: true,
        message: 'Service created successfully',
        data: { service }
      });
    } catch (error) {
      logger.error('Create service failed:', error);
      throw error;
    }
  });

  /**
   * Get expert services
   */
  getServices = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    const { page = 1, limit = 10, active } = req.query;

    try {
      const filter: any = { expertId: req.user.expertId };
      if (active !== undefined) {
        filter.isActive = active === 'true';
      }

      const services = await ExpertService.find(filter)
        .sort({ createdAt: -1 })
        .limit(Number(limit) * Number(page))
        .skip((Number(page) - 1) * Number(limit))
        .lean();

      const total = await ExpertService.countDocuments(filter);

      res.status(200).json({
        success: true,
        data: {
          services,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      logger.error('Get services failed:', error);
      throw error;
    }
  });

  /**
   * Update expert service
   */
  updateService = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    const { serviceId } = req.params;
    const updateData = req.body;

    try {
      const service = await ExpertService.findOneAndUpdate(
        { _id: serviceId, expertId: req.user.expertId },
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!service) {
        throw new NotFoundError('Service');
      }

      logger.info('Expert service updated', {
        expertId: req.user.expertId,
        serviceId
      });

      res.status(200).json({
        success: true,
        message: 'Service updated successfully',
        data: { service }
      });
    } catch (error) {
      logger.error('Update service failed:', error);
      throw error;
    }
  });

  /**
   * Delete expert service
   */
  deleteService = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    const { serviceId } = req.params;

    try {
      const service = await ExpertService.findOneAndDelete({
        _id: serviceId,
        expertId: req.user.expertId
      });

      if (!service) {
        throw new NotFoundError('Service');
      }

      logger.info('Expert service deleted', {
        expertId: req.user.expertId,
        serviceId
      });

      res.status(200).json({
        success: true,
        message: 'Service deleted successfully'
      });
    } catch (error) {
      logger.error('Delete service failed:', error);
      throw error;
    }
  });

  /**
   * Get expert collaborations
   */
  getCollaborations = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    const { page = 1, limit = 10, status } = req.query;

    try {
      const filter: any = { expertId: req.user.expertId };
      if (status) {
        filter.status = status;
      }

      const { ExpertCollaboration } = await import('../models');
      const collaborations = await ExpertCollaboration.find(filter)
        .sort({ createdAt: -1 })
        .limit(Number(limit) * Number(page))
        .skip((Number(page) - 1) * Number(limit))
        .populate('clientId', 'firstName lastName email')
        .populate('serviceId', 'title')
        .lean();

      const total = await ExpertCollaboration.countDocuments(filter);

      res.status(200).json({
        success: true,
        data: {
          collaborations,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      logger.error('Get collaborations failed:', error);
      throw error;
    }
  });

  /**
   * Get expert verification status
   */
  getVerificationStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    try {
      const expert = await ExpertProfile.findById(req.user.expertId)
        .select('verificationStatus verificationDate verificationExpiryDate documents')
        .lean();

      if (!expert) {
        throw new NotFoundError('Expert');
      }

      const verificationStatus = {
        status: expert.verificationStatus,
        verificationDate: expert.verificationDate,
        expiryDate: expert.verificationExpiryDate,
        documents: expert.documents.map(doc => ({
          type: doc.type,
          name: doc.name,
          verified: doc.verified,
          uploadedAt: doc.uploadedAt
        }))
      };

      res.status(200).json({
        success: true,
        data: { verification: verificationStatus }
      });
    } catch (error) {
      logger.error('Get verification status failed:', error);
      throw error;
    }
  });

  /**
   * Upload verification documents
   */
  uploadVerificationDocuments = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    const files = req.files as Express.Multer.File[];
    const { documentTypes } = req.body;

    if (!files || files.length === 0) {
      throw new ValidationError('Documents required');
    }

    try {
      const documents = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const documentType = documentTypes[i];

        // Upload to Azure Storage
        const documentUrl = await this.uploadToAzureStorage(file);

        documents.push({
          type: documentType,
          name: file.originalname,
          url: documentUrl,
          uploadedAt: new Date(),
          verified: false
        });
      }

      // Add documents to expert profile
      const expert = await ExpertProfile.findByIdAndUpdate(
        req.user.expertId,
        { $push: { documents: { $each: documents } } },
        { new: true }
      ).select('documents verificationStatus');

      if (!expert) {
        throw new NotFoundError('Expert');
      }

      // Update verification status to pending if not already verified
      if (expert.verificationStatus === 'unverified') {
        expert.verificationStatus = 'pending';
        await expert.save();
      }

      logger.info('Verification documents uploaded', {
        expertId: req.user.expertId,
        documentCount: documents.length
      });

      res.status(200).json({
        success: true,
        message: 'Documents uploaded successfully. Verification is pending review.',
        data: {
          documents: expert.documents,
          verificationStatus: expert.verificationStatus
        }
      });
    } catch (error) {
      logger.error('Upload verification documents failed:', error);
      throw error;
    }
  });

  /**
   * Placeholder for Azure Storage upload
   */
  private async uploadToAzureStorage(file: Express.Multer.File): Promise<string> {
    // This would integrate with Azure Blob Storage
    // For now, return a mock URL
    return `https://foodxchange.blob.core.windows.net/experts/${Date.now()}-${file.originalname}`;
  }
}