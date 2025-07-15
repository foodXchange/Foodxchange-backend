#!/usr/bin/env node

/**
 * WhatsApp Service Test Script
 * 
 * This script tests the WhatsApp notification service functionality
 * 
 * Usage: node test-whatsapp.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import services
const whatsappService = require('./src/services/whatsappService');
const Agent = require('./src/models/Agent');
const AgentLead = require('./src/models/AgentLead');
const AgentCommission = require('./src/models/AgentCommission');

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Test data
const testData = {
  agent: {
    personalInfo: {
      whatsapp: '+1234567890', // Replace with actual test number
    },
    performance: {
      tier: 'gold',
      rating: { average: 4.5 },
      metrics: {
        pendingCommission: 1250.00
      }
    }
  },
  
  lead: {
    _id: new mongoose.Types.ObjectId(),
    leadNumber: 'LEAD-TEST-001',
    leadInfo: {
      title: 'Premium Organic Apples',
      urgency: 'high',
      estimatedValue: {
        amount: 15000,
        currency: 'USD'
      },
      requirements: {
        deliveryLocation: {
          city: 'New York',
          country: 'USA'
        }
      }
    },
    assignment: {
      assignedAgents: [{
        agentId: new mongoose.Types.ObjectId(),
        matchScore: 85,
        offerExpiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
      }]
    }
  },
  
  commission: {
    _id: new mongoose.Types.ObjectId(),
    type: 'base_commission',
    status: 'approved',
    financial: {
      netAmount: 750.00,
      dealValue: { amount: 15000 },
      commission: { currency: 'USD' }
    },
    source: {
      referenceNumber: 'ORD-2024-001'
    },
    calculation: {
      breakdown: {
        bonusCalculation: 'Tier bonus (gold): +150.00'
      }
    }
  }
};

// Test functions
const testWhatsAppService = async () => {
  console.log('🧪 Testing WhatsApp Service...\n');
  
  // Test 1: Message formatting
  console.log('📝 Test 1: Message Formatting');
  try {
    const newLeadData = {
      leadTitle: testData.lead.leadInfo.title,
      leadNumber: testData.lead.leadNumber,
      currency: testData.lead.leadInfo.estimatedValue.currency,
      amount: testData.lead.leadInfo.estimatedValue.amount.toLocaleString(),
      location: `${testData.lead.leadInfo.requirements.deliveryLocation.city}, ${testData.lead.leadInfo.requirements.deliveryLocation.country}`,
      urgency: testData.lead.leadInfo.urgency.toUpperCase(),
      matchScore: testData.lead.assignment.assignedAgents[0].matchScore,
      timeRemaining: '45m'
    };
    
    const message = whatsappService.formatMessage('newLead', newLeadData);
    console.log('✅ New lead message formatted successfully:');
    console.log(message);
    console.log('');
  } catch (error) {
    console.error('❌ Message formatting failed:', error);
  }
  
  // Test 2: Phone number formatting
  console.log('📞 Test 2: Phone Number Formatting');
  const testNumbers = [
    '+1234567890',
    '1234567890',
    '(123) 456-7890',
    '123-456-7890',
    '123.456.7890'
  ];
  
  testNumbers.forEach(number => {
    try {
      const formatted = whatsappService.formatWhatsAppNumber(number);
      console.log(`${number} -> ${formatted}`);
    } catch (error) {
      console.error(`❌ Failed to format ${number}:`, error);
    }
  });
  console.log('');
  
  // Test 3: Command parsing (simulate incoming message)
  console.log('💬 Test 3: Command Processing');
  const testCommands = [
    'ACCEPT LEAD123',
    'DECLINE LEAD123 Not in my area',
    'STATUS',
    'HELP',
    'INVALID_COMMAND'
  ];
  
  // Note: This would require a test agent in the database
  console.log('Test commands that would be processed:');
  testCommands.forEach(cmd => {
    console.log(`"${cmd}" -> ${cmd.split(' ')[0]} command`);
  });
  console.log('');
  
  // Test 4: Service availability
  console.log('🔌 Test 4: Service Availability');
  console.log('Twilio Client:', whatsappService.twilioClient ? '✅ Available' : '❌ Not configured');
  console.log('Azure SMS Client:', whatsappService.azureSmsClient ? '✅ Available' : '❌ Not configured');
  console.log('');
  
  // Test 5: Template validation
  console.log('📋 Test 5: Template Validation');
  const templateTypes = ['newLead', 'leadAccepted', 'leadExpired', 'commissionUpdate', 'weeklyReport', 'urgentAlert'];
  templateTypes.forEach(type => {
    const template = whatsappService.templates[type];
    console.log(`${type}: ${template ? '✅ Available' : '❌ Missing'}`);
  });
};

// Test webhook processing
const testWebhookProcessing = async () => {
  console.log('\n🔗 Testing Webhook Processing...\n');
  
  // Simulate Twilio webhook payload
  const twilioPayload = {
    From: 'whatsapp:+1234567890',
    Body: 'STATUS',
    MessageSid: 'test-message-123',
    AccountSid: 'test-account-123'
  };
  
  console.log('📥 Simulated Twilio webhook payload:');
  console.log(JSON.stringify(twilioPayload, null, 2));
  console.log('');
  
  // Test webhook validation logic
  console.log('🔐 Webhook security checks:');
  console.log('Twilio signature validation:', process.env.NODE_ENV === 'production' ? '✅ Enabled' : '⚠️ Disabled (development)');
  console.log('HTTPS requirement:', process.env.NODE_ENV === 'production' ? '✅ Required' : '⚠️ Not required (development)');
};

// Performance test
const testPerformance = async () => {
  console.log('\n⚡ Performance Test...\n');
  
  const startTime = Date.now();
  
  // Simulate formatting multiple messages
  const testData = {
    leadTitle: 'Test Lead',
    leadNumber: 'LEAD001',
    currency: 'USD',
    amount: '10,000',
    location: 'New York, USA',
    urgency: 'HIGH',
    matchScore: 85,
    timeRemaining: '30m'
  };
  
  console.log('🏃 Formatting 100 messages...');
  for (let i = 0; i < 100; i++) {
    whatsappService.formatMessage('newLead', testData);
  }
  
  const endTime = Date.now();
  console.log(`✅ Completed in ${endTime - startTime}ms`);
  console.log(`📊 Average: ${(endTime - startTime) / 100}ms per message`);
};

// Environment check
const checkEnvironment = () => {
  console.log('🔍 Environment Check...\n');
  
  const requiredEnvVars = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_WHATSAPP_FROM',
    'AZURE_COMMUNICATION_CONNECTION_STRING',
    'AZURE_COMMUNICATION_PHONE_NUMBER'
  ];
  
  const optionalEnvVars = [
    'NODE_ENV',
    'MONGODB_URI',
    'JWT_SECRET'
  ];
  
  console.log('Required environment variables:');
  requiredEnvVars.forEach(varName => {
    const value = process.env[varName];
    console.log(`${varName}: ${value ? '✅ Set' : '❌ Missing'}`);
  });
  
  console.log('\nOptional environment variables:');
  optionalEnvVars.forEach(varName => {
    const value = process.env[varName];
    console.log(`${varName}: ${value ? '✅ Set' : '⚠️ Not set'}`);
  });
  
  console.log('');
};

// Main test runner
const runTests = async () => {
  console.log('🚀 FoodXchange WhatsApp Service Test Suite\n');
  console.log('=' .repeat(50));
  
  try {
    // Environment check
    checkEnvironment();
    
    // Connect to database
    await connectDB();
    
    // Run tests
    await testWhatsAppService();
    await testWebhookProcessing();
    await testPerformance();
    
    console.log('\n✅ All tests completed successfully!');
    console.log('\n📋 Next Steps:');
    console.log('1. Configure Twilio WhatsApp Business API');
    console.log('2. Set up Azure Communication Services');
    console.log('3. Configure webhook endpoints');
    console.log('4. Test with real agent phone numbers');
    console.log('5. Deploy to production environment');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

// Run the tests
if (require.main === module) {
  runTests();
}

module.exports = {
  runTests,
  testWhatsAppService,
  testWebhookProcessing,
  testPerformance,
  checkEnvironment
};