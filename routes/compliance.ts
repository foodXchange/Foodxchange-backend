
// File: C:\Users\foodz\Documents\GitHub\Development\Foodxchange-backend\routes\compliance.ts

import express from 'express';
import {
  validateCompliance,
  validateField,
  getComplianceHistory,
  getValidationRules,
  validateBulkCompliance,
  generateComplianceReport,
  autoFixCompliance
} from '../controllers/complianceController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Main validation endpoints
router.post('/validate', validateCompliance);
router.post('/validate-field', validateField);
router.post('/validate-bulk', validateBulkCompliance);

// History and reporting
router.get('/history', getComplianceHistory);
router.get('/rules/:productType/:targetMarket?', getValidationRules);
router.get('/report/:rfqId', generateComplianceReport);

// Stats endpoint (for dashboard)
router.get('/stats', async (req, res) => {
  try {
    // This would aggregate real data from your database
    const stats = {
      totalValidations: 47,
      passedValidations: 38,
      failedValidations: 9,
      averageScore: 82,
      criticalIssues: 3,
      pendingFixes: 5
    };
    
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// Auto-fix endpoint
router.post('/auto-fix', autoFixCompliance);

export default router;