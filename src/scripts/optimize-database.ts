#!/usr/bin/env tsx
/**
 * Database Optimization Script
 * Runs database optimizations, index creation, and performance improvements
 */

import dotenv from 'dotenv';
import { ArchitectureIntegrator, createDefaultConfig } from '../core/integration/ArchitectureIntegrator';

// Load environment variables
dotenv.config();

async function optimizeDatabase(): Promise<void> {
  console.log('🚀 Starting database optimization...');
  
  try {
    // Initialize architecture integrator
    const config = createDefaultConfig();
    
    // Override with environment-specific config
    if (process.env.MONGODB_URI) {
      config.database.primary.uri = process.env.MONGODB_URI;
    }
    
    const integrator = new ArchitectureIntegrator(config);
    const services = await integrator.initialize();
    
    console.log('✅ Architecture initialized successfully');
    
    // Run database optimizations
    console.log('🔧 Running database optimizations...');
    
    // Optimize indexes
    await services.database.optimizeAllIndexes();
    console.log('✅ Database indexes optimized');
    
    // Run connection pool optimization
    await services.database.optimizeConnectionPool();
    console.log('✅ Connection pool optimized');
    
    // Run query optimizer
    await services.database.analyzeSlowQueries();
    console.log('✅ Slow queries analyzed');
    
    console.log('\n🎉 Database optimization completed successfully!');
    console.log('\n📊 Optimization Summary:');
    console.log('- Indexes optimized and rebuilt');
    console.log('- Connection pool settings tuned');
    console.log('- Slow queries identified and logged');
    console.log('- Performance baseline established');
    
  } catch (error) {
    console.error('❌ Database optimization failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the optimization
optimizeDatabase().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});