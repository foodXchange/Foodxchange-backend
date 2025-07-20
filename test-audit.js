// Simple test script to verify audit logging

const mongoose = require('mongoose');
const path = require('path');
const AuditLog = require(path.join(__dirname, 'dist', 'models', 'AuditLog')).AuditLog;

async function testAuditLogging() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange');
    console.log('✅ Connected to MongoDB');

    // Create test audit log
    const testLog = new AuditLog({
      action: 'test_audit_log',
      category: 'system',
      severity: 'info',
      userId: new mongoose.Types.ObjectId(),
      userEmail: 'test@example.com',
      userRole: 'admin',
      resource: {
        type: 'test',
        id: 'test-123',
        name: 'Test Resource'
      },
      result: 'success',
      metadata: {
        test: true,
        timestamp: new Date()
      },
      compliance: {
        dataClassification: 'internal'
      }
    });

    await testLog.save();
    console.log('✅ Test audit log created:', testLog._id);

    // Query audit logs
    const logs = await AuditLog.find({ action: 'test_audit_log' });
    console.log(`✅ Found ${logs.length} test audit logs`);

    // Get statistics
    const stats = await AuditLog.getStatsByCategory();
    console.log('✅ Audit log statistics:');
    stats.forEach(stat => {
      console.log(`  - ${stat._id}: ${stat.count} logs (${stat.criticalCount} critical, ${stat.failureCount} failures)`);
    });

    // Clean up test data
    await AuditLog.deleteOne({ _id: testLog._id });
    console.log('✅ Test audit log cleaned up');

    // Disconnect
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    
    console.log('\n✅ Audit logging system is working correctly!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error testing audit logging:', error);
    process.exit(1);
  }
}

// Run test
testAuditLogging();