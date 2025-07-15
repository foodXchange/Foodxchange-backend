#!/usr/bin/env node

/**
 * Simple WhatsApp Service Test
 * Tests core functionality without database dependencies
 */

const dotenv = require('dotenv');
dotenv.config();

// Mock the required modules for testing
const mockAgent = {
  personalInfo: {
    whatsapp: '+1234567890'
  },
  performance: {
    tier: 'gold',
    rating: { average: 4.5 },
    metrics: { pendingCommission: 1250.00 }
  }
};

const mockLead = {
  leadNumber: 'LEAD-TEST-001',
  leadInfo: {
    title: 'Premium Organic Apples',
    urgency: 'high',
    estimatedValue: { amount: 15000, currency: 'USD' },
    requirements: {
      deliveryLocation: { city: 'New York', country: 'USA' }
    }
  },
  assignment: {
    assignedAgents: [{ matchScore: 85, offerExpiresAt: new Date(Date.now() + 60 * 60 * 1000) }]
  }
};

// Test the service functions directly
console.log('🚀 Simple WhatsApp Service Test\n');

// Test 1: Message templates
console.log('📝 Testing Message Templates...\n');

const templates = {
  newLead: {
    template: 'new_lead_notification',
    body: `🔔 *New Lead Available!*\n\n*Lead:* {{leadTitle}}\n*Value:* {{currency}} {{amount}}\n*Location:* {{location}}\n*Urgency:* {{urgency}}\n*Match Score:* {{matchScore}}%\n\n⏰ *Response Time:* {{timeRemaining}}\n\n✅ Reply 'ACCEPT {{leadNumber}}' to accept\n❌ Reply 'DECLINE {{leadNumber}}' to decline\n\n_Lead #{{leadNumber}}_`
  },
  commissionUpdate: {
    template: 'commission_update',
    body: `💰 *Commission Update!*\n\n*Type:* {{commissionType}}\n*Amount:* {{currency}} {{amount}}\n*Status:* {{status}}\n*Deal:* {{dealReference}}\n\n{{additionalInfo}}\n\n_Your total pending commission: {{currency}} {{pendingTotal}}_`
  }
};

// Format message function
function formatMessage(messageType, data) {
  const template = templates[messageType];
  if (!template) {
    throw new Error(`Unknown message type: ${messageType}`);
  }

  let message = template.body;
  
  // Replace placeholders
  Object.keys(data).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    message = message.replace(regex, data[key]);
  });

  return message;
}

// Test new lead message
const newLeadData = {
  leadTitle: mockLead.leadInfo.title,
  leadNumber: mockLead.leadNumber,
  currency: mockLead.leadInfo.estimatedValue.currency,
  amount: mockLead.leadInfo.estimatedValue.amount.toLocaleString(),
  location: `${mockLead.leadInfo.requirements.deliveryLocation.city}, ${mockLead.leadInfo.requirements.deliveryLocation.country}`,
  urgency: mockLead.leadInfo.urgency.toUpperCase(),
  matchScore: mockLead.assignment.assignedAgents[0].matchScore,
  timeRemaining: '45m'
};

console.log('📄 New Lead Message:');
console.log(formatMessage('newLead', newLeadData));
console.log('\n' + '='.repeat(50) + '\n');

// Test commission message
const commissionData = {
  commissionType: 'Base Commission',
  currency: 'USD',
  amount: '750.00',
  status: '✅ Approved',
  dealReference: 'ORD-2024-001',
  additionalInfo: 'Tier bonus (gold): +150.00',
  pendingTotal: '2,480.00'
};

console.log('💰 Commission Update Message:');
console.log(formatMessage('commissionUpdate', commissionData));
console.log('\n' + '='.repeat(50) + '\n');

// Test 2: Phone number formatting
console.log('📞 Testing Phone Number Formatting...\n');

function formatWhatsAppNumber(number) {
  let cleaned = number.replace(/\D/g, '');
  
  if (!cleaned.startsWith('1') && cleaned.length === 10) {
    cleaned = '1' + cleaned;
  }
  
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  
  return cleaned;
}

const testNumbers = [
  '+1234567890',
  '1234567890',
  '(123) 456-7890',
  '123-456-7890',
  '123.456.7890'
];

testNumbers.forEach(number => {
  const formatted = formatWhatsAppNumber(number);
  console.log(`${number.padEnd(15)} -> ${formatted}`);
});

console.log('\n' + '='.repeat(50) + '\n');

// Test 3: Time formatting
console.log('⏰ Testing Time Formatting...\n');

function formatTimeRemaining(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

const testTimes = [
  60000,     // 1 minute
  600000,    // 10 minutes
  3600000,   // 1 hour
  7200000,   // 2 hours
  86400000   // 1 day
];

testTimes.forEach(time => {
  const formatted = formatTimeRemaining(time);
  console.log(`${time.toLocaleString().padEnd(10)} ms -> ${formatted}`);
});

console.log('\n' + '='.repeat(50) + '\n');

// Test 4: Environment check
console.log('🔍 Environment Check...\n');

const envVars = {
  'TWILIO_ACCOUNT_SID': process.env.TWILIO_ACCOUNT_SID,
  'TWILIO_AUTH_TOKEN': process.env.TWILIO_AUTH_TOKEN,
  'TWILIO_WHATSAPP_FROM': process.env.TWILIO_WHATSAPP_FROM,
  'AZURE_COMMUNICATION_CONNECTION_STRING': process.env.AZURE_COMMUNICATION_CONNECTION_STRING,
  'AZURE_COMMUNICATION_PHONE_NUMBER': process.env.AZURE_COMMUNICATION_PHONE_NUMBER
};

Object.entries(envVars).forEach(([key, value]) => {
  const status = value ? '✅ Set' : '❌ Not set';
  const display = value ? (key.includes('TOKEN') || key.includes('SECRET') ? '*'.repeat(8) : value) : 'Not configured';
  console.log(`${key.padEnd(35)}: ${status} ${display ? '(' + display + ')' : ''}`);
});

console.log('\n' + '='.repeat(50) + '\n');

// Test 5: Service availability simulation
console.log('🔌 Service Availability Check...\n');

const hasTwilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
const hasAzure = !!process.env.AZURE_COMMUNICATION_CONNECTION_STRING;

console.log('Twilio WhatsApp:', hasTwilio ? '✅ Available' : '❌ Not configured');
console.log('Azure SMS (fallback):', hasAzure ? '✅ Available' : '❌ Not configured');

if (!hasTwilio && !hasAzure) {
  console.log('\n⚠️  WARNING: No messaging services configured!');
  console.log('Please configure either Twilio or Azure Communication Services.');
} else if (hasTwilio && !hasAzure) {
  console.log('\n⚠️  WARNING: No SMS fallback configured!');
  console.log('Consider adding Azure Communication Services for SMS fallback.');
} else if (!hasTwilio && hasAzure) {
  console.log('\n⚠️  WARNING: No WhatsApp service configured!');
  console.log('Only SMS fallback is available. Consider adding Twilio for WhatsApp.');
} else {
  console.log('\n✅ All messaging services configured correctly!');
}

console.log('\n' + '='.repeat(50) + '\n');

// Test 6: Webhook URL validation
console.log('🔗 Webhook Configuration...\n');

const baseUrl = process.env.BASE_URL || 'https://yourdomain.com';
const webhookEndpoints = [
  `${baseUrl}/api/v1/webhooks/twilio/whatsapp`,
  `${baseUrl}/api/v1/webhooks/twilio/whatsapp/status`,
  `${baseUrl}/api/v1/webhooks/azure/sms`
];

console.log('Webhook endpoints to configure:');
webhookEndpoints.forEach(endpoint => {
  console.log(`📍 ${endpoint}`);
});

console.log('\n✅ WhatsApp Service Test Complete!\n');
console.log('📋 Next Steps:');
console.log('1. Configure Twilio account and WhatsApp Business API');
console.log('2. Set up Azure Communication Services');
console.log('3. Add environment variables to .env file');
console.log('4. Configure webhook endpoints in Twilio dashboard');
console.log('5. Test with real phone numbers');
console.log('6. Deploy to production environment');