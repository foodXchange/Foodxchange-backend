// File: C:\Users\foodz\Documents\GitHub\Development\Foodxchange-backend\src\controllers\marketplace\productController.ts

import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import ProductEnhanced from '@/models/marketplace/ProductEnhanced';
import SampleRequest from '@/models/marketplace/SampleRequest';
import {
  ProductQueryParams,
  MarketplaceFilters,
  SearchResults,
  ProductDocument,
  SampleRequestDocument,
  MarketplaceApiResponse,
  CreateProductRequest,
  UpdateProductRequest,
  CreateSampleRequestRequest
} from '@/types/marketplace';

// Extend Express Request to include user
interface AuthenticatedRequest extends Request {
  user?: {
    _id: string;
    role: 'buyer' | 'supplier' | 'admin';
    company: {
      _id: string;
      name: string;
      country?: string;
      verificationLevel?: 'bronze' | 'silver' | 'gold';
      rating?: number;
      totalReviews?: number;
      establishedYear?: number;
      certifications?: string[];
      specialties?: string[];
    };
  };
}

class ProductController {
  // Get all products with advanced filtering and search
  static async getProducts(req: Request<{}, any, any, ProductQueryParams>, res: Response): Promise<void> {
    try {
      const {
        page = '1',
        limit = '20',
        search,
        category,
        certification,
        supplierCountry,
        verificationLevel,
        availability,
        minPrice,
        maxPrice,
        sortBy = 'relevance',
        featured,
        promoted
      } = req.query;

      // Build filters object
      const filters: Partial<MarketplaceFilters> = {};
      if (category) filters.category = category;
      if (certification) filters.certification = certification;
      if (supplierCountry) filters.location = supplierCountry;
      if (verificationLevel) filters.verificationLevel = verificationLevel;
      if (availability) filters.availability = availability;
      if (minPrice || maxPrice) {
        filters.priceRange = `${minPrice || 0}-${maxPrice || 'max'}`;
      }

      // Search options
      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy
      };

      // Base query for active products
      const baseQuery: any = { status: 'active', approvalStatus: 'approved' };

      // Add featured/promoted filters
      if (featured === 'true') baseQuery.featured = true;
      if (promoted === 'true') baseQuery.promoted = true;

      // Execute search
      const products = await ProductEnhanced.searchProducts(search, filters, options);
      
      // Build count query for pagination
      const countQuery: any = { ...baseQuery };
      if (search) countQuery.$text = { $search: search };
      if (filters.category) countQuery.category = filters.category;
      if (filters.certification) countQuery.certifications = { $in: [filters.certification] };
      if (filters.location) countQuery['supplier.country'] = filters.location;
      if (filters.verificationLevel) countQuery['supplier.verificationLevel'] = filters.verificationLevel;
      if (filters.availability) countQuery['availability.status'] = filters.availability;
      if (minPrice) countQuery['price.min'] = { $gte: parseFloat(minPrice) };
      if (maxPrice) countQuery['price.max'] = { $lte: parseFloat(maxPrice) };

      const totalCount = await ProductEnhanced.countDocuments(countQuery);
      const totalPages = Math.ceil(totalCount / parseInt(limit));
      const hasMore = parseInt(page) < totalPages;

      // Build response matching frontend SearchResults interface
      const response: MarketplaceApiResponse<SearchResults> = {
        success: true,
        data: {
          products: products.map(p => p.toObject()),
          totalCount,
          page: parseInt(page),
          pageSize: parseInt(limit),
          totalPages,
          hasMore,
          filters: {
            category: category || '',
            certification: certification || '',
            priceRange: filters.priceRange || '',
            location: supplierCountry || '',
            minOrder: '',
            availability: availability || '',
            verificationLevel: verificationLevel || ''
          },
          sortBy,
          sortOrder: 'desc'
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching products:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching products',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });
    }
  }

  // Get single product by ID
  static async getProductById(req: Request<{ id: string }>, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      const product = await ProductEnhanced.findById(id)
        .populate('supplier.id', 'name email phone address website')
        .exec();

      if (!product) {
        res.status(404).json({
          success: false,
          message: 'Product not found'
        });
        return;
      }

      // Increment view count
      await product.incrementViewCount();

      // Get related products from same category
      const relatedProducts = await ProductEnhanced.findByCategory(
        product.category, 
        5
      ).where('_id').ne(id);

      const response: MarketplaceApiResponse<any> = {
        success: true,
        data: {
          ...product.toObject(),
          relatedProducts: relatedProducts.map(p => p.toObject())
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching product:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching product',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });
    }
  }

  // Get featured products
  static async getFeaturedProducts(req: Request<{}, any, any, { limit?: string }>, res: Response): Promise<void> {
    try {
      const { limit = '10' } = req.query;
      
      const products = await ProductEnhanced.findFeatured(parseInt(limit));

      res.json({
        success: true,
        data: products.map(p => p.toObject())
      });
    } catch (error) {
      console.error('Error fetching featured products:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching featured products',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });
    }
  }

  // Get products by category
  static async getProductsByCategory(req: Request<{ category: string }, any, any, { limit?: string; page?: string }>, res: Response): Promise<void> {
    try {
      const { category } = req.params;
      const { limit = '20', page = '1' } = req.query;
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const products = await ProductEnhanced.find({ 
        category, 
        status: 'active',
        approvalStatus: 'approved'
      })
        .populate('supplier.id')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ featured: -1, averageRating: -1 });

      const totalCount = await ProductEnhanced.countDocuments({ 
        category, 
        status: 'active',
        approvalStatus: 'approved'
      });

      res.json({
        success: true,
        data: {
          products: products.map(p => p.toObject()),
          totalCount,
          page: parseInt(page),
          pageSize: parseInt(limit),
          totalPages: Math.ceil(totalCount / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error fetching products by category:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching products by category',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });
    }
  }

  // Create new product (for suppliers)
  static async createProduct(req: AuthenticatedRequest<{}, any, CreateProductRequest>, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
        return;
      }

      const productData = req.body;
      
      // Add supplier information from authenticated user
      if (req.user && req.user.company) {
        (productData as any).supplier = {
          id: req.user.company._id,
          name: req.user.company.name,
          country: req.user.company.country || 'Unknown',
          verificationLevel: req.user.company.verificationLevel || 'bronze',
          rating: req.user.company.rating || 0,
          totalReviews: req.user.company.totalReviews || 0,
          establishedYear: req.user.company.establishedYear,
          certifications: req.user.company.certifications || [],
          specialties: req.user.company.specialties || []
        };
      }

      const product = new ProductEnhanced(productData);
      await product.save();

      res.status(201).json({
        success: true,
        data: product.toObject(),
        message: 'Product created successfully'
      });
    } catch (error) {
      console.error('Error creating product:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating product',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });
    }
  }

  // Update product
  static async updateProduct(req: AuthenticatedRequest<{ id: string }, any, UpdateProductRequest>, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const product = await ProductEnhanced.findById(id);
      if (!product) {
        res.status(404).json({
          success: false,
          message: 'Product not found'
        });
        return;
      }

      // Check if user has permission to update this product
      if (req.user?.role !== 'admin' && 
          product.supplier.id.toString() !== req.user?.company._id.toString()) {
        res.status(403).json({
          success: false,
          message: 'Unauthorized to update this product'
        });
        return;
      }

      Object.assign(product, updateData);
      await product.save();

      res.json({
        success: true,
        data: product.toObject(),
        message: 'Product updated successfully'
      });
    } catch (error) {
      console.error('Error updating product:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating product',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });
    }
  }

  // Delete product
  static async deleteProduct(req: AuthenticatedRequest<{ id: string }>, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const product = await ProductEnhanced.findById(id);
      if (!product) {
        res.status(404).json({
          success: false,
          message: 'Product not found'
        });
        return;
      }

      // Check permissions
      if (req.user?.role !== 'admin' && 
          product.supplier.id.toString() !== req.user?.company._id.toString()) {
        res.status(403).json({
          success: false,
          message: 'Unauthorized to delete this product'
        });
        return;
      }

      // Soft delete by changing status
      product.status = 'inactive';
      await product.save();

      res.json({
        success: true,
        message: 'Product deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting product:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting product',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });
    }
  }

  // Get product categories with counts
  static async getCategories(req: Request, res: Response): Promise<void> {
    try {
      const categories = await ProductEnhanced.aggregate([
        {
          $match: { 
            status: 'active',
            approvalStatus: 'approved'
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
          $sort: { count: -1 }
        }
      ]);

      res.json({
        success: true,
        data: categories
      });
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching categories',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });
    }
  }

  // Get product suggestions for search autocomplete
  static async getProductSuggestions(req: Request<{}, any, any, { query?: string; limit?: string }>, res: Response): Promise<void> {
    try {
      const { query, limit = '10' } = req.query;

      if (!query || query.length < 2) {
        res.json({
          success: true,
          data: []
        });
        return;
      }

      const suggestions = await ProductEnhanced.find({
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { category: { $regex: query, $options: 'i' } },
          { 'supplier.name': { $regex: query, $options: 'i' } }
        ],
        status: 'active',
        approvalStatus: 'approved'
      })
        .select('name category supplier.name')
        .limit(parseInt(limit));

      // Format suggestions
      const formatted = suggestions.map(product => ({
        id: product._id.toString(),
        text: product.name,
        category: product.category,
        supplier: product.supplier.name
      }));

      res.json({
        success: true,
        data: formatted
      });
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching suggestions',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });
    }
  }

  // Compare multiple products
  static async compareProducts(req: Request<{}, any, { productIds: string[] }>, res: Response): Promise<void> {
    try {
      const { productIds } = req.body;

      if (!productIds || !Array.isArray(productIds) || productIds.length < 2) {
        res.status(400).json({
          success: false,
          message: 'At least 2 product IDs are required for comparison'
        });
        return;
      }

      if (productIds.length > 4) {
        res.status(400).json({
          success: false,
          message: 'Cannot compare more than 4 products at once'
        });
        return;
      }

      const products = await ProductEnhanced.find({
        _id: { $in: productIds },
        status: 'active',
        approvalStatus: 'approved'
      }).populate('supplier.id');

      if (products.length !== productIds.length) {
        res.status(404).json({
          success: false,
          message: 'One or more products not found'
        });
        return;
      }

      // Define comparison attributes
      const attributes = [
        'name',
        'category',
        'price',
        'supplier.name',
        'supplier.verificationLevel',
        'supplier.rating',
        'certifications',
        'minOrder',
        'availability.status',
        'shelfLife',
        'specifications.origin',
        'specifications.allergens',
        'averageRating'
      ];

      const comparison = {
        products: products.map(p => p.toObject()),
        attributes
      };

      res.json({
        success: true,
        data: comparison
      });
    } catch (error) {
      console.error('Error comparing products:', error);
      res.status(500).json({
        success: false,
        message: 'Error comparing products',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });
    }
  }

  // Get bulk pricing for a product
  static async getBulkPricing(req: Request<{ id: string }>, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      const product = await ProductEnhanced.findById(id)
        .select('name bulkPricingTiers price');

      if (!product) {
        res.status(404).json({
          success: false,
          message: 'Product not found'
        });
        return;
      }

      res.json({
        success: true,
        data: {
          productId: product._id.toString(),
          productName: product.name,
          basePrice: product.price,
          bulkPricingTiers: product.bulkPricingTiers || []
        }
      });
    } catch (error) {
      console.error('Error fetching bulk pricing:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching bulk pricing',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });
    }
  }

  // Create sample request
  static async createSampleRequest(req: AuthenticatedRequest<{ productId: string }, any, CreateSampleRequestRequest>, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
        return;
      }

      const { productId } = req.params;
      const sampleRequestData = req.body;

      // Verify product exists
      const product = await ProductEnhanced.findById(productId);
      if (!product) {
        res.status(404).json({
          success: false,
          message: 'Product not found'
        });
        return;
      }

      // Create sample request
      const sampleRequest = new SampleRequest({
        ...sampleRequestData,
        productId,
        buyerId: req.user?._id,
        supplierId: product.supplier.id,
        companyId: req.user?.company._id
      });

      await sampleRequest.save();

      // Increment sample request count on product
      product.sampleRequestCount += 1;
      await product.save();

      res.status(201).json({
        success: true,
        data: sampleRequest.toObject(),
        message: 'Sample request created successfully'
      });
    } catch (error) {
      console.error('Error creating sample request:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating sample request',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });
    }
  }
}

export default ProductController;