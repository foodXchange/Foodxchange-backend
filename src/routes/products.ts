import express from 'express';
import multer from 'multer';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { 
  extractTenantContext, 
  enforceTenantIsolation, 
  requireTenantFeature,
  checkTenantLimits,
  tenantFeatures 
} from '../middleware/tenantIsolation';
import { ProductController } from '../controllers/ProductController';
import { 
  validateRequest, 
  commonValidations, 
  foodValidations,
  sanitizers 
} from '../middleware/advancedValidation';
import { body, param, query } from 'express-validator';
import { 
  apiRateLimiter, 
  searchRateLimiter, 
  uploadRateLimiter 
} from '../middleware/rateLimiter';
import { fileUploadSecurity } from '../middleware/security';

const router = express.Router();
const productController = new ProductController();

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 10
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG and WebP are allowed'));
    }
  }
});

// Public endpoints (no auth required)
router.get('/search',
  optionalAuth,
  extractTenantContext,
  searchRateLimiter,
  [
    query('q').optional().isString().trim(),
    query('page').optional().isInt({ min: 1 }),
    query('pageSize').optional().isInt({ min: 1, max: 100 }),
    query('category').optional().isString(),
    query('minPrice').optional().isFloat({ min: 0 }),
    query('maxPrice').optional().isFloat({ min: 0 }),
    query('inStock').optional().isBoolean()
  ],
  validateRequest,
  productController.searchProducts
);

router.get('/autocomplete',
  optionalAuth,
  extractTenantContext,
  searchRateLimiter,
  [
    query('q').notEmpty().isString().trim().isLength({ min: 2, max: 50 })
  ],
  validateRequest,
  productController.getAutocomplete
);

// Protected endpoints
router.use(requireAuth);
router.use(extractTenantContext);
router.use(apiRateLimiter);

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: supplier
 *         schema:
 *           type: string
 *       - in: query
 *         name: inStock
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [name, -name, price, -price, createdAt, -createdAt]
 *     responses:
 *       200:
 *         description: Products retrieved successfully
 */
router.get('/',
  enforceTenantIsolation,
  [
    ...commonValidations.pagination(),
    query('category').optional().isString(),
    query('supplier').optional().isMongoId(),
    query('inStock').optional().isBoolean(),
    query('sort').optional().isIn(['name', '-name', 'price', '-price', 'createdAt', '-createdAt'])
  ],
  validateRequest,
  productController.getProducts
);

// Export route must come before /:id to avoid route conflicts
/**
 * @swagger
 * /api/products/export:
 *   get:
 *     summary: Export products
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv, excel]
 *           default: json
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Products exported successfully
 */
router.get('/export',
  enforceTenantIsolation,
  requireTenantFeature(tenantFeatures.BULK_OPERATIONS),
  [
    query('format').optional().isIn(['json', 'csv', 'excel']),
    query('category').optional().isString()
  ],
  validateRequest,
  productController.exportProducts
);

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Get product by ID or slug
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product retrieved successfully
 *       404:
 *         description: Product not found
 */
router.get('/:id',
  enforceTenantIsolation,
  [
    param('id').notEmpty()
  ],
  validateRequest,
  productController.getProduct
);

/**
 * @swagger
 * /api/products/{id}/similar:
 *   get:
 *     summary: Get similar products
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Similar products retrieved successfully
 */
router.get('/:id/similar',
  enforceTenantIsolation,
  [
    param('id').isMongoId(),
    query('limit').optional().isInt({ min: 1, max: 50 })
  ],
  validateRequest,
  productController.getSimilarProducts
);

// Bulk import route before general POST
/**
 * @swagger
 * /api/products/bulk/import:
 *   post:
 *     summary: Bulk import products
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               products:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Product'
 *     responses:
 *       200:
 *         description: Products imported successfully
 */
router.post('/bulk/import',
  enforceTenantIsolation,
  requireTenantFeature(tenantFeatures.BULK_OPERATIONS),
  [
    body('products').isArray({ min: 1 }),
    body('products.*.name').notEmpty(),
    body('products.*.sku').notEmpty(),
    body('products.*.category').notEmpty(),
    body('products.*.pricing.basePrice').isFloat({ min: 0 })
  ],
  validateRequest,
  productController.bulkImportProducts
);

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create new product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Product'
 *     responses:
 *       201:
 *         description: Product created successfully
 *       400:
 *         description: Validation error
 */
router.post('/',
  enforceTenantIsolation,
  checkTenantLimits('products'),
  requireTenantFeature(tenantFeatures.BASIC_CATALOG),
  [
    ...foodValidations.product(),
    ...foodValidations.temperature(),
    ...foodValidations.certification(),
    ...foodValidations.batch(),
    
    body('status').optional().isIn(['draft', 'active', 'inactive']),
    body('isPublished').optional().isBoolean(),
    
    // Pricing validation
    body('pricing.currency').notEmpty().isLength({ min: 3, max: 3 }),
    body('pricing.basePrice').isFloat({ min: 0 }),
    body('pricing.unit').notEmpty().isIn(['each', 'case', 'pallet', 'kg', 'lb', 'l', 'gal']),
    body('pricing.tierPricing').optional().isArray(),
    body('pricing.tierPricing.*.minQuantity').isInt({ min: 1 }),
    body('pricing.tierPricing.*.price').isFloat({ min: 0 }),
    body('pricing.taxRate').optional().isFloat({ min: 0, max: 100 }),
    body('pricing.isTaxIncluded').optional().isBoolean(),
    
    // Inventory validation
    body('inventory.trackInventory').optional().isBoolean(),
    body('inventory.quantity').optional().isInt({ min: 0 }),
    body('inventory.lowStockThreshold').optional().isInt({ min: 0 }),
    body('inventory.outOfStockBehavior').optional().isIn(['hide', 'show', 'backorder']),
    
    // Packaging validation
    body('packaging.type').notEmpty(),
    body('packaging.unitsPerCase').isInt({ min: 1 }),
    body('packaging.casesPerPallet').optional().isInt({ min: 1 }),
    
    // Logistics validation
    body('logistics.requiresRefrigeration').optional().isBoolean(),
    body('logistics.temperatureControlled').optional().isBoolean(),
    body('logistics.fragile').optional().isBoolean(),
    body('logistics.dangerousGoods').optional().isBoolean()
  ],
  validateRequest,
  productController.createProduct
);

/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Update product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Product'
 *     responses:
 *       200:
 *         description: Product updated successfully
 *       404:
 *         description: Product not found
 */
router.put('/:id',
  enforceTenantIsolation,
  [
    param('id').isMongoId(),
    // Same validation as create, but all fields optional
    ...foodValidations.product().map(v => v.optional()),
    ...foodValidations.temperature().map(v => v.optional()),
    ...foodValidations.certification().map(v => v.optional())
  ],
  validateRequest,
  productController.updateProduct
);

/**
 * @swagger
 * /api/products/{id}/images:
 *   post:
 *     summary: Upload product images
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Images uploaded successfully
 */
router.post('/:id/images',
  enforceTenantIsolation,
  uploadRateLimiter,
  upload.array('images', 10),
  fileUploadSecurity,
  [
    param('id').isMongoId()
  ],
  validateRequest,
  productController.uploadProductImages
);

/**
 * @swagger
 * /api/products/{id}/images/{imageId}:
 *   delete:
 *     summary: Delete product image
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: imageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Image deleted successfully
 */
router.delete('/:id/images/:imageId',
  enforceTenantIsolation,
  [
    param('id').isMongoId(),
    param('imageId').isMongoId()
  ],
  validateRequest,
  productController.deleteProductImage
);

/**
 * @swagger
 * /api/products/{id}/inventory:
 *   patch:
 *     summary: Update product inventory
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantity:
 *                 type: number
 *               operation:
 *                 type: string
 *                 enum: [add, subtract, reserve]
 *     responses:
 *       200:
 *         description: Inventory updated successfully
 */
router.patch('/:id/inventory',
  enforceTenantIsolation,
  [
    param('id').isMongoId(),
    body('quantity').isInt({ min: 1 }),
    body('operation').isIn(['add', 'subtract', 'reserve'])
  ],
  validateRequest,
  productController.updateInventory
);

/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Delete product (soft delete)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *       404:
 *         description: Product not found
 */
router.delete('/:id',
  enforceTenantIsolation,
  [
    param('id').isMongoId()
  ],
  validateRequest,
  productController.deleteProduct
);

export default router;