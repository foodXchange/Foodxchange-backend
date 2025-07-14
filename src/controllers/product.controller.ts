import { Request, Response } from 'express';
import { Product } from '../models/Product';
import { AuthRequest } from '../middleware/auth.middleware';

// @desc    Get all products with filtering and pagination
// @route   GET /api/products
// @access  Public
export const getProducts = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      search,
      minPrice,
      maxPrice,
      supplier,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter: any = { status: 'active' };
    
    if (category) filter.category = category;
    if (supplier) filter.supplier = supplier;
    
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search as string, 'i')] } }
      ];
    }

    // Calculate pagination
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const products = await Product.find(filter)
      .populate('supplier', 'name email company')
      .sort({ [sortBy as string]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(limitNum);

    // Get total count
    const total = await Product.countDocuments(filter);

    res.json({
      success: true,
      data: products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error: any) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error fetching products'
    });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
export const getProduct = async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('supplier', 'name email company');
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error: any) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error fetching product'
    });
  }
};

// @desc    Create new product
// @route   POST /api/products
// @access  Private (Supplier only)
export const createProduct = async (req: AuthRequest, res: Response) => {
  try {
    const productData = {
      ...req.body,
      supplier: req.userId
    };

    const product = await Product.create(productData);
    
    res.status(201).json({
      success: true,
      data: product
    });
  } catch (error: any) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error creating product'
    });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private (Owner only)
export const updateProduct = async (req: AuthRequest, res: Response) => {
  try {
    let product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Check ownership
    if (product.supplier.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this product'
      });
    }

    product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: product
    });
  } catch (error: any) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error updating product'
    });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private (Owner only)
export const deleteProduct = async (req: AuthRequest, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Check ownership
    if (product.supplier.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this product'
      });
    }

    // Soft delete
    product.status = 'inactive';
    await product.save();

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error: any) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error deleting product'
    });
  }
};

// @desc    Get product categories
// @route   GET /api/products/categories
// @access  Public
export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = await Product.distinct('category');
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error: any) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error fetching categories'
    });
  }
};

// @desc    Request product sample
// @route   POST /api/products/:id/sample-request
// @access  Private
export const requestSample = async (req: AuthRequest, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Here you would create a sample request record
    // For now, we'll just return a success message
    
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
  } catch (error: any) {
    console.error('Request sample error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error requesting sample'
    });
  }
};