// File: src/api/routes/supplier.ts
import { Router } from 'express';
import { body, param, query } from 'express-validator';

import { supplierController } from '../../controllers/marketplace/supplierController';
import { asyncHandler } from '../../core/errors';
import { authenticate } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validation';


const router = Router();

// Public routes (no authentication required for browsing)

// @route   GET /api/suppliers
// @desc    Get all suppliers with filtering
// @access  Public
router.get('/',
  validateRequest([
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString(),
    query('category').optional().isString(),
    query('location').optional().isString(),
    query('certifications').optional().isString(),
    query('rating').optional().isFloat({ min: 0, max: 5 }),
    query('verified').optional().isBoolean(),
    query('sort').optional().isIn(['createdAt', '-createdAt', 'rating', '-rating', 'name', '-name'])
  ]),
  asyncHandler(supplierController.getAllSuppliers.bind(supplierController))
);

// @route   GET /api/suppliers/featured
// @desc    Get featured suppliers
// @access  Public
router.get('/featured',
  validateRequest([
    query('limit').optional().isInt({ min: 1, max: 50 })
  ]),
  asyncHandler(supplierController.getFeaturedSuppliers.bind(supplierController))
);

// @route   POST /api/suppliers/search
// @desc    Search suppliers with advanced filters
// @access  Public
router.post('/search',
  validateRequest([
    body('q').optional().isString(),
    body('filters').optional().isObject(),
    body('filters.categories').optional().isArray(),
    body('filters.locations').optional().isArray(),
    body('filters.certifications').optional().isArray(),
    body('filters.minRating').optional().isFloat({ min: 0, max: 5 }),
    body('filters.verified').optional().isBoolean()
  ]),
  asyncHandler(supplierController.searchSuppliers.bind(supplierController))
);

// @route   GET /api/suppliers/:id
// @desc    Get supplier by ID
// @access  Public
router.get('/:id',
  validateRequest([
    param('id').isMongoId().withMessage('Invalid supplier ID')
  ]),
  asyncHandler(supplierController.getSupplierById.bind(supplierController))
);

// @route   GET /api/suppliers/:id/products
// @desc    Get supplier products
// @access  Public
router.get('/:id/products',
  validateRequest([
    param('id').isMongoId().withMessage('Invalid supplier ID'),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('category').optional().isString(),
    query('sort').optional().isString(),
    query('inStock').optional().isBoolean()
  ]),
  asyncHandler(supplierController.getSupplierProducts.bind(supplierController))
);

// @route   GET /api/suppliers/:id/categories
// @desc    Get supplier product categories
// @access  Public
router.get('/:id/categories',
  validateRequest([
    param('id').isMongoId().withMessage('Invalid supplier ID')
  ]),
  asyncHandler(supplierController.getSupplierCategories.bind(supplierController))
);

// Protected routes (require authentication)

// @route   POST /api/suppliers/:id/contact
// @desc    Contact supplier
// @access  Private
router.post('/:id/contact',
  authenticate,
  validateRequest([
    param('id').isMongoId().withMessage('Invalid supplier ID'),
    body('subject').notEmpty().withMessage('Subject is required'),
    body('message').notEmpty().withMessage('Message is required'),
    body('productId').optional().isMongoId()
  ]),
  asyncHandler(async (req, res) => {
    // TODO: Implement supplier contact functionality
    res.json({
      success: true,
      message: 'Message sent to supplier'
    });
  })
);

// @route   POST /api/suppliers/:id/review
// @desc    Review supplier
// @access  Private
router.post('/:id/review',
  authenticate,
  validateRequest([
    param('id').isMongoId().withMessage('Invalid supplier ID'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('comment').optional().isString(),
    body('orderId').optional().isMongoId()
  ]),
  asyncHandler(async (req, res) => {
    // TODO: Implement supplier review functionality
    res.json({
      success: true,
      message: 'Review submitted successfully'
    });
  })
);

// @route   POST /api/suppliers/:id/report
// @desc    Report supplier
// @access  Private
router.post('/:id/report',
  authenticate,
  validateRequest([
    param('id').isMongoId().withMessage('Invalid supplier ID'),
    body('reason').notEmpty().withMessage('Reason is required'),
    body('details').optional().isString()
  ]),
  asyncHandler(async (req, res) => {
    // TODO: Implement supplier report functionality
    res.json({
      success: true,
      message: 'Report submitted successfully'
    });
  })
);

export default router;
