import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { config } from '../config';
import { productionLogger } from '../utils/productionLogger';

const execAsync = promisify(exec);

export interface BackupOptions {
  database: string;
  collection?: string;
  outputDir: string;
  compression: boolean;
  encryption: boolean;
  retention: number; // days
  schedule: string; // cron format
}

export interface BackupResult {
  backupId: string;
  timestamp: Date;
  database: string;
  collection?: string;
  size: number;
  duration: number;
  success: boolean;
  error?: string;
  location: string;
  checksum: string;
  encrypted: boolean;
}

export interface RestoreOptions {
  backupId: string;
  targetDatabase?: string;
  targetCollection?: string;
  dropExisting: boolean;
  dryRun: boolean;
}

export interface DisasterRecoveryPlan {
  priority: 'critical' | 'high' | 'medium' | 'low';
  rto: number; // Recovery Time Objective (minutes)
  rpo: number; // Recovery Point Objective (minutes)
  steps: string[];
  prerequisites: string[];
  contacts: string[];
}

export class BackupService {
  private static instance: BackupService;
  private backupHistory: BackupResult[] = [];
  private readonly backupDir: string;
  private readonly encryptionKey: string;
  private scheduleIntervals: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {
    this.backupDir = path.join(process.cwd(), 'backups');
    this.encryptionKey = config.backup?.encryptionKey || crypto.randomBytes(32).toString('hex');
    this.ensureBackupDirectory();
    this.startScheduledBackups();
  }

  static getInstance(): BackupService {
    if (!BackupService.instance) {
      BackupService.instance = new BackupService();
    }
    return BackupService.instance;
  }

  private ensureBackupDirectory(): void {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  private startScheduledBackups(): void {
    const schedules = [
      { name: 'hourly', cron: '0 * * * *', type: 'incremental' },
      { name: 'daily', cron: '0 2 * * *', type: 'full' },
      { name: 'weekly', cron: '0 3 * * 0', type: 'full' }
    ];

    schedules.forEach(schedule => {
      // Convert cron to interval for demo (in production, use proper cron library)
      const interval = this.cronToInterval(schedule.cron);
      if (interval) {
        const timeout = setInterval(() => {
          this.performScheduledBackup(schedule.name, schedule.type);
        }, interval);
        this.scheduleIntervals.set(schedule.name, timeout);
      }
    });

    productionLogger.info('Scheduled backups started', {
      schedules: schedules.map(s => ({ name: s.name, cron: s.cron }))
    });
  }

  private cronToInterval(cron: string): number | null {
    // Simplified cron parsing - in production use proper cron library
    if (cron === '0 * * * *') return 60 * 60 * 1000; // hourly
    if (cron === '0 2 * * *') return 24 * 60 * 60 * 1000; // daily
    if (cron === '0 3 * * 0') return 7 * 24 * 60 * 60 * 1000; // weekly
    return null;
  }

  private async performScheduledBackup(scheduleName: string, type: string): Promise<void> {
    try {
      const options: BackupOptions = {
        database: 'foodxchange_experts',
        outputDir: this.backupDir,
        compression: true,
        encryption: true,
        retention: 30,
        schedule: scheduleName
      };

      const result = await this.createBackup(options);
      
      if (result.success) {
        productionLogger.info(`Scheduled backup completed: ${scheduleName}`, {
          backupId: result.backupId,
          size: result.size,
          duration: result.duration
        });
        
        // Clean old backups
        await this.cleanupOldBackups(options.retention);
      } else {
        productionLogger.error(`Scheduled backup failed: ${scheduleName}`, {
          error: result.error
        });
      }
    } catch (error) {
      productionLogger.error(`Scheduled backup error: ${scheduleName}`, { error });
    }
  }

  async createBackup(options: BackupOptions): Promise<BackupResult> {
    const backupId = `backup_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const timestamp = new Date();
    const startTime = Date.now();

    productionLogger.info('Starting backup', {
      backupId,
      database: options.database,
      collection: options.collection
    });

    try {
      // Create backup directory for this specific backup
      const backupPath = path.join(options.outputDir, backupId);
      fs.mkdirSync(backupPath, { recursive: true });

      // Build mongodump command
      const mongoUri = this.parseMongoUri(config.database.uri);
      let command = `mongodump --host ${mongoUri.host} --port ${mongoUri.port} --db ${options.database}`;
      
      if (mongoUri.username && mongoUri.password) {
        command += ` --username ${mongoUri.username} --password ${mongoUri.password}`;
      }
      
      if (options.collection) {
        command += ` --collection ${options.collection}`;
      }
      
      command += ` --out ${backupPath}`;

      if (options.compression) {
        command += ' --gzip';
      }

      // Execute backup
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr && !stderr.includes('done dumping')) {
        throw new Error(`Backup failed: ${stderr}`);
      }

      // Calculate backup size
      const size = await this.calculateDirectorySize(backupPath);
      
      // Create archive
      const archivePath = `${backupPath}.tar.gz`;
      await execAsync(`tar -czf ${archivePath} -C ${options.outputDir} ${backupId}`);
      
      // Remove uncompressed backup
      await execAsync(`rm -rf ${backupPath}`);

      // Encrypt if requested
      let finalPath = archivePath;
      if (options.encryption) {
        finalPath = `${archivePath}.enc`;
        await this.encryptFile(archivePath, finalPath);
        fs.unlinkSync(archivePath);
      }

      // Calculate checksum
      const checksum = await this.calculateChecksum(finalPath);
      
      const duration = Date.now() - startTime;
      const finalSize = fs.statSync(finalPath).size;

      const result: BackupResult = {
        backupId,
        timestamp,
        database: options.database,
        collection: options.collection,
        size: finalSize,
        duration,
        success: true,
        location: finalPath,
        checksum,
        encrypted: options.encryption
      };

      // Store backup metadata
      await this.storeBackupMetadata(result);
      this.backupHistory.push(result);

      productionLogger.info('Backup completed successfully', {
        backupId,
        size: finalSize,
        duration,
        location: finalPath
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const result: BackupResult = {
        backupId,
        timestamp,
        database: options.database,
        collection: options.collection,
        size: 0,
        duration,
        success: false,
        error: error.message,
        location: '',
        checksum: '',
        encrypted: false
      };

      productionLogger.error('Backup failed', {
        backupId,
        error: error.message,
        duration
      });

      return result;
    }
  }

  async restoreBackup(backupId: string, options: RestoreOptions): Promise<boolean> {
    productionLogger.info('Starting restore', {
      backupId,
      targetDatabase: options.targetDatabase,
      targetCollection: options.targetCollection,
      dryRun: options.dryRun
    });

    try {
      const backup = await this.getBackupMetadata(backupId);
      if (!backup) {
        throw new Error(`Backup not found: ${backupId}`);
      }

      // Verify backup integrity
      const isValid = await this.verifyBackupIntegrity(backup);
      if (!isValid) {
        throw new Error(`Backup integrity check failed: ${backupId}`);
      }

      if (options.dryRun) {
        productionLogger.info('Dry run - restore would succeed', { backupId });
        return true;
      }

      // Decrypt if necessary
      let restorePath = backup.location;
      if (backup.encrypted) {
        restorePath = backup.location.replace('.enc', '');
        await this.decryptFile(backup.location, restorePath);
      }

      // Extract archive
      const extractPath = path.join(this.backupDir, `restore_${backupId}`);
      await execAsync(`tar -xzf ${restorePath} -C ${this.backupDir}`);

      // Build mongorestore command
      const mongoUri = this.parseMongoUri(config.database.uri);
      const targetDb = options.targetDatabase || backup.database;
      let command = `mongorestore --host ${mongoUri.host} --port ${mongoUri.port} --db ${targetDb}`;
      
      if (mongoUri.username && mongoUri.password) {
        command += ` --username ${mongoUri.username} --password ${mongoUri.password}`;
      }

      if (options.dropExisting) {
        command += ' --drop';
      }

      if (backup.collection && options.targetCollection) {
        command += ` --collection ${options.targetCollection}`;
      }

      command += ` ${path.join(this.backupDir, backupId, backup.database)}`;

      // Execute restore
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr && !stderr.includes('done')) {
        throw new Error(`Restore failed: ${stderr}`);
      }

      // Cleanup
      await execAsync(`rm -rf ${extractPath}`);
      if (backup.encrypted) {
        fs.unlinkSync(restorePath);
      }

      productionLogger.info('Restore completed successfully', {
        backupId,
        targetDatabase: targetDb
      });

      return true;

    } catch (error) {
      productionLogger.error('Restore failed', {
        backupId,
        error: error.message
      });
      return false;
    }
  }

  async listBackups(database?: string, limit: number = 50): Promise<BackupResult[]> {
    let backups = [...this.backupHistory];
    
    if (database) {
      backups = backups.filter(backup => backup.database === database);
    }

    return backups
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getBackupStatus(): Promise<{
    totalBackups: number;
    successfulBackups: number;
    failedBackups: number;
    totalSize: number;
    lastBackup?: BackupResult;
    nextScheduledBackup: Date;
  }> {
    const successful = this.backupHistory.filter(b => b.success);
    const failed = this.backupHistory.filter(b => !b.success);
    const totalSize = successful.reduce((sum, backup) => sum + backup.size, 0);
    
    return {
      totalBackups: this.backupHistory.length,
      successfulBackups: successful.length,
      failedBackups: failed.length,
      totalSize,
      lastBackup: this.backupHistory[this.backupHistory.length - 1],
      nextScheduledBackup: new Date(Date.now() + 60 * 60 * 1000) // Next hour
    };
  }

  async verifyBackupIntegrity(backup: BackupResult): Promise<boolean> {
    try {
      if (!fs.existsSync(backup.location)) {
        return false;
      }

      const currentChecksum = await this.calculateChecksum(backup.location);
      return currentChecksum === backup.checksum;
    } catch (error) {
      productionLogger.error('Backup integrity verification failed', {
        backupId: backup.backupId,
        error: error.message
      });
      return false;
    }
  }

  async cleanupOldBackups(retentionDays: number): Promise<void> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const backupsToDelete = this.backupHistory.filter(
      backup => backup.timestamp < cutoffDate && backup.success
    );

    for (const backup of backupsToDelete) {
      try {
        if (fs.existsSync(backup.location)) {
          fs.unlinkSync(backup.location);
        }
        
        // Remove from history
        const index = this.backupHistory.indexOf(backup);
        if (index > -1) {
          this.backupHistory.splice(index, 1);
        }

        productionLogger.info('Old backup cleaned up', {
          backupId: backup.backupId,
          age: Math.floor((Date.now() - backup.timestamp.getTime()) / (24 * 60 * 60 * 1000))
        });
      } catch (error) {
        productionLogger.error('Failed to cleanup old backup', {
          backupId: backup.backupId,
          error: error.message
        });
      }
    }
  }

  // Disaster Recovery Methods
  async executeDisasterRecovery(scenario: string): Promise<boolean> {
    const plan = this.getDisasterRecoveryPlan(scenario);
    
    productionLogger.info('Starting disaster recovery', {
      scenario,
      rto: plan.rto,
      rpo: plan.rpo
    });

    try {
      // Execute recovery steps
      for (const step of plan.steps) {
        productionLogger.info('Executing recovery step', { step });
        await this.executeRecoveryStep(step);
      }

      productionLogger.info('Disaster recovery completed', { scenario });
      return true;
    } catch (error) {
      productionLogger.error('Disaster recovery failed', {
        scenario,
        error: error.message
      });
      return false;
    }
  }

  private async executeRecoveryStep(step: string): Promise<void> {
    switch (step) {
      case 'restore_latest_backup':
        const latestBackup = this.backupHistory
          .filter(b => b.success)
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
        
        if (latestBackup) {
          await this.restoreBackup(latestBackup.backupId, {
            backupId: latestBackup.backupId,
            dropExisting: true,
            dryRun: false
          });
        }
        break;
      
      case 'verify_data_integrity':
        // Implement data integrity checks
        break;
      
      case 'restart_services':
        productionLogger.info('Restarting services (manual intervention required)');
        break;
      
      default:
        productionLogger.warn('Unknown recovery step', { step });
    }
  }

  private getDisasterRecoveryPlan(scenario: string): DisasterRecoveryPlan {
    const plans: { [key: string]: DisasterRecoveryPlan } = {
      'database_corruption': {
        priority: 'critical',
        rto: 30, // 30 minutes
        rpo: 60, // 1 hour
        steps: [
          'stop_application',
          'restore_latest_backup',
          'verify_data_integrity',
          'restart_services',
          'notify_stakeholders'
        ],
        prerequisites: ['backup_availability', 'database_access'],
        contacts: ['dba@foodxchange.com', 'devops@foodxchange.com']
      },
      'server_failure': {
        priority: 'high',
        rto: 60, // 1 hour
        rpo: 120, // 2 hours
        steps: [
          'provision_new_server',
          'restore_latest_backup',
          'update_dns_records',
          'verify_services',
          'notify_stakeholders'
        ],
        prerequisites: ['backup_availability', 'server_provisioning'],
        contacts: ['devops@foodxchange.com', 'sysadmin@foodxchange.com']
      }
    };

    return plans[scenario] || plans['database_corruption'];
  }

  // Utility Methods
  private parseMongoUri(uri: string): {
    host: string;
    port: number;
    username?: string;
    password?: string;
  } {
    const url = new URL(uri);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 27017,
      username: url.username || undefined,
      password: url.password || undefined
    };
  }

  private async calculateDirectorySize(dir: string): Promise<number> {
    const { stdout } = await execAsync(`du -sb ${dir}`);
    return parseInt(stdout.split('\t')[0]);
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    return new Promise((resolve, reject) => {
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async encryptFile(inputPath: string, outputPath: string): Promise<void> {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(this.encryptionKey, 'hex');
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipher(algorithm, key);
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);
    
    return new Promise((resolve, reject) => {
      output.write(iv);
      input.pipe(cipher).pipe(output);
      output.on('finish', resolve);
      output.on('error', reject);
    });
  }

  private async decryptFile(inputPath: string, outputPath: string): Promise<void> {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(this.encryptionKey, 'hex');
    
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);
    
    return new Promise((resolve, reject) => {
      const iv = Buffer.alloc(16);
      input.read(16); // Read IV
      
      const decipher = crypto.createDecipher(algorithm, key);
      input.pipe(decipher).pipe(output);
      output.on('finish', resolve);
      output.on('error', reject);
    });
  }

  private async storeBackupMetadata(backup: BackupResult): Promise<void> {
    const metadataPath = path.join(this.backupDir, 'metadata.json');
    const metadata = {
      backups: [...this.backupHistory, backup]
    };
    
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  private async getBackupMetadata(backupId: string): Promise<BackupResult | null> {
    return this.backupHistory.find(b => b.backupId === backupId) || null;
  }
}

export const backupService = BackupService.getInstance();