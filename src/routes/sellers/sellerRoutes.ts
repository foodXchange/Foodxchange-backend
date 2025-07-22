import express from 'express';
import {
  registerSeller,
  getDashboard,
  getSellerProfile,
  updateProfile,
  getSellerProducts,
  getSellerOrders,
  getAnalytics,
  createProduct,
  updateProduct,
  deleteProduct,
  updateOrderStatus,
  getRevenue,
  getNotifications,
  markNotificationRead
} from '../../controllers/sellers/sellerController';
import { protect, sellerOnly } from '../../middleware/auth';

const router = express.Router();

// Public routes
router.post('/register', registerSeller);

// Protected seller routes
router.use(protect);
router.use(sellerOnly);

router.get('/dashboard', getDashboard);
router.get('/profile', getSellerProfile);
router.put('/profile', updateProfile);
router.get('/products', getSellerProducts);
router.get('/orders', getSellerOrders);
router.get('/analytics', getAnalytics);

// Product management
router.post('/products', createProduct);
router.put('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);

// Order management
router.get('/orders/:id', getOrderDetails);
router.put('/orders/:id/status', updateOrderStatus);
router.post('/orders/:id/shipment', createShipment);

// Sample management
router.get('/samples', getSellerSamples);
router.put('/samples/:id', updateSampleStatus);

// Document management
router.get('/documents', getSellerDocuments);
router.post('/documents', uploadDocument);
router.delete('/documents/:id', deleteDocument);

// Messages
router.get('/messages', getSellerMessages);
router.post('/messages', sendMessage);
router.get('/messages/:conversationId', getConversation);

export default router;
