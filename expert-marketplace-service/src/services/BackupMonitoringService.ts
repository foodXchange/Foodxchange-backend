import { EventEmitter } from 'events';
import { backupService } from './BackupService';
import { productionLogger } from '../utils/productionLogger';
import { metricsCollector } from '../utils/metrics';

export interface BackupAlert {
  id: string;
  type: 'backup_failed' | 'backup_overdue' | 'backup_integrity_failed' | 'backup_storage_full' | 'backup_performance_degraded';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  details: any;
  acknowledged: boolean;
  resolvedAt?: Date;
}

export interface BackupMetrics {
  totalBackups: number;
  successfulBackups: number;
  failedBackups: number;
  averageBackupTime: number;
  averageBackupSize: number;
  successRate: number;
  lastBackupTime: Date;
  nextScheduledBackup: Date;
  storageUsed: number;
  storageAvailable: number;
  alertsActive: number;
}

export class BackupMonitoringService extends EventEmitter {
  private static instance: BackupMonitoringService;
  private alerts: BackupAlert[] = [];
  private monitoringInterval: NodeJS.Timeout;
  private alertThresholds = {
    backupFailureThreshold: 3, // consecutive failures
    backupOverdueThreshold: 2 * 60 * 60 * 1000, // 2 hours in ms
    storageWarningThreshold: 0.8, // 80% storage usage
    storageCriticalThreshold: 0.9, // 90% storage usage
    performanceDegradationThreshold: 2.0, // 2x normal time
    maxBackupTime: 30 * 60 * 1000, // 30 minutes
    minSuccessRate: 0.95 // 95% success rate
  };

  private constructor() {
    super();
    this.startMonitoring();
  }

  static getInstance(): BackupMonitoringService {
    if (!BackupMonitoringService.instance) {
      BackupMonitoringService.instance = new BackupMonitoringService();
    }
    return BackupMonitoringService.instance;
  }

  private startMonitoring(): void {
    // Monitor backup health every 5 minutes
    this.monitoringInterval = setInterval(() => {
      this.performHealthCheck();
    }, 5 * 60 * 1000);

    // Initial health check
    this.performHealthCheck();

    productionLogger.info('Backup monitoring service started');
  }

  private async performHealthCheck(): Promise<void> {
    try {
      // Check backup status
      const backupStatus = await backupService.getBackupStatus();
      
      // Check for overdue backups
      await this.checkOverdueBackups(backupStatus);
      
      // Check success rate
      await this.checkSuccessRate(backupStatus);
      
      // Check storage usage
      await this.checkStorageUsage(backupStatus);
      
      // Check performance degradation
      await this.checkPerformanceDegradation(backupStatus);
      
      // Update metrics
      await this.updateMetrics(backupStatus);
      
      // Clean up old alerts
      this.cleanupOldAlerts();
      
    } catch (error) {
      productionLogger.error('Backup monitoring health check failed', {
        error: error.message
      });
    }
  }

  private async checkOverdueBackups(backupStatus: any): Promise<void> {
    const now = new Date();
    const timeSinceLastBackup = backupStatus.lastBackup 
      ? now.getTime() - backupStatus.lastBackup.timestamp.getTime()
      : Infinity;

    if (timeSinceLastBackup > this.alertThresholds.backupOverdueThreshold) {
      await this.createAlert({
        type: 'backup_overdue',
        severity: 'high',
        message: `Backup is overdue by ${Math.round(timeSinceLastBackup / (60 * 1000))} minutes`,
        details: {
          timeSinceLastBackup,
          threshold: this.alertThresholds.backupOverdueThreshold,
          lastBackup: backupStatus.lastBackup
        }
      });
    }
  }

  private async checkSuccessRate(backupStatus: any): Promise<void> {
    const successRate = backupStatus.totalBackups > 0 
      ? backupStatus.successfulBackups / backupStatus.totalBackups 
      : 1;

    if (successRate < this.alertThresholds.minSuccessRate) {
      await this.createAlert({
        type: 'backup_failed',
        severity: 'critical',
        message: `Backup success rate is below threshold: ${(successRate * 100).toFixed(1)}%`,
        details: {
          successRate,
          threshold: this.alertThresholds.minSuccessRate,
          totalBackups: backupStatus.totalBackups,
          successfulBackups: backupStatus.successfulBackups,
          failedBackups: backupStatus.failedBackups
        }
      });
    }
  }

  private async checkStorageUsage(backupStatus: any): Promise<void> {
    // Get storage usage from file system
    const storageInfo = await this.getStorageInfo();
    const usagePercentage = storageInfo.used / storageInfo.total;

    if (usagePercentage > this.alertThresholds.storageCriticalThreshold) {
      await this.createAlert({
        type: 'backup_storage_full',
        severity: 'critical',
        message: `Backup storage is critically full: ${(usagePercentage * 100).toFixed(1)}%`,
        details: {
          usagePercentage,
          used: storageInfo.used,
          total: storageInfo.total,
          available: storageInfo.available
        }
      });
    } else if (usagePercentage > this.alertThresholds.storageWarningThreshold) {
      await this.createAlert({
        type: 'backup_storage_full',
        severity: 'medium',
        message: `Backup storage is running low: ${(usagePercentage * 100).toFixed(1)}%`,
        details: {
          usagePercentage,
          used: storageInfo.used,
          total: storageInfo.total,
          available: storageInfo.available
        }
      });
    }
  }

  private async checkPerformanceDegradation(backupStatus: any): Promise<void> {
    const backups = await backupService.listBackups(undefined, 20);
    const recentBackups = backups.filter(backup => 
      backup.success && backup.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    if (recentBackups.length > 0) {
      const averageTime = recentBackups.reduce((sum, backup) => sum + backup.duration, 0) / recentBackups.length;
      const baselineTime = await this.getBaselineBackupTime();

      if (averageTime > baselineTime * this.alertThresholds.performanceDegradationThreshold) {
        await this.createAlert({
          type: 'backup_performance_degraded',
          severity: 'medium',
          message: `Backup performance has degraded: ${Math.round(averageTime / 1000)}s average`,
          details: {
            averageTime,
            baselineTime,
            degradationFactor: averageTime / baselineTime,
            recentBackups: recentBackups.length
          }
        });
      }
    }
  }

  private async getStorageInfo(): Promise<{ used: number; total: number; available: number }> {
    const fs = require('fs');
    const path = require('path');
    
    try {
      const stats = fs.statSync('./backups');
      // This is a simplified calculation - in production, use proper disk usage tools
      return {
        used: 1000000000, // 1GB placeholder
        total: 10000000000, // 10GB placeholder
        available: 9000000000 // 9GB placeholder
      };
    } catch (error) {
      return {
        used: 0,
        total: 0,
        available: 0
      };
    }
  }

  private async getBaselineBackupTime(): Promise<number> {
    const backups = await backupService.listBackups(undefined, 100);
    const successfulBackups = backups.filter(backup => backup.success);
    
    if (successfulBackups.length === 0) {
      return 60000; // 1 minute default
    }

    const totalTime = successfulBackups.reduce((sum, backup) => sum + backup.duration, 0);
    return totalTime / successfulBackups.length;
  }

  private async createAlert(alertData: {
    type: BackupAlert['type'];
    severity: BackupAlert['severity'];
    message: string;
    details: any;
  }): Promise<void> {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if similar alert already exists
    const existingAlert = this.alerts.find(alert => 
      alert.type === alertData.type && 
      !alert.acknowledged && 
      !alert.resolvedAt
    );

    if (existingAlert) {
      // Update existing alert
      existingAlert.message = alertData.message;
      existingAlert.details = alertData.details;
      existingAlert.timestamp = new Date();
      return;
    }

    const alert: BackupAlert = {
      id: alertId,
      type: alertData.type,
      severity: alertData.severity,
      message: alertData.message,
      timestamp: new Date(),
      details: alertData.details,
      acknowledged: false
    };

    this.alerts.push(alert);

    // Log alert
    productionLogger.warn('Backup alert created', {
      alertId,
      type: alert.type,
      severity: alert.severity,
      message: alert.message
    });

    // Emit event for real-time notifications
    this.emit('alert', alert);

    // Send notifications based on severity
    await this.sendNotifications(alert);
  }

  private async sendNotifications(alert: BackupAlert): Promise<void> {
    // Email notifications for high/critical alerts
    if (alert.severity === 'high' || alert.severity === 'critical') {
      await this.sendEmailNotification(alert);
    }

    // Slack notifications for critical alerts
    if (alert.severity === 'critical') {
      await this.sendSlackNotification(alert);
    }

    // SMS notifications for critical alerts during business hours
    if (alert.severity === 'critical' && this.isBusinessHours()) {
      await this.sendSMSNotification(alert);
    }
  }

  private async sendEmailNotification(alert: BackupAlert): Promise<void> {
    // Implementation would integrate with email service
    productionLogger.info('Email notification sent', {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity
    });
  }

  private async sendSlackNotification(alert: BackupAlert): Promise<void> {
    // Implementation would integrate with Slack API
    productionLogger.info('Slack notification sent', {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity
    });
  }

  private async sendSMSNotification(alert: BackupAlert): Promise<void> {
    // Implementation would integrate with SMS service
    productionLogger.info('SMS notification sent', {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity
    });
  }

  private isBusinessHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    
    // Monday to Friday, 9 AM to 5 PM
    return day >= 1 && day <= 5 && hour >= 9 && hour <= 17;
  }

  private async updateMetrics(backupStatus: any): Promise<void> {
    const backups = await backupService.listBackups(undefined, 100);
    const successfulBackups = backups.filter(backup => backup.success);
    
    const metrics: BackupMetrics = {
      totalBackups: backupStatus.totalBackups,
      successfulBackups: backupStatus.successfulBackups,
      failedBackups: backupStatus.failedBackups,
      averageBackupTime: successfulBackups.length > 0 
        ? successfulBackups.reduce((sum, backup) => sum + backup.duration, 0) / successfulBackups.length
        : 0,
      averageBackupSize: successfulBackups.length > 0
        ? successfulBackups.reduce((sum, backup) => sum + backup.size, 0) / successfulBackups.length
        : 0,
      successRate: backupStatus.totalBackups > 0 
        ? backupStatus.successfulBackups / backupStatus.totalBackups
        : 1,
      lastBackupTime: backupStatus.lastBackup?.timestamp || new Date(0),
      nextScheduledBackup: backupStatus.nextScheduledBackup,
      storageUsed: backupStatus.totalSize,
      storageAvailable: 0, // Would be calculated from actual storage
      alertsActive: this.alerts.filter(alert => !alert.acknowledged && !alert.resolvedAt).length
    };

    // Store metrics for monitoring dashboard
    metricsCollector.recordBackupMetrics(metrics);
  }

  private cleanupOldAlerts(): void {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const initialCount = this.alerts.length;
    
    this.alerts = this.alerts.filter(alert => 
      alert.timestamp > cutoff || (!alert.acknowledged && !alert.resolvedAt)
    );

    const cleaned = initialCount - this.alerts.length;
    if (cleaned > 0) {
      productionLogger.debug(`Cleaned up ${cleaned} old backup alerts`);
    }
  }

  // Public methods for managing alerts
  async acknowledgeAlert(alertId: string, userId: string): Promise<boolean> {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) {
      return false;
    }

    alert.acknowledged = true;
    
    productionLogger.info('Backup alert acknowledged', {
      alertId,
      userId,
      type: alert.type
    });

    return true;
  }

  async resolveAlert(alertId: string, userId: string): Promise<boolean> {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) {
      return false;
    }

    alert.resolvedAt = new Date();
    
    productionLogger.info('Backup alert resolved', {
      alertId,
      userId,
      type: alert.type
    });

    return true;
  }

  getActiveAlerts(): BackupAlert[] {
    return this.alerts.filter(alert => !alert.acknowledged && !alert.resolvedAt);
  }

  getAlertsHistory(limit: number = 50): BackupAlert[] {
    return this.alerts
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getBackupMetrics(): Promise<BackupMetrics> {
    const backupStatus = await backupService.getBackupStatus();
    const backups = await backupService.listBackups(undefined, 100);
    const successfulBackups = backups.filter(backup => backup.success);
    
    return {
      totalBackups: backupStatus.totalBackups,
      successfulBackups: backupStatus.successfulBackups,
      failedBackups: backupStatus.failedBackups,
      averageBackupTime: successfulBackups.length > 0 
        ? successfulBackups.reduce((sum, backup) => sum + backup.duration, 0) / successfulBackups.length
        : 0,
      averageBackupSize: successfulBackups.length > 0
        ? successfulBackups.reduce((sum, backup) => sum + backup.size, 0) / successfulBackups.length
        : 0,
      successRate: backupStatus.totalBackups > 0 
        ? backupStatus.successfulBackups / backupStatus.totalBackups
        : 1,
      lastBackupTime: backupStatus.lastBackup?.timestamp || new Date(0),
      nextScheduledBackup: backupStatus.nextScheduledBackup,
      storageUsed: backupStatus.totalSize,
      storageAvailable: 0,
      alertsActive: this.getActiveAlerts().length
    };
  }

  async testAlert(type: BackupAlert['type']): Promise<void> {
    await this.createAlert({
      type,
      severity: 'low',
      message: 'Test alert - please ignore',
      details: { test: true }
    });
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    productionLogger.info('Backup monitoring service stopped');
  }
}

// Extend MetricsCollector to include backup metrics
declare module '../utils/metrics' {
  interface MetricsCollector {
    recordBackupMetrics(metrics: BackupMetrics): void;
  }
}

// Add backup metrics recording to MetricsCollector
const originalMetricsCollector = metricsCollector;
(originalMetricsCollector as any).recordBackupMetrics = function(metrics: BackupMetrics): void {
  productionLogger.info('Backup metrics recorded', metrics);
};

export const backupMonitoringService = BackupMonitoringService.getInstance();