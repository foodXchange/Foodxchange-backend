import { createWriteStream } from 'fs';

import csv from 'csv-parser';
import { Request, Response, NextFunction } from 'express';
import asyncHandler from 'express-async-handler';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';
import multer from 'multer';

import { cacheHelpers, cacheKeys } from '../../config/redis';
import { ValidationError, NotFoundError, AuthorizationError } from '../../core/errors';
import { Logger } from '../../core/logging/logger';
import { Company } from '../../models/Company';
import { Order } from '../../models/Order';
import { Product, IProduct } from '../../models/Product';
import { getRecommendationService } from '../../services/ai/RecommendationService';
import { getAnalyticsService } from '../../services/analytics/AnalyticsService';
import { uploadToAzureBlob, deleteFromAzureBlob } from '../../services/azure/BlobStorageService';

const logger = new Logger('ProductController');
const recommendationService = getRecommendationService();
const analyticsService = getAnalyticsService();

// Type alias for Request with authentication
type AuthRequest = Request & {
  user?: {
    id: string;
    _id?: string;  // For backward compatibility
    email: string;
    role: string;
    company?: string;
  };
  userId?: string;
  tenantId?: string;
  tenantContext?: {
    subscriptionTier: 'free' | 'standard' | 'premium' | 'enterprise';
  };
};

export class ProductController {
  /**
   * Get all products with advanced filtering, search and pagination
   */
  getProducts = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const {
      page = '1',
      limit = '20',
      search,
      category,
      subcategory,
      supplier,
      minPrice,
      maxPrice,
      inStock,
      organic,
      certified,
      location,
      sortBy = '-createdAt',
      featured,
      tags
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    // Build filter
    const filter: any = {
      tenantId: req.tenantId,
      status: 'active',
      isPublished: true
    };

    // Apply filters
    if (category) filter.category = category;
    if (subcategory) filter.subcategory = subcategory;
    if (supplier) filter.supplier = supplier;
    if (inStock === 'true') filter['inventory.availableQuantity'] = { $gt: 0 };
    if (organic === 'true') filter['foodSafety.isOrganic'] = true;
    if (certified === 'true') filter.certifications = { $exists: true, $ne: [] };
    if (location) filter.countryOfOrigin = { $regex: location, $options: 'i' };
    if (featured === 'true') filter['marketing.featured'] = true;
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      filter.tags = { $in: tagArray };
    }

    // Price range filter
    if (minPrice || maxPrice) {
      filter['pricing.basePrice'] = {};
      if (minPrice) filter['pricing.basePrice'].$gte = parseFloat(minPrice as string);
      if (maxPrice) filter['pricing.basePrice'].$lte = parseFloat(maxPrice as string);
    }

    // Search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search as string, 'i')] } },
        { 'marketing.keywords': { $in: [new RegExp(search as string, 'i')] } }
      ];
    }

    // Check cache
    const cacheKey = cacheKeys.productList(req.tenantId, pageNum);
    const cached = await cacheHelpers.getJSON(cacheKey);

    if (cached && !search && !Object.keys(req.query).some(k => !['page', 'limit'].includes(k))) {
      res.json(cached);
      return;
    }

    const skip = (pageNum - 1) * limitNum;

    // Execute query with population
    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('supplier', 'name rating verificationLevel country')
        .select('-__v -customAttributes')
        .sort(sortBy as string)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(filter)
    ]);

    const response = {
      success: true,
      data: {
        products,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
          hasMore: pageNum < Math.ceil(total / limitNum)
        }
      }
    };

    // Cache for 5 minutes if no search
    if (!search) {
      await cacheHelpers.setWithExpiry(cacheKey, response, 300);
    }

    res.json(response);
  });

  /**
   * Search products with advanced features
   */
  searchProducts = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { userId, tenantId } = req;
    const { q, ...filters } = req.query;

    if (!q && !Object.keys(filters).length) {
      throw new ValidationError('Search query or filters required');
    }

    // Use recommendation service for advanced search
    const searchResults = await recommendationService.advancedSearch(
      tenantId,
      userId,
      q as string || '',
      {
        categories: filters.categories as string[],
        priceRange: filters.minPrice || filters.maxPrice ? {
          min: parseFloat(filters.minPrice as string || '0'),
          max: parseFloat(filters.maxPrice as string || '999999')
        } : undefined,
        location: filters.location as string,
        organic: filters.organic === 'true',
        certified: filters.certified === 'true',
        suppliers: filters.suppliers as string[],
        page: parseInt(filters.page as string || '1'),
        limit: parseInt(filters.limit as string || '20')
      }
    );

    res.json({
      success: true,
      data: searchResults
    });
  });

  /**
   * Get product autocomplete suggestions
   */
  getAutocomplete = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { q } = req.query;

    if (!q || (q as string).length < 2) {
      res.json({
        success: true,
        data: []
      });
      return;
    }

    const suggestions = await recommendationService.generateSearchSuggestions(
      req.tenantId,
      q as string
    );

    res.json({
      success: true,
      data: suggestions
    });
  });

  /**
   * Get single product by ID or slug
   */
  getProduct = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    // Check cache
    const cacheKey = cacheKeys.product(id);
    const cached = await cacheHelpers.getJSON(cacheKey);

    if (cached) {
      res.json({
        success: true,
        data: cached
      });
      return;
    }

    // Try to find by ID first, then by slug
    let product = await Product.findOne({
      _id: id,
      tenantId: req.tenantId,
      status: 'active',
      isPublished: true
    }).populate('supplier', 'name rating verificationLevel country certifications');

    if (!product) {
      product = await Product.findOne({
        slug: id,
        tenantId: req.tenantId,
        status: 'active',
        isPublished: true
      }).populate('supplier', 'name rating verificationLevel country certifications');
    }

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // Increment view count and track analytics
    await Promise.all([
      Product.findByIdAndUpdate(product._id, {
        $inc: { 'analytics.views': 1, 'analytics.uniqueViews': 1 }
      }),
      analyticsService.trackEvent({
        tenantId: req.tenantId,
        userId: req.userId ? new mongoose.Types.ObjectId(req.userId) : undefined,
        eventType: 'product_view',
        category: 'product',
        data: {
          productId: product._id,
          productName: product.name,
          category: product.category,
          supplier: product.supplier
        }
      })
    ]);

    // Cache for 1 hour
    await cacheHelpers.setWithExpiry(cacheKey, product, 3600);

    res.json({
      success: true,
      data: product
    });
  });

  /**
   * Get personalized product recommendations
   */
  getRecommendations = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { limit = '20', categories, excludeViewed = 'false' } = req.query;

    const recommendations = await recommendationService.getPersonalizedRecommendations(
      req.tenantId,
      req.userId,
      {
        limit: parseInt(limit as string),
        categories: categories ? (Array.isArray(categories) ? categories : [categories]) as string[] : undefined,
        excludeProductIds: excludeViewed === 'true' ? [] : undefined, // TODO: Implement viewed products tracking
        includeReasons: true
      }
    );

    // Fetch product details for recommendations
    const productIds = recommendations.map(r => r.productId);
    const products = await Product.find({
      _id: { $in: productIds },
      tenantId: req.tenantId,
      status: 'active',
      isPublished: true
    })
      .populate('supplier', 'name rating')
      .lean();

    // Map recommendations with product details
    const enrichedRecommendations = recommendations.map(rec => {
      const product = products.find(p => p._id.toString() === rec.productId);
      return {
        ...rec,
        product
      };
    }).filter(r => r.product);

    res.json({
      success: true,
      data: enrichedRecommendations
    });
  });

  /**
   * Get similar products
   */
  getSimilarProducts = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { limit = '10' } = req.query;

    const product = await Product.findById(id);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // Find similar products based on category and tags
    const similarProducts = await Product.find({
      _id: { $ne: id },
      tenantId: req.tenantId,
      status: 'active',
      isPublished: true,
      $or: [
        { category: product.category },
        { subcategory: product.subcategory },
        { tags: { $in: product.tags } }
      ]
    })
      .populate('supplier', 'name rating')
      .limit(parseInt(limit as string))
      .sort('-analytics.averageRating -analytics.orders');

    res.json({
      success: true,
      data: similarProducts
    });
  });

  /**
   * Create new product (Supplier only)
   */
  createProduct = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`);
    }

    // Check supplier permissions
    if (req.user?.role !== 'supplier' && req.user?.role !== 'admin') {
      throw new AuthorizationError('Only suppliers can create products');
    }

    const productData = {
      ...req.body,
      tenantId: req.tenantId,
      supplier: req.user.company || req.body.supplier,
      createdBy: req.userId
    };

    // Validate supplier
    const supplier = await Company.findById(productData.supplier);
    if (!supplier) {
      throw new ValidationError('Invalid supplier');
    }

    // Create product
    const product = new Product(productData);
    await product.save();

    // Track analytics
    await analyticsService.trackEvent({
      tenantId: req.tenantId,
      userId: req.userId ? new mongoose.Types.ObjectId(req.userId) : undefined,
      eventType: 'product_created',
      category: 'product',
      data: {
        productId: product._id,
        sku: product.sku,
        category: product.category
      }
    });

    logger.info('Product created', {
      productId: product._id,
      sku: product.sku,
      tenantId: req.tenantId,
      createdBy: req.userId
    });

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });
  });

  /**
   * Update product
   */
  updateProduct = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    const product = await Product.findOne({
      _id: id,
      tenantId: req.tenantId
    });

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // Check permissions
    if (req.user?.role === 'supplier' && product.supplier.toString() !== req.user.company) {
      throw new AuthorizationError('Not authorized to update this product');
    }

    // Update fields
    Object.assign(product, {
      ...req.body,
      updatedBy: req.userId,
      version: product.version + 1
    });

    await product.save();

    // Clear cache
    await Promise.all([
      cacheHelpers.deletePattern(`product:${product._id}*`),
      cacheHelpers.deletePattern(`products:${req.tenantId}:*`)
    ]);

    logger.info('Product updated', {
      productId: product._id,
      sku: product.sku,
      version: product.version,
      updatedBy: req.userId
    });

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: product
    });
  });

  /**
   * Upload product images
   */
  uploadProductImages = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    const product = await Product.findOne({
      _id: id,
      tenantId: req.tenantId
    });

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // Check permissions
    if (req.user?.role === 'supplier' && product.supplier.toString() !== req.user.company) {
      throw new AuthorizationError('Not authorized to update this product');
    }

    if (!req.files || !Array.isArray(req.files)) {
      throw new ValidationError('No files uploaded');
    }

    const uploadedImages = [];

    for (const file of req.files) {
      const url = await uploadToAzureBlob(
        file,
        `products/${req.tenantId}/${product._id}`,
        undefined
      );

      uploadedImages.push({
        url,
        alt: file.originalname,
        isPrimary: product.images.length === 0 && uploadedImages.length === 0,
        order: product.images.length + uploadedImages.length
      });
    }

    product.images.push(...uploadedImages);
    await product.save();

    // Clear cache
    await cacheHelpers.deletePattern(`product:${product._id}*`);

    logger.info('Product images uploaded', {
      productId: product._id,
      imageCount: uploadedImages.length
    });

    res.json({
      success: true,
      message: 'Images uploaded successfully',
      data: uploadedImages
    });
  });

  /**
   * Delete product image
   */
  deleteProductImage = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id, imageId } = req.params;

    const product = await Product.findOne({
      _id: id,
      tenantId: req.tenantId
    });

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // Check permissions
    if (req.user?.role === 'supplier' && product.supplier.toString() !== req.user.company) {
      throw new AuthorizationError('Not authorized to update this product');
    }

    const imageIndex = product.images.findIndex(
      img => (img as any)._id?.toString() === imageId
    );

    if (imageIndex === -1) {
      throw new NotFoundError('Image not found');
    }

    const imageUrl = product.images[imageIndex].url;
    product.images.splice(imageIndex, 1);

    // If deleted image was primary, make first image primary
    if (product.images.length > 0 && !product.images.some(img => img.isPrimary)) {
      product.images[0].isPrimary = true;
    }

    await product.save();

    // Delete from blob storage
    try {
      await deleteFromAzureBlob(imageUrl);
    } catch (error) {
      logger.error('Failed to delete image from blob storage:', error);
    }

    // Clear cache
    await cacheHelpers.deletePattern(`product:${product._id}*`);

    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
  });

  /**
   * Update product inventory
   */
  updateInventory = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { quantity, operation } = req.body;

    if (!['add', 'subtract', 'reserve'].includes(operation)) {
      throw new ValidationError('Invalid operation');
    }

    const product = await Product.findOne({
      _id: id,
      tenantId: req.tenantId
    });

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // Check permissions
    if (req.user?.role === 'supplier' && product.supplier.toString() !== req.user.company) {
      throw new AuthorizationError('Not authorized to update this product');
    }

    await product.updateInventory(quantity, operation);

    // Clear cache
    await cacheHelpers.deletePattern(`product:${product._id}*`);

    logger.info('Product inventory updated', {
      productId: product._id,
      operation,
      quantity,
      newQuantity: product.inventory.quantity,
      availableQuantity: product.inventory.availableQuantity
    });

    res.json({
      success: true,
      message: 'Inventory updated successfully',
      data: {
        quantity: product.inventory.quantity,
        reservedQuantity: product.inventory.reservedQuantity,
        availableQuantity: product.inventory.availableQuantity
      }
    });
  });

  /**
   * Update product pricing
   */
  updatePricing = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { basePrice, tierPricing, currency } = req.body;

    const product = await Product.findOne({
      _id: id,
      tenantId: req.tenantId
    });

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // Check permissions
    if (req.user?.role === 'supplier' && product.supplier.toString() !== req.user.company) {
      throw new AuthorizationError('Not authorized to update this product');
    }

    // Update pricing
    if (basePrice !== undefined) product.pricing.basePrice = basePrice;
    if (currency) product.pricing.currency = currency;
    if (tierPricing) product.pricing.tierPricing = tierPricing;

    await product.save();

    // Clear cache
    await cacheHelpers.deletePattern(`product:${product._id}*`);

    res.json({
      success: true,
      message: 'Pricing updated successfully',
      data: product.pricing
    });
  });

  /**
   * Bulk import products
   */
  bulkImportProducts = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      throw new ValidationError('Products array required');
    }

    // Check tier limits
    const maxBulkSize = req.tenantContext?.subscriptionTier === 'enterprise' ? 1000 :
      req.tenantContext?.subscriptionTier === 'premium' ? 500 :
        req.tenantContext?.subscriptionTier === 'standard' ? 100 : 50;

    if (products.length > maxBulkSize) {
      throw new ValidationError(`Bulk import limited to ${maxBulkSize} products for your tier`);
    }

    const results = {
      success: [] as any[],
      failed: [] as any[]
    };

    for (const productData of products) {
      try {
        const product = new Product({
          ...productData,
          tenantId: req.tenantId,
          supplier: req.user?.company || productData.supplier,
          createdBy: req.userId
        });

        await product.save();
        results.success.push({ sku: product.sku, id: product._id });
      } catch (error: any) {
        results.failed.push({
          sku: productData.sku,
          error: error.message
        });
      }
    }

    logger.info('Bulk product import completed', {
      tenantId: req.tenantId,
      total: products.length,
      success: results.success.length,
      failed: results.failed.length
    });

    res.json({
      success: true,
      message: `Imported ${results.success.length} products successfully`,
      data: results
    });
  });

  /**
   * Import products from CSV
   */
  importProductsFromCSV = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    if (!req.file) {
      throw new ValidationError('CSV file required');
    }

    const results = {
      success: [] as any[],
      failed: [] as any[],
      total: 0
    };

    const products: any[] = [];

    // Parse CSV file
    await new Promise((resolve, reject) => {
      const stream = require('stream');
      const bufferStream = new stream.PassThrough();
      bufferStream.end(req.file.buffer);

      bufferStream
        .pipe(csv())
        .on('data', (row) => {
          products.push(row);
          results.total++;
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Process products
    for (const productData of products) {
      try {
        const product = new Product({
          name: productData.name || productData.productName,
          description: productData.description,
          sku: productData.sku || `SKU-${Date.now()}-${results.total}`,
          category: productData.category || 'uncategorized',
          pricing: {
            basePrice: parseFloat(productData.price || productData.unitPrice || '0'),
            currency: productData.currency || 'USD',
            unit: productData.unit || 'each'
          },
          inventory: {
            quantity: parseInt(productData.quantity || '0'),
            availableQuantity: parseInt(productData.quantity || '0'),
            trackInventory: true
          },
          tenantId: req.tenantId,
          supplier: req.user?.company,
          createdBy: req.userId,
          status: 'active',
          isPublished: false
        });

        await product.save();
        results.success.push({
          sku: product.sku,
          id: product._id,
          name: product.name
        });
      } catch (error: any) {
        results.failed.push({
          row: products.indexOf(productData) + 2, // +2 for header row and 0-index
          name: productData.name || productData.productName,
          error: error.message
        });
      }
    }

    logger.info('CSV product import completed', {
      tenantId: req.tenantId,
      total: results.total,
      success: results.success.length,
      failed: results.failed.length
    });

    res.json({
      success: true,
      message: `Imported ${results.success.length} of ${results.total} products`,
      data: results
    });
  });

  /**
   * Export products
   */
  exportProducts = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { format = 'json', category, status } = req.query;

    const filter: any = {
      tenantId: req.tenantId
    };

    if (category) filter.category = category;
    if (status) filter.status = status;
    else filter.status = { $ne: 'discontinued' };

    const products = await Product.find(filter)
      .populate('supplier', 'name')
      .lean();

    let exportData: any;
    let contentType: string;
    let filename: string;

    switch (format) {
      case 'csv':
        exportData = this.convertToCSV(products);
        contentType = 'text/csv';
        filename = 'products.csv';
        break;

      case 'excel':
        exportData = await this.convertToExcel(products);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = 'products.xlsx';
        break;

      default:
        exportData = JSON.stringify(products, null, 2);
        contentType = 'application/json';
        filename = 'products.json';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(exportData);
  });

  /**
   * Get product categories
   */
  getCategories = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const categories = await Product.aggregate([
      {
        $match: {
          tenantId: req.tenantId,
          status: 'active',
          isPublished: true
        }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          subcategories: { $addToSet: '$subcategory' }
        }
      },
      {
        $project: {
          category: '$_id',
          count: 1,
          subcategories: {
            $filter: {
              input: '$subcategories',
              cond: { $ne: ['$$this', null] }
            }
          }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: categories
    });
  });

  /**
   * Get featured products
   */
  getFeaturedProducts = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { limit = '10', category } = req.query;

    const filter: any = {
      tenantId: req.tenantId,
      status: 'active',
      isPublished: true,
      'marketing.featured': true
    };

    if (category) filter.category = category;

    const products = await Product.find(filter)
      .populate('supplier', 'name rating')
      .limit(parseInt(limit as string))
      .sort('-analytics.averageRating -analytics.orders');

    res.json({
      success: true,
      data: products
    });
  });

  /**
   * Get trending products
   */
  getTrendingProducts = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { limit = '10', days = '7' } = req.query;

    const trendingRecommendations = await recommendationService.getTrendingRecommendations(
      req.tenantId,
      undefined,
      parseInt(limit as string)
    );

    // Fetch product details
    const productIds = trendingRecommendations.map(r => r.productId);
    const products = await Product.find({
      _id: { $in: productIds },
      tenantId: req.tenantId,
      status: 'active',
      isPublished: true
    })
      .populate('supplier', 'name rating')
      .lean();

    res.json({
      success: true,
      data: products
    });
  });

  /**
   * Request product sample
   */
  requestSample = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { quantity, message, shippingAddress } = req.body;

    const product = await Product.findById(id);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // Here you would create a sample request record
    // For now, we'll just track the analytics event
    await analyticsService.trackEvent({
      tenantId: req.tenantId,
      userId: req.userId ? new mongoose.Types.ObjectId(req.userId) : new mongoose.Types.ObjectId(),
      eventType: 'sample_requested',
      category: 'product',
      data: {
        productId: product._id,
        productName: product.name,
        supplier: product.supplier,
        quantity,
        message
      }
    });

    res.json({
      success: true,
      message: 'Sample request submitted successfully',
      data: {
        productId: product._id,
        productName: product.name,
        requestedBy: req.userId,
        status: 'pending'
      }
    });
  });

  /**
   * Delete product (soft delete)
   */
  deleteProduct = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    const product = await Product.findOne({
      _id: id,
      tenantId: req.tenantId
    });

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // Check permissions
    if (req.user?.role === 'supplier' && product.supplier.toString() !== req.user.company) {
      throw new AuthorizationError('Not authorized to delete this product');
    }

    product.status = 'discontinued';
    product.isPublished = false;
    await product.save();

    // Clear cache
    await Promise.all([
      cacheHelpers.deletePattern(`product:${product._id}*`),
      cacheHelpers.deletePattern(`products:${req.tenantId}:*`)
    ]);

    logger.info('Product deleted', {
      productId: product._id,
      sku: product.sku,
      deletedBy: req.userId
    });

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  });

  /**
   * Compare multiple products
   */
  compareProducts = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { productIds } = req.body;

    if (!Array.isArray(productIds) || productIds.length < 2 || productIds.length > 4) {
      throw new ValidationError('Please provide 2-4 product IDs for comparison');
    }

    const products = await Product.find({
      _id: { $in: productIds },
      tenantId: req.tenantId,
      status: 'active',
      isPublished: true
    }).populate('supplier', 'name rating verificationLevel');

    if (products.length !== productIds.length) {
      throw new NotFoundError('One or more products not found');
    }

    // Define comparison attributes
    const comparisonData = products.map(product => ({
      id: product._id,
      name: product.name,
      images: product.images,
      pricing: product.pricing,
      category: product.category,
      supplier: product.supplier,
      inventory: {
        available: product.inventory.availableQuantity > 0,
        quantity: product.inventory.availableQuantity
      },
      foodSafety: product.foodSafety,
      certifications: product.certifications,
      packaging: product.packaging,
      nutritionalInfo: product.nutritionalInfo,
      analytics: {
        rating: product.analytics.averageRating,
        reviews: product.analytics.totalReviews,
        orders: product.analytics.orders
      },
      shelfLife: product.foodSafety.shelfLife,
      logistics: product.logistics
    }));

    res.json({
      success: true,
      data: comparisonData
    });
  });

  /**
   * Get bulk pricing for a product
   */
  getBulkPricing = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { quantities } = req.query;

    const product = await Product.findById(id);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    let pricingTiers = [];

    if (quantities) {
      // Calculate prices for specific quantities
      const quantityArray = (quantities as string).split(',').map(q => parseInt(q));
      pricingTiers = quantityArray.map(quantity => ({
        quantity,
        unitPrice: product.calculatePrice(quantity) / quantity,
        totalPrice: product.calculatePrice(quantity)
      }));
    } else {
      // Return all configured tier pricing
      pricingTiers = product.pricing.tierPricing.map(tier => ({
        minQuantity: tier.minQuantity,
        maxQuantity: tier.maxQuantity,
        price: tier.price,
        discount: tier.discount
      }));
    }

    res.json({
      success: true,
      data: {
        productId: product._id,
        productName: product.name,
        basePrice: product.pricing.basePrice,
        currency: product.pricing.currency,
        unit: product.pricing.unit,
        bulkPricingTiers: pricingTiers
      }
    });
  });

  /**
   * Helper method to convert products to CSV format
   */
  private convertToCSV(products: any[]): string {
    const headers = [
      'SKU',
      'Name',
      'Description',
      'Category',
      'Subcategory',
      'Brand',
      'Price',
      'Currency',
      'Unit',
      'Available Quantity',
      'Status',
      'Supplier',
      'Country of Origin',
      'Organic',
      'Shelf Life',
      'Created Date'
    ];

    const rows = products.map(p => [
      p.sku,
      p.name,
      p.description || '',
      p.category,
      p.subcategory || '',
      p.brand || '',
      p.pricing.basePrice,
      p.pricing.currency,
      p.pricing.unit,
      p.inventory.availableQuantity,
      p.status,
      p.supplier?.name || '',
      p.countryOfOrigin || '',
      p.foodSafety?.isOrganic ? 'Yes' : 'No',
      p.foodSafety?.shelfLife ? `${p.foodSafety.shelfLife.value} ${p.foodSafety.shelfLife.unit}` : '',
      new Date(p.createdAt).toLocaleDateString()
    ]);

    return [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
  }

  private async convertToExcel(products: any[]): Promise<Buffer> {
    // Dynamic import to avoid loading if not used
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    // Define columns
    worksheet.columns = [
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Subcategory', key: 'subcategory', width: 20 },
      { header: 'Brand', key: 'brand', width: 20 },
      { header: 'Price', key: 'price', width: 12 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Available Quantity', key: 'quantity', width: 18 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Supplier', key: 'supplier', width: 25 },
      { header: 'Country of Origin', key: 'origin', width: 20 },
      { header: 'Organic', key: 'organic', width: 10 },
      { header: 'Shelf Life', key: 'shelfLife', width: 15 },
      { header: 'Created Date', key: 'createdAt', width: 15 }
    ];

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows
    products.forEach(product => {
      worksheet.addRow({
        sku: product.sku,
        name: product.name,
        description: product.description || '',
        category: product.category,
        subcategory: product.subcategory || '',
        brand: product.brand || '',
        price: product.pricing.basePrice,
        currency: product.pricing.currency,
        unit: product.pricing.unit,
        quantity: product.inventory?.availableQuantity || 0,
        status: product.status,
        supplier: product.supplier?.name || '',
        origin: product.countryOfOrigin || '',
        organic: product.foodSafety?.isOrganic ? 'Yes' : 'No',
        shelfLife: product.foodSafety?.shelfLife
          ? `${product.foodSafety.shelfLife.value} ${product.foodSafety.shelfLife.unit}`
          : '',
        createdAt: new Date(product.createdAt).toLocaleDateString()
      });
    });

    // Add autofilter
    worksheet.autoFilter = {
      from: 'A1',
      to: `P${products.length + 1}`
    };

    // Freeze the header row
    worksheet.views = [
      { state: 'frozen', xSplit: 0, ySplit: 1 }
    ];

    // Format price column as currency
    worksheet.getColumn('price').numFmt = '#,##0.00';

    // Add conditional formatting for status
    worksheet.addConditionalFormatting({
      ref: `K2:K${products.length + 1}`,
      rules: [
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"active"'],
          priority: 1,
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: 'FF90EE90' }
            }
          }
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"inactive"'],
          priority: 2,
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: 'FFFFA500' }
            }
          }
        }
      ]
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}

export default new ProductController();
