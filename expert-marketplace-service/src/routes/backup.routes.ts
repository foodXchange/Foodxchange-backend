import { Router } from 'express';
import { backupController } from '../controllers/BackupController';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import { productionSecurityMiddleware } from '../middleware/productionSecurity';

const router = Router();

// All backup routes require authentication and admin role
router.use(authenticateToken);
router.use(requireRole('admin'));

// Create backup
router.post('/create', 
  productionSecurityMiddleware.validateInput([
    // Add validation rules for backup creation
  ]),
  backupController.createBackup
);

// List backups
router.get('/list', 
  productionSecurityMiddleware.validateInput([
    // Add validation rules for listing
  ]),
  backupController.listBackups
);

// Get backup status
router.get('/status', backupController.getBackupStatus);

// Restore backup
router.post('/restore/:backupId', 
  productionSecurityMiddleware.validateInput([
    productionSecurityMiddleware.validationRules.mongoId
  ]),
  backupController.restoreBackup
);

// Verify backup integrity
router.get('/verify/:backupId', 
  productionSecurityMiddleware.validateInput([
    productionSecurityMiddleware.validationRules.mongoId
  ]),
  backupController.verifyBackup
);

// Execute disaster recovery
router.post('/disaster-recovery', 
  productionSecurityMiddleware.validateInput([
    // Add validation rules for disaster recovery
  ]),
  backupController.executeDisasterRecovery
);

// Cleanup old backups
router.post('/cleanup', 
  productionSecurityMiddleware.validateInput([
    // Add validation rules for cleanup
  ]),
  backupController.cleanupBackups
);

export { router as backupRoutes };