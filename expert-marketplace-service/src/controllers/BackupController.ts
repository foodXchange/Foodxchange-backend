import { Request, Response } from 'express';
import { backupService } from '../services/BackupService';
import { productionLogger } from '../utils/productionLogger';

export class BackupController {
  // Create a new backup
  async createBackup(req: Request, res: Response): Promise<void> {
    try {
      const {
        database = 'foodxchange_experts',
        collection,
        compression = true,
        encryption = true,
        retention = 30
      } = req.body;

      const options = {
        database,
        collection,
        outputDir: './backups',
        compression,
        encryption,
        retention,
        schedule: 'manual'
      };

      const result = await backupService.createBackup(options);

      if (result.success) {
        res.json({
          success: true,
          message: 'Backup created successfully',
          data: {
            backupId: result.backupId,
            size: result.size,
            duration: result.duration,
            location: result.location
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Backup creation failed',
            details: result.error
          }
        });
      }
    } catch (error) {
      productionLogger.error('Backup creation error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          message: 'Internal server error',
          code: 'BACKUP_ERROR'
        }
      });
    }
  }

  // List all backups
  async listBackups(req: Request, res: Response): Promise<void> {
    try {
      const { database, limit = 50 } = req.query;

      const backups = await backupService.listBackups(
        database as string,
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: {
          backups,
          total: backups.length
        }
      });
    } catch (error) {
      productionLogger.error('List backups error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to list backups',
          code: 'LIST_BACKUPS_ERROR'
        }
      });
    }
  }

  // Get backup status
  async getBackupStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = await backupService.getBackupStatus();

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      productionLogger.error('Get backup status error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get backup status',
          code: 'BACKUP_STATUS_ERROR'
        }
      });
    }
  }

  // Restore a backup
  async restoreBackup(req: Request, res: Response): Promise<void> {
    try {
      const { backupId } = req.params;
      const {
        targetDatabase,
        targetCollection,
        dropExisting = false,
        dryRun = false
      } = req.body;

      const options = {
        backupId,
        targetDatabase,
        targetCollection,
        dropExisting,
        dryRun
      };

      const success = await backupService.restoreBackup(backupId, options);

      if (success) {
        res.json({
          success: true,
          message: dryRun ? 'Dry run successful' : 'Backup restored successfully',
          data: {
            backupId,
            targetDatabase: targetDatabase || 'foodxchange_experts',
            dryRun
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Backup restore failed',
            code: 'RESTORE_ERROR'
          }
        });
      }
    } catch (error) {
      productionLogger.error('Backup restore error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          message: 'Internal server error',
          code: 'RESTORE_ERROR'
        }
      });
    }
  }

  // Verify backup integrity
  async verifyBackup(req: Request, res: Response): Promise<void> {
    try {
      const { backupId } = req.params;
      
      const backups = await backupService.listBackups();
      const backup = backups.find(b => b.backupId === backupId);

      if (!backup) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Backup not found',
            code: 'BACKUP_NOT_FOUND'
          }
        });
      }

      const isValid = await backupService.verifyBackupIntegrity(backup);

      res.json({
        success: true,
        data: {
          backupId,
          valid: isValid,
          timestamp: backup.timestamp,
          size: backup.size
        }
      });
    } catch (error) {
      productionLogger.error('Backup verification error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to verify backup',
          code: 'VERIFICATION_ERROR'
        }
      });
    }
  }

  // Execute disaster recovery
  async executeDisasterRecovery(req: Request, res: Response): Promise<void> {
    try {
      const { scenario } = req.body;

      if (!scenario) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Scenario is required',
            code: 'MISSING_SCENARIO'
          }
        });
      }

      const success = await backupService.executeDisasterRecovery(scenario);

      if (success) {
        res.json({
          success: true,
          message: 'Disaster recovery executed successfully',
          data: {
            scenario,
            timestamp: new Date()
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            message: 'Disaster recovery failed',
            code: 'DISASTER_RECOVERY_ERROR'
          }
        });
      }
    } catch (error) {
      productionLogger.error('Disaster recovery error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          message: 'Internal server error',
          code: 'DISASTER_RECOVERY_ERROR'
        }
      });
    }
  }

  // Cleanup old backups
  async cleanupBackups(req: Request, res: Response): Promise<void> {
    try {
      const { retentionDays = 30 } = req.body;

      await backupService.cleanupOldBackups(retentionDays);

      res.json({
        success: true,
        message: 'Old backups cleaned up successfully',
        data: {
          retentionDays
        }
      });
    } catch (error) {
      productionLogger.error('Backup cleanup error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to cleanup backups',
          code: 'CLEANUP_ERROR'
        }
      });
    }
  }
}

export const backupController = new BackupController();