/**
 * Public API Routes
 * Handles publicly accessible endpoints
 */

import { Router } from 'express';
import { asyncHandler } from '../../../middleware/asyncHandler';
import { publicRateLimiter } from '../../../middleware/rateLimiter';
import { validate } from '../../../middleware/validation';
import { z } from 'zod';

const router = Router();

// Apply public rate limiting to all routes
router.use(publicRateLimiter);

// Contact form validation
const contactFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  subject: z.string().min(5, 'Subject must be at least 5 characters'),
  message: z.string().min(20, 'Message must be at least 20 characters'),
  company: z.string().optional(),
  phone: z.string().optional()
});

/**
 * @swagger
 * /api/v1/public/health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 status:
 *                   type: string
 *                 timestamp:
 *                   type: string
 */
router.get('/health', 
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0'
    });
  })
);

/**
 * @swagger
 * /api/v1/public/status:
 *   get:
 *     summary: Service status endpoint
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: Service status information
 */
router.get('/status',
  asyncHandler(async (req, res) => {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    res.json({
      success: true,
      data: {
        service: 'FoodXchange Backend',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: `${hours}h ${minutes}m ${seconds}s`,
        uptimeSeconds: uptime,
        timestamp: new Date().toISOString(),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        }
      }
    });
  })
);

/**
 * @swagger
 * /api/v1/public/contact:
 *   post:
 *     summary: Submit contact form
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - subject
 *               - message
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *               email:
 *                 type: string
 *                 format: email
 *               subject:
 *                 type: string
 *                 minLength: 5
 *               message:
 *                 type: string
 *                 minLength: 20
 *               company:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contact form submitted successfully
 */
router.post('/contact',
  validate({ body: contactFormSchema }),
  asyncHandler(async (req, res) => {
    // TODO: Implement contact form submission logic
    // This could include sending emails, storing in database, etc.
    
    res.json({
      success: true,
      message: 'Contact form submitted successfully. We will get back to you soon!',
      data: {
        submittedAt: new Date().toISOString(),
        reference: `CF-${Date.now()}`
      }
    });
  })
);

/**
 * @swagger
 * /api/v1/public/categories:
 *   get:
 *     summary: Get product categories
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: Product categories retrieved successfully
 */
router.get('/categories',
  asyncHandler(async (req, res) => {
    // TODO: Implement categories retrieval from database
    const categories = [
      'Fresh Produce',
      'Dairy & Eggs',
      'Meat & Poultry',
      'Seafood',
      'Grains & Cereals',
      'Beverages',
      'Packaged Foods',
      'Frozen Foods',
      'Bakery Items',
      'Spices & Condiments'
    ];

    res.json({
      success: true,
      data: categories,
      count: categories.length
    });
  })
);

/**
 * @swagger
 * /api/v1/public/featured-products:
 *   get:
 *     summary: Get featured products
 *     tags: [Public]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 12
 *         description: Number of products to return
 *     responses:
 *       200:
 *         description: Featured products retrieved successfully
 */
router.get('/featured-products',
  asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 12;
    
    // TODO: Implement featured products retrieval from database
    res.json({
      success: true,
      message: 'Featured products endpoint - implementation pending',
      data: [],
      count: 0,
      limit
    });
  })
);

/**
 * @swagger
 * /api/v1/public/search:
 *   get:
 *     summary: Search products publicly
 *     tags: [Public]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: Search query
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *         description: Number of results to return
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
 */
router.get('/search',
  asyncHandler(async (req, res) => {
    const { q, category, limit = 20 } = req.query;
    
    if (!q || (q as string).length < 2) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SEARCH_QUERY',
          message: 'Search query must be at least 2 characters long'
        }
      });
    }
    
    // TODO: Implement product search logic
    res.json({
      success: true,
      message: 'Public search endpoint - implementation pending',
      data: {
        query: q,
        category,
        results: [],
        count: 0,
        limit: parseInt(limit as string)
      }
    });
  })
);

/**
 * @swagger
 * /api/v1/public/stats:
 *   get:
 *     summary: Get public platform statistics
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: Platform statistics retrieved successfully
 */
router.get('/stats',
  asyncHandler(async (req, res) => {
    // TODO: Implement real statistics from database
    res.json({
      success: true,
      data: {
        totalProducts: 0,
        totalSellers: 0,
        totalOrders: 0,
        countriesServed: 0,
        lastUpdated: new Date().toISOString()
      }
    });
  })
);

export default router;