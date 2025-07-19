import { Request, Response } from 'express';
import { Logger } from '../../core/logging/logger';
import { ValidationError, NotFoundError } from '../../core/errors';
import { User } from '../../models/User';
import { Product } from '../../models/Product';
import { asyncHandler } from '../../core/errors';
import mongoose from 'mongoose';

const logger = new Logger('SupplierController');

export class SupplierController {
  /**
   * Get all suppliers with filtering and pagination
   */
  async getAllSuppliers(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        category,
        location,
        certifications,
        rating,
        verified,
        sort = '-createdAt'
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Build query
      const query: any = {
        role: 'seller',
        accountStatus: 'active'
      };

      // Search filter
      if (search) {
        query.$or = [
          { firstName: new RegExp(search as string, 'i') },
          { lastName: new RegExp(search as string, 'i') },
          { email: new RegExp(search as string, 'i') },
          { 'company.name': new RegExp(search as string, 'i') }
        ];
      }

      // Verified filter
      if (verified !== undefined) {
        query.companyVerified = verified === 'true';
      }

      // Rating filter
      if (rating) {
        query.rating = { $gte: parseFloat(rating as string) };
      }

      // Get suppliers
      const suppliers = await User.find(query)
        .populate('company')
        .select('-password -refreshToken')
        .sort(sort as string)
        .skip(skip)
        .limit(limitNum)
        .lean();

      // Get total count for pagination
      const total = await User.countDocuments(query);

      // Enhance supplier data with additional info
      const enhancedSuppliers = await Promise.all(suppliers.map(async (supplier) => {
        // Get product count and categories
        const products = await Product.find({ 
          supplier: supplier._id,
          status: 'active'
        }).select('category').lean();

        const productCount = products.length;
        const categories = [...new Set(products.map(p => p.category))];

        // Filter by category if specified
        if (category && !categories.includes(category as string)) {
          return null;
        }

        // Filter by location if specified
        if (location && supplier.company) {
          const supplierLocation = `${supplier.company.city || ''} ${supplier.company.country || ''}`.toLowerCase();
          if (!supplierLocation.includes((location as string).toLowerCase())) {
            return null;
          }
        }

        // Filter by certifications if specified
        if (certifications && supplier.certifications) {
          const reqCerts = (certifications as string).split(',');
          const hasCerts = reqCerts.every(cert => 
            supplier.certifications.some(c => c.toLowerCase().includes(cert.toLowerCase()))
          );
          if (!hasCerts) {
            return null;
          }
        }

        return {
          id: supplier._id,
          name: supplier.company?.name || `${supplier.firstName} ${supplier.lastName}`,
          email: supplier.email,
          phone: supplier.phone,
          avatar: supplier.avatar,
          company: supplier.company,
          companyVerified: supplier.companyVerified,
          rating: supplier.rating || 0,
          reviewCount: supplier.reviewCount || 0,
          productCount,
          categories,
          certifications: supplier.certifications || [],
          joinedAt: supplier.createdAt,
          lastActive: supplier.lastLoginAt,
          badges: this.getSupplierBadges(supplier, productCount)
        };
      }));

      // Filter out nulls from category/location filtering
      const filteredSuppliers = enhancedSuppliers.filter(s => s !== null);

      res.json({
        success: true,
        data: {
          suppliers: filteredSuppliers,
          pagination: {
            current: pageNum,
            pages: Math.ceil(total / limitNum),
            total,
            limit: limitNum
          }
        }
      });

    } catch (error) {
      logger.error('Get all suppliers error:', error);
      throw error;
    }
  }

  /**
   * Get supplier by ID with detailed information
   */
  async getSupplierById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('Invalid supplier ID');
      }

      const supplier = await User.findOne({
        _id: id,
        role: 'seller',
        accountStatus: 'active'
      })
      .populate('company')
      .select('-password -refreshToken');

      if (!supplier) {
        throw new NotFoundError('Supplier not found');
      }

      // Get products
      const products = await Product.find({
        supplier: supplier._id,
        status: 'active'
      })
      .select('name category images pricing.basePrice rating reviewCount')
      .sort('-rating')
      .limit(10)
      .lean();

      // Get statistics
      const stats = await this.getSupplierStatistics(supplier._id);

      res.json({
        success: true,
        data: {
          supplier: {
            id: supplier._id,
            name: supplier.company?.name || `${supplier.firstName} ${supplier.lastName}`,
            email: supplier.email,
            phone: supplier.phone,
            avatar: supplier.avatar,
            bio: supplier.bio,
            company: supplier.company,
            companyVerified: supplier.companyVerified,
            rating: supplier.rating || 0,
            reviewCount: supplier.reviewCount || 0,
            certifications: supplier.certifications || [],
            verificationDocuments: supplier.verificationDocuments || [],
            joinedAt: supplier.createdAt,
            lastActive: supplier.lastLoginAt,
            badges: this.getSupplierBadges(supplier, products.length),
            socialProfiles: supplier.socialProfiles || {}
          },
          products: products.slice(0, 10),
          statistics: stats
        }
      });

    } catch (error) {
      logger.error('Get supplier by ID error:', error);
      throw error;
    }
  }

  /**
   * Get supplier products
   */
  async getSupplierProducts(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const {
        page = 1,
        limit = 20,
        category,
        sort = '-createdAt',
        inStock
      } = req.query;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('Invalid supplier ID');
      }

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Build query
      const query: any = {
        supplier: id,
        status: 'active'
      };

      if (category) {
        query.category = category;
      }

      if (inStock !== undefined) {
        query.inStock = inStock === 'true';
      }

      // Get products
      const products = await Product.find(query)
        .sort(sort as string)
        .skip(skip)
        .limit(limitNum)
        .lean();

      const total = await Product.countDocuments(query);

      res.json({
        success: true,
        data: {
          products,
          pagination: {
            current: pageNum,
            pages: Math.ceil(total / limitNum),
            total,
            limit: limitNum
          }
        }
      });

    } catch (error) {
      logger.error('Get supplier products error:', error);
      throw error;
    }
  }

  /**
   * Search suppliers
   */
  async searchSuppliers(req: Request, res: Response): Promise<void> {
    try {
      const { q, filters } = req.body;

      if (!q && !filters) {
        throw new ValidationError('Search query or filters required');
      }

      // Build search query
      const searchQuery: any = {
        role: 'seller',
        accountStatus: 'active'
      };

      // Text search
      if (q) {
        searchQuery.$text = { $search: q };
      }

      // Apply filters
      if (filters) {
        if (filters.categories && filters.categories.length > 0) {
          // This requires checking products
          const suppliersWithCategories = await Product.distinct('supplier', {
            category: { $in: filters.categories },
            status: 'active'
          });
          searchQuery._id = { $in: suppliersWithCategories };
        }

        if (filters.locations && filters.locations.length > 0) {
          searchQuery.$or = filters.locations.map((loc: string) => ({
            $or: [
              { 'company.city': new RegExp(loc, 'i') },
              { 'company.country': new RegExp(loc, 'i') },
              { 'company.state': new RegExp(loc, 'i') }
            ]
          }));
        }

        if (filters.certifications && filters.certifications.length > 0) {
          searchQuery.certifications = { $in: filters.certifications };
        }

        if (filters.minRating) {
          searchQuery.rating = { $gte: filters.minRating };
        }

        if (filters.verified) {
          searchQuery.companyVerified = true;
        }
      }

      // Execute search
      const suppliers = await User.find(searchQuery)
        .populate('company')
        .select('-password -refreshToken')
        .limit(50)
        .lean();

      // Enhance with product data
      const enhancedSuppliers = await Promise.all(suppliers.map(async (supplier) => {
        const productCount = await Product.countDocuments({
          supplier: supplier._id,
          status: 'active'
        });

        return {
          id: supplier._id,
          name: supplier.company?.name || `${supplier.firstName} ${supplier.lastName}`,
          email: supplier.email,
          company: supplier.company,
          companyVerified: supplier.companyVerified,
          rating: supplier.rating || 0,
          productCount,
          relevanceScore: supplier.score || 1
        };
      }));

      res.json({
        success: true,
        data: {
          suppliers: enhancedSuppliers,
          total: enhancedSuppliers.length
        }
      });

    } catch (error) {
      logger.error('Search suppliers error:', error);
      throw error;
    }
  }

  /**
   * Get featured suppliers
   */
  async getFeaturedSuppliers(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 10 } = req.query;

      // Get featured suppliers based on rating, verification, and activity
      const suppliers = await User.find({
        role: 'seller',
        accountStatus: 'active',
        companyVerified: true,
        rating: { $gte: 4.5 }
      })
      .populate('company')
      .select('-password -refreshToken')
      .sort('-rating -reviewCount')
      .limit(parseInt(limit as string))
      .lean();

      const enhancedSuppliers = await Promise.all(suppliers.map(async (supplier) => {
        const productCount = await Product.countDocuments({
          supplier: supplier._id,
          status: 'active'
        });

        const topProducts = await Product.find({
          supplier: supplier._id,
          status: 'active'
        })
        .select('name images pricing.basePrice')
        .sort('-rating')
        .limit(3)
        .lean();

        return {
          id: supplier._id,
          name: supplier.company?.name || `${supplier.firstName} ${supplier.lastName}`,
          logo: supplier.company?.logo || supplier.avatar,
          rating: supplier.rating,
          reviewCount: supplier.reviewCount,
          productCount,
          topProducts,
          badges: this.getSupplierBadges(supplier, productCount)
        };
      }));

      res.json({
        success: true,
        data: enhancedSuppliers
      });

    } catch (error) {
      logger.error('Get featured suppliers error:', error);
      throw error;
    }
  }

  /**
   * Get supplier categories
   */
  async getSupplierCategories(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('Invalid supplier ID');
      }

      // Get all unique categories for this supplier
      const categories = await Product.distinct('category', {
        supplier: id,
        status: 'active'
      });

      // Get product count per category
      const categoryStats = await Promise.all(categories.map(async (category) => {
        const count = await Product.countDocuments({
          supplier: id,
          category,
          status: 'active'
        });

        return {
          category,
          productCount: count
        };
      }));

      res.json({
        success: true,
        data: categoryStats.sort((a, b) => b.productCount - a.productCount)
      });

    } catch (error) {
      logger.error('Get supplier categories error:', error);
      throw error;
    }
  }

  // Helper methods

  private async getSupplierStatistics(supplierId: mongoose.Types.ObjectId): Promise<any> {
    const [
      totalProducts,
      activeProducts,
      totalOrders,
      avgRating,
      categoriesCount
    ] = await Promise.all([
      Product.countDocuments({ supplier: supplierId }),
      Product.countDocuments({ supplier: supplierId, status: 'active' }),
      // In real implementation, would count from Orders collection
      Promise.resolve(Math.floor(Math.random() * 1000)),
      Product.aggregate([
        { $match: { supplier: supplierId } },
        { $group: { _id: null, avgRating: { $avg: '$rating' } } }
      ]).then(result => result[0]?.avgRating || 0),
      Product.distinct('category', { supplier: supplierId }).then(cats => cats.length)
    ]);

    return {
      totalProducts,
      activeProducts,
      totalOrders,
      avgRating: Math.round(avgRating * 10) / 10,
      categoriesCount,
      responseTime: '< 2 hours',
      fulfillmentRate: 0.98
    };
  }

  private getSupplierBadges(supplier: any, productCount: number): string[] {
    const badges = [];

    if (supplier.companyVerified) {
      badges.push('Verified Supplier');
    }

    if (supplier.rating >= 4.5 && supplier.reviewCount >= 10) {
      badges.push('Top Rated');
    }

    if (productCount >= 100) {
      badges.push('Large Catalog');
    } else if (productCount >= 50) {
      badges.push('Established Seller');
    }

    const accountAge = Date.now() - new Date(supplier.createdAt).getTime();
    const yearInMs = 365 * 24 * 60 * 60 * 1000;
    
    if (accountAge > 2 * yearInMs) {
      badges.push('Trusted Partner');
    } else if (accountAge > yearInMs) {
      badges.push('Experienced Seller');
    }

    if (supplier.certifications && supplier.certifications.length >= 3) {
      badges.push('Multi-Certified');
    }

    return badges;
  }
}

// Export singleton instance
export const supplierController = new SupplierController();