import express from 'express';
import aiController from '../../controllers/ai/aiController';

const router = express.Router();

// AI service health check
router.get('/status', aiController.getAIStatus.bind(aiController));

// RFQ Analysis and Supplier Matching
router.post('/rfq/analyze', aiController.analyzeRFQ.bind(aiController));

// Product Analysis
router.post('/product/:productId/analyze', aiController.analyzeProduct.bind(aiController));
router.post('/products/batch-analyze', aiController.batchAnalyzeProducts.bind(aiController));

// Future AI endpoints (placeholders)
router.post('/document/analyze', (req, res) => {
  res.json({
    success: false,
    message: 'Document analysis endpoint - coming soon'
  });
});

router.post('/search/semantic', (req, res) => {
  res.json({
    success: false,
    message: 'Semantic search endpoint - coming soon'
  });
});

export default router;
