import express from 'express';
import multer from 'multer';
import analyticsController from '../../controllers/seller/analyticsController';
import notificationController from '../../controllers/seller/notificationController';
import orderController from '../../controllers/seller/orderController';
import productController from '../../controllers/seller/productController';
import proposalController from '../../controllers/seller/proposalController';
import sellerController from '../../controllers/seller/sellerController';
import { authenticateSeller } from '../../middleware/auth';
import { validateRegistration, validateLogin } from '../../validators/seller';

const router = express.Router();


// Configure multer for file uploads
const upload = multer({ dest: 'uploads/temp/' });

// Public routes
router.post('/register',
  upload.fields([
    { name: 'companyLogo', maxCount: 1 },
    { name: 'profileImages', maxCount: 5 },
    { name: 'certificationDocs', maxCount: 10 }
  ]),
  validateRegistration,
  sellerController.register
);

router.post('/login', validateLogin, sellerController.login);

// Protected routes (require authentication)
router.use(authenticateSeller);

// Dashboard
router.get('/dashboard', sellerController.getDashboard);

// Profile
router.get('/profile', sellerController.getProfile);
router.put('/profile', sellerController.updateProfile);
router.post('/documents',
  upload.array('documents', 10),
  sellerController.uploadDocuments
);

// Products
router.get('/products', productController.getSellerProducts);
router.post('/products',
  upload.array('productImages', 5),
  productController.createProduct
);
router.get('/products/:id', productController.getProduct);
router.put('/products/:id', productController.updateProduct);
router.delete('/products/:id', productController.deleteProduct);
router.post('/products/bulk-import',
  upload.single('csvFile'),
  productController.bulkImport
);

// RFQs
router.get('/rfqs', proposalController.getRelevantRFQs);
router.get('/rfqs/:id', proposalController.getRFQDetails);

// Proposals
router.get('/proposals', proposalController.getSellerProposals);
router.post('/proposals', proposalController.createProposal);
router.get('/proposals/:id', proposalController.getProposal);
router.put('/proposals/:id', proposalController.updateProposal);

// Orders
router.get('/orders', orderController.getSellerOrders);
router.get('/orders/:id', orderController.getOrderDetails);
router.put('/orders/:id/status', orderController.updateOrderStatus);

// Analytics
router.get('/analytics', analyticsController.getSellerAnalytics);
router.get('/analytics/revenue', analyticsController.getRevenueAnalytics);
router.get('/analytics/products', analyticsController.getProductAnalytics);

// Notifications
router.get('/notifications', notificationController.getNotifications);
router.put('/notifications/:id/read', notificationController.markAsRead);
router.put('/notifications/read-all', notificationController.markAllAsRead);

export default router;
