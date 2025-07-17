import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { Product, IProduct } from '../models/Product';
import { Company } from '../models/Company';
import { Logger } from '../core/logging/logger';
import { ValidationError, NotFoundError } from '../core/errors';
import { AzureSearchService } from '../services/search/AzureSearchService';
import { cacheHelpers, cacheKeys } from '../config/redis';
import { uploadToAzureBlob } from '../services/azure/BlobStorageService';

const logger = new Logger('ProductController');
const searchService = new AzureSearchService();

export class ProductController {
  /**
   * Get all products with filtering and pagination
   */
  getProducts = asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const sort = (req.query.sort as string) || '-createdAt';
    
    // Build filter
    const filter: any = { 
      tenantId: req.tenantId,
      status: 'active',
      isPublished: true
    };

    if (req.query.category) {
      filter.category = req.query.category;
    }

    if (req.query.supplier) {
      filter.supplier = req.query.supplier;
    }

    if (req.query.inStock === 'true') {
      filter['inventory.availableQuantity'] = { $gt: 0 };
    }

    // Check cache
    const cacheKey = cacheKeys.productList(req.tenantId!, page);
    const cached = await cacheHelpers.getJSON(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('supplier', 'name')
        .select('-__v')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Product.countDocuments(filter)
    ]);

    const response = {
      success: true,
      data: {
        products,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };

    // Cache for 5 minutes
    await cacheHelpers.setWithExpiry(cacheKey, response, 300);

    res.json(response);
  });

  /**
   * Search products using Azure Cognitive Search
   */
  searchProducts = asyncHandler(async (req: Request, res: Response) => {
    const { q, page = 1, pageSize = 20, ...filters } = req.query;

    if (!q && !filters) {
      throw new ValidationError('Search query or filters required');
    }

    const searchOptions = {
      page: parseInt(page as string),
      pageSize: parseInt(pageSize as string),
      filters: {
        ...filters,
        tenantId: req.tenantId!
      },
      highlight: true,
      fuzzy: true
    };

    const results = await searchService.searchProducts(q as string || '', searchOptions);

    res.json({
      success: true,
      data: results
    });
  });

  /**
   * Get product autocomplete suggestions
   */
  getAutocomplete = asyncHandler(async (req: Request, res: Response) => {
    const { q } = req.query;

    if (!q || (q as string).length < 2) {
      return res.json({
        success: true,
        data: []
      });
    }

    const suggestions = await searchService.autocomplete(
      q as string,
      req.tenantId!,
      10
    );

    res.json({
      success: true,
      data: suggestions
    });
  });

  /**
   * Get single product by ID or slug
   */
  getProduct = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Check cache
    const cacheKey = cacheKeys.product(id);
    const cached = await cacheHelpers.getJSON(cacheKey);
    
    if (cached) {
      return res.json({
        success: true,
        data: cached
      });
    }

    // Try to find by ID first, then by slug
    let product = await Product.findOne({
      _id: id,
      tenantId: req.tenantId,
      status: 'active',
      isPublished: true
    }).populate('supplier', 'name rating');

    if (!product) {
      product = await Product.findOne({
        slug: id,
        tenantId: req.tenantId,
        status: 'active',
        isPublished: true
      }).populate('supplier', 'name rating');
    }

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // Increment view count
    await Product.findByIdAndUpdate(product._id, {
      $inc: { 'analytics.views': 1 }
    });

    // Cache for 1 hour
    await cacheHelpers.setWithExpiry(cacheKey, product, 3600);

    res.json({
      success: true,
      data: product
    });
  });

  /**
   * Get similar products
   */
  getSimilarProducts = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    const similarProducts = await searchService.getSimilarProducts(
      id,
      req.tenantId!,
      limit
    );

    res.json({
      success: true,
      data: similarProducts
    });
  });

  /**
   * Create new product
   */
  createProduct = asyncHandler(async (req: Request, res: Response) => {
    const productData = {
      ...req.body,
      tenantId: req.tenantId,
      supplier: req.user.company || req.body.supplier,
      createdBy: req.userId
    };

    // Validate supplier
    const supplier = await Company.findById(productData.supplier);
    if (!supplier || supplier._id.toString() !== req.tenantId) {
      throw new ValidationError('Invalid supplier');
    }

    // Create product
    const product = new Product(productData);
    await product.save();

    // Index in search if published
    if (product.isPublished) {
      await searchService.indexProduct(product);
    }

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
  updateProduct = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const product = await Product.findOne({
      _id: id,
      tenantId: req.tenantId
    });

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // Update fields
    Object.assign(product, {
      ...req.body,
      updatedBy: req.userId,
      version: product.version + 1
    });

    await product.save();

    // Update search index
    if (product.isPublished) {
      await searchService.indexProduct(product);
    } else {
      await searchService.removeProduct(product._id.toString());
    }

    // Clear cache
    await cacheHelpers.deletePattern(`product:${product._id}*`);
    await cacheHelpers.deletePattern(`products:${req.tenantId}:*`);

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
  uploadProductImages = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const product = await Product.findOne({
      _id: id,
      tenantId: req.tenantId
    });

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    if (!req.files || !Array.isArray(req.files)) {
      throw new ValidationError('No files uploaded');
    }

    const uploadedImages = [];

    for (const file of req.files) {
      const url = await uploadToAzureBlob(
        file,
        'products',
        `${req.tenantId}/${product._id}`
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
  deleteProductImage = asyncHandler(async (req: Request, res: Response) => {
    const { id, imageId } = req.params;

    const product = await Product.findOne({
      _id: id,
      tenantId: req.tenantId
    });

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    const imageIndex = product.images.findIndex(
      img => img._id?.toString() === imageId
    );

    if (imageIndex === -1) {
      throw new NotFoundError('Image not found');
    }

    product.images.splice(imageIndex, 1);

    // If deleted image was primary, make first image primary
    if (product.images.length > 0 && !product.images.some(img => img.isPrimary)) {
      product.images[0].isPrimary = true;
    }

    await product.save();

    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
  });

  /**
   * Update product inventory
   */
  updateInventory = asyncHandler(async (req: Request, res: Response) => {
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

    await product.updateInventory(quantity, operation);

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
   * Bulk import products
   */
  bulkImportProducts = asyncHandler(async (req: Request, res: Response) => {
    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      throw new ValidationError('Products array required');
    }

    const maxBulkSize = req.tenantContext?.subscriptionTier === 'enterprise' ? 1000 :
                       req.tenantContext?.subscriptionTier === 'premium' ? 500 :
                       req.tenantContext?.subscriptionTier === 'standard' ? 100 : 50;

    if (products.length > maxBulkSize) {
      throw new ValidationError(`Bulk import limited to ${maxBulkSize} products for your tier`);
    }

    const results = {
      success: [],
      failed: []
    };

    for (const productData of products) {
      try {
        const product = new Product({
          ...productData,
          tenantId: req.tenantId,
          supplier: req.user.company || productData.supplier,
          createdBy: req.userId
        });

        await product.save();
        results.success.push({ sku: product.sku, id: product._id });

        if (product.isPublished) {
          await searchService.indexProduct(product);
        }
      } catch (error) {
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
   * Export products
   */
  exportProducts = asyncHandler(async (req: Request, res: Response) => {
    const format = req.query.format || 'json';
    const filter: any = {
      tenantId: req.tenantId,
      status: { $ne: 'discontinued' }
    };

    if (req.query.category) {
      filter.category = req.query.category;
    }

    const products = await Product.find(filter)
      .populate('supplier', 'name')
      .lean();

    let exportData;

    switch (format) {
      case 'csv':
        // Convert to CSV format
        exportData = this.convertToCSV(products);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=products.csv');
        break;

      case 'excel':
        // Would use exceljs library here
        throw new ValidationError('Excel export not implemented yet');

      default:
        exportData = products;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=products.json');
    }

    res.send(exportData);
  });

  /**
   * Delete product (soft delete)
   */
  deleteProduct = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const product = await Product.findOne({
      _id: id,
      tenantId: req.tenantId
    });

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    product.status = 'discontinued';
    product.isPublished = false;
    await product.save();

    // Remove from search index
    await searchService.removeProduct(product._id.toString());

    // Clear cache
    await cacheHelpers.deletePattern(`product:${product._id}*`);
    await cacheHelpers.deletePattern(`products:${req.tenantId}:*`);

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
   * Convert products to CSV format
   */
  private convertToCSV(products: any[]): string {
    const headers = [
      'SKU',
      'Name',
      'Category',
      'Brand',
      'Price',
      'Currency',
      'Unit',
      'Available Quantity',
      'Status'
    ];

    const rows = products.map(p => [
      p.sku,
      p.name,
      p.category,
      p.brand || '',
      p.pricing.basePrice,
      p.pricing.currency,
      p.pricing.unit,
      p.inventory.availableQuantity,
      p.status
    ]);

    return [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
  }
}

export default ProductController;