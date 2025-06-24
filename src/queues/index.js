const Bull = require('bull');
const Redis = require('redis');

// Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
};

// Create queues
const emailQueue = new Bull('email-queue', { redis: redisConfig });
const analyticsQueue = new Bull('analytics-queue', { redis: redisConfig });
const matchingQueue = new Bull('matching-queue', { redis: redisConfig });
const scoringQueue = new Bull('scoring-queue', { redis: redisConfig });
const complianceQueue = new Bull('compliance-queue', { redis: redisConfig });

// Email Queue Processor
emailQueue.process(async (job) => {
  const { type, data } = job.data;
  const emailService = require('../services/emailService');
  
  switch (type) {
    case 'meeting_invitation':
      await emailService.sendMeetingInvitation(data.email, data.meeting);
      break;
    case 'meeting_reminder':
      await emailService.sendMeetingReminder(data.email, data.meeting);
      break;
    case 'sample_approved':
      await emailService.sendSampleApproval(data.email, data.sample);
      break;
    case 'compliance_expiry':
      await emailService.sendComplianceExpiryWarning(data.email, data.compliance);
      break;
    default:
      console.log('Unknown email type:', type);
  }
});

// Analytics Queue Processor
analyticsQueue.process(async (job) => {
  const { userId, period } = job.data;
  const AnalyticsService = require('../services/analytics/AnalyticsService');
  
  await AnalyticsService.generateUserAnalytics(userId, period);
});

// Matching Queue Processor
matchingQueue.process(async (job) => {
  const { buyerId, requirements } = job.data;
  const SmartMatchingService = require('../services/matching/SmartMatchingService');
  
  const matches = await SmartMatchingService.findSupplierMatches(buyerId, requirements);
  
  // Store matches or send notifications
  if (matches.length > 0) {
    emailQueue.add({
      type: 'new_matches',
      data: { buyerId, matches }
    });
  }
});

// Scoring Queue Processor
scoringQueue.process(async (job) => {
  const { supplierId } = job.data;
  const SupplierScoringService = require('../services/scoring/SupplierScoringService');
  
  await SupplierScoringService.calculateSupplierScore(supplierId);
});

// Compliance Queue Processor
complianceQueue.process(async (job) => {
  const ComplianceService = require('../services/compliance/ComplianceService');
  
  // Check for expiring certifications
  await ComplianceService.checkExpiringCertifications();
});

// Schedule recurring jobs
const scheduleJobs = () => {
  // Daily analytics generation
  analyticsQueue.add(
    'daily-analytics',
    { period: 'daily' },
    { repeat: { cron: '0 2 * * *' } } // 2 AM daily
  );
  
  // Weekly supplier scoring
  scoringQueue.add(
    'weekly-scoring',
    {},
    { repeat: { cron: '0 3 * * 1' } } // Monday 3 AM
  );
  
  // Daily compliance check
  complianceQueue.add(
    'compliance-check',
    {},
    { repeat: { cron: '0 4 * * *' } } // 4 AM daily
  );
};

module.exports = {
  emailQueue,
  analyticsQueue,
  matchingQueue,
  scoringQueue,
  complianceQueue,
  scheduleJobs
};
