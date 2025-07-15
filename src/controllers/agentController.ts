const Agent = require('../models/Agent');
const User = require('../models/User');
const AgentLead = require('../models/AgentLead');
const AgentActivity = require('../models/AgentActivity');
const AgentCommission = require('../models/AgentCommission');
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const agentOnboarding = asyncHandler(async (req, res) => {
  const { step, data } = req.body;
  const userId = req.user.id;

  let agent = await Agent.findOne({ userId });
  if (!agent) {
    agent = new Agent({
      userId,
      'onboarding.step': 'personal_info',
      'onboarding.startedAt': new Date()
    });
  }

  switch (step) {
    case 'personal_info':
      agent.personalInfo = {
        ...agent.personalInfo,
        ...data
      };
      agent.onboarding.step = 'professional_info';
      break;

    case 'professional_info':
      agent.professionalInfo = {
        ...agent.professionalInfo,
        ...data
      };
      agent.onboarding.step = 'expertise';
      break;

    case 'expertise':
      agent.expertise = {
        ...agent.expertise,
        ...data
      };
      agent.onboarding.step = 'territory';
      break;

    case 'territory':
      agent.territory = {
        ...agent.territory,
        ...data
      };
      agent.onboarding.step = 'verification';
      break;

    case 'verification':
      agent.verification = {
        ...agent.verification,
        ...data
      };
      agent.onboarding.step = 'banking';
      break;

    case 'banking':
      agent.banking = {
        ...agent.banking,
        ...data
      };
      agent.onboarding.step = 'training';
      break;

    case 'training':
      agent.onboarding.trainingCompleted = true;
      agent.onboarding.step = 'completed';
      agent.onboarding.completedAt = new Date();
      agent.status = 'under_review';
      break;

    default:
      return res.status(400).json({ error: 'Invalid onboarding step' });
  }

  agent.onboarding.completedSteps.push(step);
  await agent.save();

  // Log activity
  await new AgentActivity({
    agentId: agent._id,
    activity: {
      type: 'profile_update',
      subType: `onboarding_${step}`,
      description: `Completed onboarding step: ${step}`,
      category: 'administrative'
    },
    context: {
      source: 'web',
      platform: 'web_app'
    },
    outcome: {
      status: 'success',
      result: `Step ${step} completed successfully`
    }
  }).save();

  res.json({
    success: true,
    agent,
    nextStep: agent.onboarding.step,
    progress: (agent.onboarding.completedSteps.length / 7) * 100
  });
});

const getAgentProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  const agent = await Agent.findOne({ userId })
    .populate('userId', 'email profile preferences')
    .populate('expertise.categories', 'name')
    .populate('territory.categories', 'name');

  if (!agent) {
    return res.status(404).json({ error: 'Agent profile not found' });
  }

  // Calculate additional metrics
  const totalLeads = await AgentLead.countDocuments({ 'assignment.activeAgent': agent._id });
  const closedDeals = await AgentLead.countDocuments({ 
    'assignment.activeAgent': agent._id, 
    status: 'closed_won' 
  });
  const totalCommissions = await AgentCommission.aggregate([
    { $match: { agentId: agent._id, status: 'paid' } },
    { $group: { _id: null, total: { $sum: '$financial.netAmount' } } }
  ]);

  const profile = {
    ...agent.toObject(),
    metrics: {
      totalLeads,
      closedDeals,
      conversionRate: totalLeads > 0 ? (closedDeals / totalLeads) * 100 : 0,
      totalEarnings: totalCommissions.length > 0 ? totalCommissions[0].total : 0
    }
  };

  res.json({ success: true, profile });
});

const updateAgentProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { section, data } = req.body;

  const agent = await Agent.findOne({ userId });
  if (!agent) {
    return res.status(404).json({ error: 'Agent profile not found' });
  }

  // Update specific section
  switch (section) {
    case 'personal_info':
      agent.personalInfo = { ...agent.personalInfo, ...data };
      break;
    case 'professional_info':
      agent.professionalInfo = { ...agent.professionalInfo, ...data };
      break;
    case 'expertise':
      agent.expertise = { ...agent.expertise, ...data };
      break;
    case 'territory':
      agent.territory = { ...agent.territory, ...data };
      break;
    case 'communication':
      agent.communication = { ...agent.communication, ...data };
      break;
    case 'banking':
      agent.banking = { ...agent.banking, ...data };
      break;
    default:
      return res.status(400).json({ error: 'Invalid section' });
  }

  agent.lastActivity = new Date();
  await agent.save();

  // Log activity
  await new AgentActivity({
    agentId: agent._id,
    activity: {
      type: 'profile_update',
      subType: section,
      description: `Updated ${section} section`,
      category: 'administrative'
    },
    context: {
      source: 'web',
      platform: 'web_app'
    },
    outcome: {
      status: 'success',
      result: `${section} updated successfully`
    }
  }).save();

  res.json({ success: true, agent });
});

const verifyAgent = asyncHandler(async (req, res) => {
  const { agentId, verificationType, status, documents } = req.body;
  const verifyingUserId = req.user.id;

  const agent = await Agent.findById(agentId);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const verificationData = {
    status,
    verifiedAt: status === 'verified' ? new Date() : null,
    verifiedBy: status === 'verified' ? verifyingUserId : null,
    documents: documents || agent.verification[verificationType].documents
  };

  agent.verification[verificationType] = {
    ...agent.verification[verificationType],
    ...verificationData
  };

  // Check if all verifications are complete
  const allVerified = Object.values(agent.verification).every(v => v.status === 'verified');
  if (allVerified && agent.status === 'under_review') {
    agent.status = 'approved';
  }

  await agent.save();

  // Log activity
  await new AgentActivity({
    agentId: agent._id,
    activity: {
      type: 'verification_update',
      subType: verificationType,
      description: `${verificationType} verification ${status}`,
      category: 'administrative'
    },
    context: {
      source: 'web',
      platform: 'web_app'
    },
    outcome: {
      status: 'success',
      result: `${verificationType} verification ${status}`
    }
  }).save();

  res.json({ success: true, agent });
});

const getAgentDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { period = 'month' } = req.query;

  const agent = await Agent.findOne({ userId });
  if (!agent) {
    return res.status(404).json({ error: 'Agent profile not found' });
  }

  // Calculate date range
  const now = new Date();
  let startDate;
  switch (period) {
    case 'week':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'quarter':
      startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  // Get dashboard metrics
  const [
    availableLeads,
    activeLeads,
    closedDeals,
    totalCommissions,
    recentActivities,
    pendingCommissions
  ] = await Promise.all([
    AgentLead.countDocuments({
      'assignment.assignedAgents.agentId': agent._id,
      'assignment.assignedAgents.status': 'offered',
      status: 'assigned'
    }),
    AgentLead.countDocuments({
      'assignment.activeAgent': agent._id,
      status: { $in: ['accepted', 'in_progress', 'quoted', 'negotiating'] }
    }),
    AgentLead.countDocuments({
      'assignment.activeAgent': agent._id,
      status: 'closed_won',
      closedAt: { $gte: startDate }
    }),
    AgentCommission.aggregate([
      {
        $match: {
          agentId: agent._id,
          status: 'paid',
          'lifecycle.paidAt': { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$financial.netAmount' },
          count: { $sum: 1 }
        }
      }
    ]),
    AgentActivity.find({
      agentId: agent._id,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }).sort({ createdAt: -1 }).limit(10),
    AgentCommission.aggregate([
      {
        $match: {
          agentId: agent._id,
          status: { $in: ['calculated', 'pending_approval', 'approved'] }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$financial.netAmount' },
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  const dashboard = {
    agent: {
      name: agent.fullName,
      tier: agent.performance.tier,
      rating: agent.performance.rating.average,
      status: agent.status
    },
    metrics: {
      availableLeads,
      activeLeads,
      closedDeals,
      totalCommissions: totalCommissions.length > 0 ? totalCommissions[0].total : 0,
      pendingCommissions: pendingCommissions.length > 0 ? pendingCommissions[0].total : 0,
      conversionRate: agent.performance.stats.conversionRate,
      responseTime: agent.performance.stats.averageResponseTime
    },
    activities: recentActivities,
    period: {
      type: period,
      startDate,
      endDate: now
    }
  };

  res.json({ success: true, dashboard });
});

const getAvailableLeads = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 20, category, urgency, sort = 'createdAt' } = req.query;

  const agent = await Agent.findOne({ userId });
  if (!agent) {
    return res.status(404).json({ error: 'Agent profile not found' });
  }

  // Build query based on agent's territory and expertise
  let query = {
    'assignment.assignedAgents.agentId': agent._id,
    'assignment.assignedAgents.status': 'offered',
    status: 'assigned'
  };

  if (category) {
    query['leadInfo.category'] = category;
  }

  if (urgency) {
    query['leadInfo.urgency'] = urgency;
  }

  const leads = await AgentLead.find(query)
    .populate('leadInfo.category', 'name')
    .populate('buyer.userId', 'profile.firstName profile.lastName')
    .populate('buyer.company', 'name')
    .sort({ [sort]: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await AgentLead.countDocuments(query);

  res.json({
    success: true,
    leads,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

const acceptLead = asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  const userId = req.user.id;

  const agent = await Agent.findOne({ userId });
  if (!agent) {
    return res.status(404).json({ error: 'Agent profile not found' });
  }

  const lead = await AgentLead.findById(leadId);
  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  // Check if agent is assigned to this lead
  const assignment = lead.assignment.assignedAgents.find(
    a => a.agentId.toString() === agent._id.toString() && a.status === 'offered'
  );

  if (!assignment) {
    return res.status(403).json({ error: 'Lead not available for acceptance' });
  }

  // Check if offer hasn't expired
  if (assignment.offerExpiresAt && new Date() > assignment.offerExpiresAt) {
    return res.status(400).json({ error: 'Lead offer has expired' });
  }

  // Accept the lead
  assignment.status = 'accepted';
  assignment.response = {
    respondedAt: new Date(),
    responseTime: Math.floor((new Date() - assignment.assignedAt) / (1000 * 60))
  };

  lead.assignment.activeAgent = agent._id;
  lead.assignment.acceptedAt = new Date();
  lead.assignment.protectedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  lead.status = 'accepted';

  await lead.save();

  // Update agent stats
  agent.performance.stats.acceptedLeads += 1;
  agent.lastActivity = new Date();
  await agent.save();

  // Log activity
  await new AgentActivity({
    agentId: agent._id,
    activity: {
      type: 'lead_accept',
      description: `Accepted lead: ${lead.leadInfo.title}`,
      category: 'lead_management'
    },
    relatedEntities: {
      leadId: lead._id,
      buyerId: lead.buyer.userId
    },
    context: {
      source: 'web',
      platform: 'web_app'
    },
    outcome: {
      status: 'success',
      result: 'Lead accepted successfully'
    }
  }).save();

  res.json({ success: true, lead });
});

const declineLead = asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;

  const agent = await Agent.findOne({ userId });
  if (!agent) {
    return res.status(404).json({ error: 'Agent profile not found' });
  }

  const lead = await AgentLead.findById(leadId);
  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  // Find and update the assignment
  const assignment = lead.assignment.assignedAgents.find(
    a => a.agentId.toString() === agent._id.toString() && a.status === 'offered'
  );

  if (!assignment) {
    return res.status(403).json({ error: 'Lead not available for decline' });
  }

  assignment.status = 'declined';
  assignment.response = {
    respondedAt: new Date(),
    responseTime: Math.floor((new Date() - assignment.assignedAt) / (1000 * 60)),
    declineReason: reason
  };

  await lead.save();

  // Log activity
  await new AgentActivity({
    agentId: agent._id,
    activity: {
      type: 'lead_decline',
      description: `Declined lead: ${lead.leadInfo.title}`,
      category: 'lead_management'
    },
    relatedEntities: {
      leadId: lead._id,
      buyerId: lead.buyer.userId
    },
    context: {
      source: 'web',
      platform: 'web_app'
    },
    outcome: {
      status: 'success',
      result: `Lead declined: ${reason}`
    }
  }).save();

  res.json({ success: true, message: 'Lead declined successfully' });
});

const getAgentCommissions = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { 
    page = 1, 
    limit = 20, 
    status, 
    type, 
    startDate, 
    endDate 
  } = req.query;

  const agent = await Agent.findOne({ userId });
  if (!agent) {
    return res.status(404).json({ error: 'Agent profile not found' });
  }

  let query = { agentId: agent._id };

  if (status) {
    query.status = status;
  }

  if (type) {
    query.type = type;
  }

  if (startDate && endDate) {
    query.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  const commissions = await AgentCommission.find(query)
    .populate('relatedEntities.leadId', 'leadNumber leadInfo.title')
    .populate('relatedEntities.orderId', 'orderNumber')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await AgentCommission.countDocuments(query);

  // Calculate summary
  const summary = await AgentCommission.aggregate([
    { $match: { agentId: agent._id } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$financial.netAmount' }
      }
    }
  ]);

  res.json({
    success: true,
    commissions,
    summary,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

module.exports = {
  agentOnboarding,
  getAgentProfile,
  updateAgentProfile,
  verifyAgent,
  getAgentDashboard,
  getAvailableLeads,
  acceptLead,
  declineLead,
  getAgentCommissions
};