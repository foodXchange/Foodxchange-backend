const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const Agent = require('../models/Agent');
const AgentLead = require('../models/AgentLead');
const AgentCommission = require('../models/AgentCommission');

describe('Agent System Integration Tests', () => {
  let authToken;
  let agentUserId;
  let agentId;
  let leadId;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/foodxchange_test');
  });

  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({ email: { $regex: 'test.*@example.com' } });
    await Agent.deleteMany({ 'personalInfo.email': { $regex: 'test.*@example.com' } });
    await AgentLead.deleteMany({});
    await AgentCommission.deleteMany({});
    await mongoose.connection.close();
  });

  describe('Agent Registration and Onboarding', () => {
    test('Should register a new user with agent role', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'testagent@example.com',
          password: 'password123',
          role: 'agent',
          profile: {
            firstName: 'Test',
            lastName: 'Agent',
            phone: '+1234567890'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.user.role).toBe('agent');
      expect(response.body.token).toBeDefined();
      
      authToken = response.body.token;
      agentUserId = response.body.user._id;
    });

    test('Should complete agent onboarding - personal info', async () => {
      const response = await request(app)
        .post('/api/agents/onboard')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          step: 'personal_info',
          data: {
            firstName: 'Test',
            lastName: 'Agent',
            email: 'testagent@example.com',
            phone: '+1234567890',
            whatsapp: '+1234567890',
            address: {
              street: '123 Test St',
              city: 'Test City',
              state: 'TS',
              country: 'USA',
              postalCode: '12345'
            },
            languages: ['English', 'Spanish']
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.nextStep).toBe('professional_info');
      agentId = response.body.agent._id;
    });

    test('Should complete agent onboarding - professional info', async () => {
      const response = await request(app)
        .post('/api/agents/onboard')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          step: 'professional_info',
          data: {
            companyName: 'Test Agency LLC',
            businessRegistration: 'BR123456',
            yearsOfExperience: 5,
            previousRoles: ['Sales Representative', 'Business Development Manager']
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.nextStep).toBe('expertise');
    });

    test('Should complete agent onboarding - expertise', async () => {
      const response = await request(app)
        .post('/api/agents/onboard')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          step: 'expertise',
          data: {
            specializations: ['produce', 'dairy'],
            skills: ['negotiation', 'market analysis', 'customer service'],
            certifications: [{
              name: 'Food Safety Certification',
              issuer: 'FDA',
              number: 'FSC123456',
              issueDate: new Date('2023-01-01'),
              expiryDate: new Date('2025-01-01')
            }]
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.nextStep).toBe('territory');
    });

    test('Should complete agent onboarding - territory', async () => {
      const response = await request(app)
        .post('/api/agents/onboard')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          step: 'territory',
          data: {
            type: 'geographic',
            geographic: {
              countries: ['USA'],
              states: ['California', 'Nevada'],
              cities: ['Los Angeles', 'San Francisco', 'Las Vegas']
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.nextStep).toBe('verification');
    });
  });

  describe('Agent Profile Management', () => {
    test('Should get agent profile', async () => {
      const response = await request(app)
        .get('/api/agents/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.profile).toBeDefined();
      expect(response.body.profile.personalInfo.email).toBe('testagent@example.com');
      expect(response.body.profile.metrics).toBeDefined();
    });

    test('Should update agent profile', async () => {
      const response = await request(app)
        .put('/api/agents/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          section: 'communication',
          data: {
            preferredMethod: 'whatsapp',
            notifications: {
              newLeads: true,
              leadUpdates: true,
              commissionUpdates: true
            },
            contactHours: {
              start: '08:00',
              end: '18:00',
              timezone: 'America/Los_Angeles'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.agent.communication.preferredMethod).toBe('whatsapp');
    });
  });

  describe('Lead Distribution System', () => {
    test('Should create and match a lead to agent', async () => {
      // Create a test RFQ
      const rfq = {
        title: 'Test RFQ for Organic Produce',
        description: 'Looking for organic vegetables supplier',
        category: new mongoose.Types.ObjectId(),
        buyer: new mongoose.Types.ObjectId(),
        buyerCompany: new mongoose.Types.ObjectId(),
        requirements: {
          quantity: 1000,
          unit: 'kg',
          deliveryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          deliveryLocation: {
            city: 'Los Angeles',
            state: 'California',
            country: 'USA',
            coordinates: { lat: 34.0522, lng: -118.2437 }
          },
          budgetRange: {
            min: 5000,
            max: 10000,
            currency: 'USD'
          }
        },
        deadlineDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      };

      // Create lead from RFQ
      const leadDistributionService = require('../services/leadDistributionService');
      const lead = await leadDistributionService.createLeadFromRFQ(rfq);
      
      expect(lead).toBeDefined();
      expect(lead.leadInfo.title).toBe(rfq.title);
      leadId = lead._id;

      // Match agents to lead
      const matchedAgents = await leadDistributionService.matchAgentsToLead(lead._id);
      expect(matchedAgents).toBeDefined();
    });

    test('Should get available leads for agent', async () => {
      const response = await request(app)
        .get('/api/agents/leads')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.leads).toBeDefined();
      expect(response.body.pagination).toBeDefined();
    });

    test('Should accept a lead', async () => {
      const response = await request(app)
        .post(`/api/agents/leads/${leadId}/accept`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.lead.status).toBe('accepted');
    });
  });

  describe('Commission Calculation', () => {
    test('Should calculate commission for a completed deal', async () => {
      const commissionService = require('../services/commissionCalculationService');
      
      const dealData = {
        agentId: agentId,
        leadId: leadId,
        dealValue: 10000,
        currency: 'USD'
      };

      const commission = await commissionService.calculateCommission(dealData);
      
      expect(commission).toBeDefined();
      expect(commission.primaryCommission).toBeDefined();
      expect(commission.totalAmount).toBeGreaterThan(0);
      expect(commission.primaryCommission.financial.commission.baseAmount).toBe(150); // 1.5% of 10000
    });

    test('Should get agent commissions', async () => {
      const response = await request(app)
        .get('/api/agents/commissions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.commissions).toBeDefined();
      expect(response.body.summary).toBeDefined();
    });
  });

  describe('Agent Dashboard', () => {
    test('Should get agent dashboard data', async () => {
      const response = await request(app)
        .get('/api/agents/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ period: 'month' });

      expect(response.status).toBe(200);
      expect(response.body.dashboard).toBeDefined();
      expect(response.body.dashboard.metrics).toBeDefined();
      expect(response.body.dashboard.agent).toBeDefined();
    });
  });
});

// Export test utilities for other test files
module.exports = {
  createTestAgent: async (userData) => {
    const user = await User.create({
      ...userData,
      role: 'agent'
    });

    const agent = await Agent.create({
      userId: user._id,
      personalInfo: {
        firstName: userData.profile.firstName,
        lastName: userData.profile.lastName,
        email: userData.email,
        phone: userData.profile.phone
      },
      status: 'active'
    });

    return { user, agent };
  },

  createTestLead: async (leadData) => {
    return await AgentLead.create(leadData);
  },

  cleanupTestData: async () => {
    await User.deleteMany({ email: { $regex: 'test.*@example.com' } });
    await Agent.deleteMany({ 'personalInfo.email': { $regex: 'test.*@example.com' } });
    await AgentLead.deleteMany({});
    await AgentCommission.deleteMany({});
  }
};