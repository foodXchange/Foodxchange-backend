import { Router } from 'express';
import multer from 'multer';

import {
  analyzeProductImage,
  extractDocumentData,
  matchRFQWithProducts,
  generatePricingSuggestion,
  checkCompliance,
  generateProductDescription,
  uploadFile
} from '../../controllers/ai.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// All AI routes require authentication
router.use(authenticate);

// AI analysis endpoints
router.post('/analyze-product-image', analyzeProductImage);
router.post('/extract-document', extractDocumentData);
router.post('/match-rfq', matchRFQWithProducts);
router.post('/pricing-suggestion', generatePricingSuggestion);
router.post('/check-compliance', checkCompliance);
router.post('/generate-description', generateProductDescription);

// File upload endpoint
router.post('/upload', upload.single('file'), uploadFile);

export default router;
