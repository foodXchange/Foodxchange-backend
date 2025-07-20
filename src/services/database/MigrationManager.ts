import mongoose from 'mongoose';

import { Logger } from '../../core/logging/logger';

import { IndexManager } from './IndexManager';

const logger = new Logger('MigrationManager');

export interface Migration {
  id: string;
  version: string;
  description: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
  appliedAt?: Date;
}

export interface MigrationRecord {
  _id?: string;
  migrationId: string;
  version: string;
  description: string;
  appliedAt: Date;
  checksum: string;
}

export class MigrationManager {
  private static instance: MigrationManager;
  private readonly migrations: Map<string, Migration> = new Map();
  private readonly migrationCollection = 'migrations';
  private readonly indexManager: IndexManager;

  private constructor() {
    this.indexManager = IndexManager.getInstance();
    this.registerMigrations();
  }

  public static getInstance(): MigrationManager {
    if (!MigrationManager.instance) {
      MigrationManager.instance = new MigrationManager();
    }
    return MigrationManager.instance;
  }

  private registerMigrations(): void {
    // Initial database setup migration
    this.registerMigration({
      id: '001_initial_setup',
      version: '1.0.0',
      description: 'Initial database setup and indexes',
      up: async () => {
        logger.info('Running initial database setup...');
        await this.indexManager.createAllIndexes();
        logger.info('Initial setup completed');
      },
      down: async () => {
        logger.info('Dropping all indexes...');
        const collections = ['users', 'companies', 'analyticsevents'];
        for (const collection of collections) {
          try {
            const {db} = mongoose.connection;
            const coll = db.collection(collection);
            const indexes = await coll.listIndexes().toArray();

            for (const index of indexes) {
              if (index.name !== '_id_') {
                await coll.dropIndex(index.name);
                logger.info(`Dropped index: ${index.name}`);
              }
            }
          } catch (error) {
            logger.error(`Failed to drop indexes for ${collection}:`, error);
          }
        }
        logger.info('Index cleanup completed');
      }
    });

    // User model enhancements migration
    this.registerMigration({
      id: '002_user_enhancements',
      version: '1.1.0',
      description: 'Add progressive profiling and security fields to users',
      up: async () => {
        logger.info('Adding progressive profiling fields to users...');
        const {db} = mongoose.connection;
        const users = db.collection('users');

        await users.updateMany(
          { onboardingStep: { $exists: false } },
          {
            $set: {
              onboardingStep: 'email-verification',
              profileCompletionPercentage: 0,
              failedLoginAttempts: 0,
              accountStatus: 'active',
              isEmailVerified: false,
              companyVerified: false,
              lastPasswordChange: new Date(),
              securityQuestions: [],
              preferences: {
                notifications: {
                  email: true,
                  sms: false,
                  push: true
                },
                privacy: {
                  profileVisibility: 'public',
                  allowSearchEngineIndexing: true
                }
              }
            }
          }
        );

        logger.info('User enhancements migration completed');
      },
      down: async () => {
        logger.info('Removing progressive profiling fields from users...');
        const {db} = mongoose.connection;
        const users = db.collection('users');

        await users.updateMany(
          {},
          {
            $unset: {
              onboardingStep: '',
              profileCompletionPercentage: '',
              failedLoginAttempts: '',
              accountStatus: '',
              isEmailVerified: '',
              companyVerified: '',
              lastPasswordChange: '',
              securityQuestions: '',
              preferences: ''
            }
          }
        );

        logger.info('User enhancements rollback completed');
      }
    });

    // Company model enhancements migration
    this.registerMigration({
      id: '003_company_enhancements',
      version: '1.2.0',
      description: 'Add verification and business fields to companies',
      up: async () => {
        logger.info('Adding verification fields to companies...');
        const {db} = mongoose.connection;
        const companies = db.collection('companies');

        await companies.updateMany(
          { verificationStatus: { $exists: false } },
          {
            $set: {
              verificationStatus: 'pending',
              businessType: 'restaurant',
              size: 'small',
              industry: 'food-service',
              certifications: [],
              businessHours: {
                monday: { open: '09:00', close: '17:00', closed: false },
                tuesday: { open: '09:00', close: '17:00', closed: false },
                wednesday: { open: '09:00', close: '17:00', closed: false },
                thursday: { open: '09:00', close: '17:00', closed: false },
                friday: { open: '09:00', close: '17:00', closed: false },
                saturday: { open: '09:00', close: '17:00', closed: false },
                sunday: { open: '09:00', close: '17:00', closed: true }
              }
            }
          }
        );

        logger.info('Company enhancements migration completed');
      },
      down: async () => {
        logger.info('Removing verification fields from companies...');
        const {db} = mongoose.connection;
        const companies = db.collection('companies');

        await companies.updateMany(
          {},
          {
            $unset: {
              verificationStatus: '',
              businessType: '',
              size: '',
              industry: '',
              certifications: '',
              businessHours: ''
            }
          }
        );

        logger.info('Company enhancements rollback completed');
      }
    });

    // Analytics TTL optimization migration
    this.registerMigration({
      id: '004_analytics_ttl',
      version: '1.3.0',
      description: 'Optimize analytics collection with TTL indexes',
      up: async () => {
        logger.info('Optimizing analytics collection with TTL indexes...');
        const {db} = mongoose.connection;
        const analytics = db.collection('analyticsevents');

        // Create TTL index for automatic cleanup (90 days)
        await analytics.createIndex(
          { timestamp: 1 },
          { expireAfterSeconds: 7776000, background: true }
        );

        // Add processed field to existing documents
        await analytics.updateMany(
          { processed: { $exists: false } },
          { $set: { processed: false } }
        );

        logger.info('Analytics TTL optimization completed');
      },
      down: async () => {
        logger.info('Removing TTL optimization from analytics...');
        const {db} = mongoose.connection;
        const analytics = db.collection('analyticsevents');

        // Drop TTL index
        try {
          await analytics.dropIndex('timestamp_1');
        } catch (error) {
          logger.warn('TTL index may not exist:', error);
        }

        // Remove processed field
        await analytics.updateMany(
          {},
          { $unset: { processed: '' } }
        );

        logger.info('Analytics TTL rollback completed');
      }
    });

    logger.info(`Registered ${this.migrations.size} database migrations`);
  }

  public registerMigration(migration: Migration): void {
    this.migrations.set(migration.id, migration);
  }

  public async runMigrations(): Promise<void> {
    logger.info('Starting database migrations...');

    await this.ensureMigrationCollection();

    const appliedMigrations = await this.getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map(m => m.migrationId));

    const sortedMigrations = Array.from(this.migrations.values())
      .sort((a, b) => a.id.localeCompare(b.id));

    let appliedCount = 0;

    for (const migration of sortedMigrations) {
      if (!appliedIds.has(migration.id)) {
        await this.runMigration(migration);
        appliedCount++;
      }
    }

    logger.info(`Migration completed: ${appliedCount} migrations applied`);
  }

  public async runMigration(migration: Migration): Promise<void> {
    logger.info(`Running migration: ${migration.id} - ${migration.description}`);

    const startTime = Date.now();

    try {
      await migration.up();

      const record: MigrationRecord = {
        migrationId: migration.id,
        version: migration.version,
        description: migration.description,
        appliedAt: new Date(),
        checksum: this.calculateChecksum(migration)
      };

      await this.saveMigrationRecord(record);

      const duration = Date.now() - startTime;
      logger.info(`Migration completed: ${migration.id} (${duration}ms)`);
    } catch (error) {
      logger.error(`Migration failed: ${migration.id}`, error);
      throw error;
    }
  }

  public async rollbackMigration(migrationId: string): Promise<void> {
    const migration = this.migrations.get(migrationId);
    if (!migration) {
      throw new Error(`Migration not found: ${migrationId}`);
    }

    logger.info(`Rolling back migration: ${migrationId}`);

    try {
      await migration.down();
      await this.removeMigrationRecord(migrationId);
      logger.info(`Migration rolled back: ${migrationId}`);
    } catch (error) {
      logger.error(`Migration rollback failed: ${migrationId}`, error);
      throw error;
    }
  }

  public async getAppliedMigrations(): Promise<MigrationRecord[]> {
    const {db} = mongoose.connection;
    const collection = db.collection(this.migrationCollection);
    return await collection.find({}).sort({ appliedAt: 1 }).toArray();
  }

  public async getPendingMigrations(): Promise<Migration[]> {
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map(m => m.migrationId));

    return Array.from(this.migrations.values())
      .filter(migration => !appliedIds.has(migration.id))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  public async getMigrationStatus(): Promise<{
    total: number;
    applied: number;
    pending: number;
    appliedMigrations: MigrationRecord[];
    pendingMigrations: Migration[];
  }> {
    const appliedMigrations = await this.getAppliedMigrations();
    const pendingMigrations = await this.getPendingMigrations();

    return {
      total: this.migrations.size,
      applied: appliedMigrations.length,
      pending: pendingMigrations.length,
      appliedMigrations,
      pendingMigrations
    };
  }

  public async validateMigrations(): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    const appliedMigrations = await this.getAppliedMigrations();

    for (const record of appliedMigrations) {
      const migration = this.migrations.get(record.migrationId);
      if (!migration) {
        issues.push(`Applied migration not found in code: ${record.migrationId}`);
        continue;
      }

      const currentChecksum = this.calculateChecksum(migration);
      if (record.checksum !== currentChecksum) {
        issues.push(`Migration checksum mismatch: ${record.migrationId}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  private async ensureMigrationCollection(): Promise<void> {
    const {db} = mongoose.connection;
    const collections = await db.listCollections().toArray();
    const migrationCollectionExists = collections.some(
      collection => collection.name === this.migrationCollection
    );

    if (!migrationCollectionExists) {
      await db.createCollection(this.migrationCollection);
      logger.info('Created migrations collection');
    }
  }

  private async saveMigrationRecord(record: MigrationRecord): Promise<void> {
    const {db} = mongoose.connection;
    const collection = db.collection(this.migrationCollection);
    await collection.insertOne(record);
  }

  private async removeMigrationRecord(migrationId: string): Promise<void> {
    const {db} = mongoose.connection;
    const collection = db.collection(this.migrationCollection);
    await collection.deleteOne({ migrationId });
  }

  private calculateChecksum(migration: Migration): string {
    // Simple checksum based on migration content
    const content = JSON.stringify({
      id: migration.id,
      version: migration.version,
      description: migration.description,
      upFunction: migration.up.toString(),
      downFunction: migration.down.toString()
    });

    // Simple hash function (in production, use crypto.createHash)
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return Math.abs(hash).toString(16);
  }
}
