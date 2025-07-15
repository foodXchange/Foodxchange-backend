/**
 * Test script for FoodXchange Agent System
 * Run this after starting the server to test the agent functionality
 */

const axios = require('axios');

const API_URL = 'http://localhost:5001/api/v1';
let authToken = '';
let agentId = '';
let leadId = '';

async function testAgentSystem() {
  try {
    console.log('🚀 Starting Agent System Test...\n');

    // 1. Register an agent
    console.log('1. Registering new agent...');
    const registerResponse = await axios.post(`${API_URL}/auth/register`, {
      email: 'testagent@foodxchange.com',
      password: 'Test123!',
      name: 'Test Agent',
      role: 'agent',
      profile: {
        firstName: 'Test',
        lastName: 'Agent',
        phone: '+1234567890'
      }
    });
    
    authToken = registerResponse.data.token;
    console.log('✅ Agent registered successfully');
    console.log(`   Token: ${authToken.substring(0, 20)}...`);

    // 2. Complete agent onboarding - Personal Info
    console.log('\n2. Completing agent onboarding - Personal Info...');
    const onboardingStep1 = await axios.post(
      `${API_URL}/agents/onboard`,
      {
        step: 'personal_info',
        data: {
          firstName: 'Test',
          lastName: 'Agent',
          email: 'testagent@foodxchange.com',
          phone: '+1234567890',
          whatsapp: '+1234567890',
          address: {
            street: '123 Test Street',
            city: 'Los Angeles',
            state: 'CA',
            country: 'USA',
            postalCode: '90001'
          },
          languages: ['English', 'Spanish']
        }
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    agentId = onboardingStep1.data.agent._id;
    console.log('✅ Personal info completed');

    // 3. Complete remaining onboarding steps
    console.log('\n3. Completing remaining onboarding steps...');
    
    // Professional Info
    await axios.post(
      `${API_URL}/agents/onboard`,
      {
        step: 'professional_info',
        data: {
          companyName: 'Test Agency LLC',
          businessRegistration: 'BR123456',
          yearsOfExperience: 5,
          previousRoles: ['Sales Representative', 'Food Broker']
        }
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    console.log('   ✅ Professional info completed');

    // Expertise
    await axios.post(
      `${API_URL}/agents/onboard`,
      {
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
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    console.log('   ✅ Expertise completed');

    // Territory
    await axios.post(
      `${API_URL}/agents/onboard`,
      {
        step: 'territory',
        data: {
          type: 'geographic',
          geographic: {
            countries: ['USA'],
            states: ['California', 'Nevada'],
            cities: ['Los Angeles', 'San Francisco', 'Las Vegas']
          }
        }
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    console.log('   ✅ Territory completed');

    // 4. Get agent profile
    console.log('\n4. Getting agent profile...');
    const profileResponse = await axios.get(
      `${API_URL}/agents/profile`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    console.log('✅ Agent profile retrieved:');
    console.log(`   Name: ${profileResponse.data.profile.fullName}`);
    console.log(`   Status: ${profileResponse.data.profile.status}`);
    console.log(`   Tier: ${profileResponse.data.profile.performance.tier}`);

    // 5. Get available leads
    console.log('\n5. Checking for available leads...');
    const leadsResponse = await axios.get(
      `${API_URL}/agents/leads`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    console.log(`✅ Found ${leadsResponse.data.leads.length} available leads`);
    
    if (leadsResponse.data.leads.length > 0) {
      leadId = leadsResponse.data.leads[0]._id;
      console.log(`   First lead: ${leadsResponse.data.leads[0].leadInfo.title}`);
    }

    // 6. Get agent dashboard
    console.log('\n6. Getting agent dashboard...');
    const dashboardResponse = await axios.get(
      `${API_URL}/agents/dashboard?period=month`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    console.log('✅ Dashboard metrics:');
    console.log(`   Available Leads: ${dashboardResponse.data.dashboard.metrics.availableLeads}`);
    console.log(`   Active Leads: ${dashboardResponse.data.dashboard.metrics.activeLeads}`);
    console.log(`   Closed Deals: ${dashboardResponse.data.dashboard.metrics.closedDeals}`);
    console.log(`   Total Commissions: $${dashboardResponse.data.dashboard.metrics.totalCommissions}`);

    // 7. Get commission summary
    console.log('\n7. Getting commission summary...');
    const commissionsResponse = await axios.get(
      `${API_URL}/agents/commissions`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    console.log('✅ Commission summary:');
    console.log(`   Total commissions: ${commissionsResponse.data.commissions.length}`);
    if (commissionsResponse.data.summary.length > 0) {
      commissionsResponse.data.summary.forEach(status => {
        console.log(`   ${status._id}: ${status.count} commissions, $${status.totalAmount}`);
      });
    }

    console.log('\n✅ All tests completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`   - Agent registered and onboarded`);
    console.log(`   - Agent ID: ${agentId}`);
    console.log(`   - Profile and dashboard accessible`);
    console.log(`   - Lead system operational`);
    console.log(`   - Commission tracking active`);

  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    if (error.response?.status === 404) {
      console.error('   Make sure all routes are properly registered');
    }
  }
}

// Run the test
testAgentSystem();