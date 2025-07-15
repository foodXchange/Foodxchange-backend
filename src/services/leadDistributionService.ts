const Agent = require('../models/Agent');
const AgentLead = require('../models/AgentLead');
const AgentActivity = require('../models/AgentActivity');
const RFQ = require('../models/RFQ');
const SampleRequest = require('../models/SampleRequest');
const mongoose = require('mongoose');
const agentWebSocketService = require('./websocket/agentWebSocketService');

class LeadDistributionService {
  /**
   * Create a new agent lead from an RFQ
   */
  async createLeadFromRFQ(rfq) {
    try {
      const lead = new AgentLead({
        source: {
          type: 'rfq',
          sourceId: rfq._id,
          sourceModel: 'RFQ'
        },
        leadInfo: {
          title: rfq.title,
          description: rfq.description,
          category: rfq.category,
          urgency: this.calculateUrgency(rfq),
          estimatedValue: {
            amount: rfq.requirements.budgetRange?.max || rfq.requirements.targetPrice?.amount || 0,
            currency: rfq.requirements.budgetRange?.currency || rfq.requirements.targetPrice?.currency || 'USD'
          },
          requirements: {
            quantity: rfq.requirements.quantity,
            unit: rfq.requirements.unit,
            specifications: rfq.specifications.map(spec => spec.attribute),
            deliveryDate: rfq.requirements.deliveryDate,
            deliveryLocation: {
              city: rfq.requirements.deliveryLocation.city,
              state: rfq.requirements.deliveryLocation.state,
              country: rfq.requirements.deliveryLocation.country,
              coordinates: rfq.requirements.deliveryLocation.coordinates
            }
          }
        },
        buyer: {
          userId: rfq.buyer,
          company: rfq.buyerCompany,
          contact: {
            name: rfq.buyerName,
            email: rfq.buyerEmail,
            phone: rfq.buyerPhone
          }
        },
        assignment: {
          method: 'auto_match'
        },
        scoring: {
          leadScore: this.calculateLeadScore(rfq),
          qualityScore: this.calculateQualityScore(rfq),
          urgencyScore: this.calculateUrgencyScore(rfq),
          valueScore: this.calculateValueScore(rfq)
        },
        deadlines: {
          responseDeadline: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours
          proposalDeadline: rfq.deadlineDate,
          decisionDeadline: rfq.requirements.deliveryDate
        }
      });

      await lead.save();
      return lead;
    } catch (error) {
      throw new Error(`Failed to create lead from RFQ: ${error.message}`);
    }
  }

  /**
   * Match agents to a lead using smart routing algorithm
   */
  async matchAgentsToLead(leadId, maxAgents = 5) {
    try {
      const lead = await AgentLead.findById(leadId);
      if (!lead) {
        throw new Error('Lead not found');
      }

      // Get eligible agents
      const eligibleAgents = await this.findEligibleAgents(lead);
      
      // Score and rank agents
      const scoredAgents = await this.scoreAgents(eligibleAgents, lead);
      
      // Select top agents
      const selectedAgents = scoredAgents.slice(0, maxAgents);
      
      // Assign agents to lead
      await this.assignAgentsToLead(lead, selectedAgents);
      
      return selectedAgents;
    } catch (error) {
      throw new Error(`Failed to match agents to lead: ${error.message}`);
    }
  }

  /**
   * Find eligible agents based on territory, expertise, and availability
   */
  async findEligibleAgents(lead) {
    const query = {
      status: 'active',
      'verification.identity.status': 'verified',
      'verification.business.status': 'verified',
      $or: [
        // Geographic territory match
        {
          'territory.type': { $in: ['geographic', 'hybrid'] },
          'territory.geographic.countries': lead.leadInfo.requirements.deliveryLocation.country
        },
        // Category territory match
        {
          'territory.type': { $in: ['category', 'hybrid'] },
          'territory.categories': lead.leadInfo.category
        },
        // Expertise match
        {
          'expertise.categories': lead.leadInfo.category
        }
      ]
    };

    // Add location-based filtering if coordinates are available
    if (lead.leadInfo.requirements.deliveryLocation.coordinates) {
      query.$or.push({
        'territory.geographic.radius.center': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [
                lead.leadInfo.requirements.deliveryLocation.coordinates.lng,
                lead.leadInfo.requirements.deliveryLocation.coordinates.lat
              ]
            },
            $maxDistance: 100000 // 100km default radius
          }
        }
      });
    }

    const agents = await Agent.find(query)
      .populate('expertise.categories')
      .populate('territory.categories');

    // Filter out agents who are overloaded or inactive
    const filteredAgents = agents.filter(agent => {
      // Check if agent is currently active (logged in recently)
      const lastActivity = new Date(agent.lastActivity);
      const hoursSinceActivity = (Date.now() - lastActivity) / (1000 * 60 * 60);
      
      if (hoursSinceActivity > 48) return false; // Not active in last 48 hours
      
      // Check current workload
      const currentLeads = agent.performance.stats.acceptedLeads - agent.performance.stats.closedDeals;
      const maxLeads = this.getMaxLeadsForTier(agent.performance.tier);
      
      return currentLeads < maxLeads;
    });

    return filteredAgents;
  }

  /**
   * Score agents based on match quality and performance
   */
  async scoreAgents(agents, lead) {
    const scoredAgents = await Promise.all(agents.map(async (agent) => {
      const score = await this.calculateAgentScore(agent, lead);
      return {
        agent,
        score,
        matchReasons: this.getMatchReasons(agent, lead)
      };
    }));

    return scoredAgents.sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate comprehensive agent score for a lead
   */
  async calculateAgentScore(agent, lead) {
    let score = 0;
    const weights = {
      expertise: 0.25,
      territory: 0.20,
      performance: 0.20,
      availability: 0.15,
      experience: 0.10,
      responseTime: 0.10
    };

    // Expertise match score
    const expertiseScore = this.calculateExpertiseScore(agent, lead);
    score += expertiseScore * weights.expertise;

    // Territory match score
    const territoryScore = this.calculateTerritoryScore(agent, lead);
    score += territoryScore * weights.territory;

    // Performance score
    const performanceScore = this.calculatePerformanceScore(agent);
    score += performanceScore * weights.performance;

    // Availability score
    const availabilityScore = this.calculateAvailabilityScore(agent);
    score += availabilityScore * weights.availability;

    // Experience score
    const experienceScore = this.calculateExperienceScore(agent, lead);
    score += experienceScore * weights.experience;

    // Response time score
    const responseTimeScore = this.calculateResponseTimeScore(agent);
    score += responseTimeScore * weights.responseTime;

    return Math.round(score * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Calculate expertise match score
   */
  calculateExpertiseScore(agent, lead) {
    let score = 0;
    
    // Category match
    const categoryMatch = agent.expertise.categories.some(cat => 
      cat._id.toString() === lead.leadInfo.category.toString()
    );
    if (categoryMatch) score += 40;

    // Specialization match
    const specs = agent.expertise.specializations || [];
    const leadValue = lead.leadInfo.estimatedValue.amount;
    
    // High-value leads get premium specialists
    if (leadValue > 50000 && specs.includes('premium')) score += 20;
    if (leadValue > 100000 && specs.includes('enterprise')) score += 30;

    // Certification match
    const certifications = agent.expertise.certifications || [];
    const activeCerts = certifications.filter(cert => 
      !cert.expiryDate || new Date(cert.expiryDate) > new Date()
    );
    score += Math.min(activeCerts.length * 5, 30);

    return Math.min(score, 100);
  }

  /**
   * Calculate territory match score
   */
  calculateTerritoryScore(agent, lead) {
    let score = 0;
    const territory = agent.territory;
    const deliveryLocation = lead.leadInfo.requirements.deliveryLocation;

    if (territory.type === 'geographic' || territory.type === 'hybrid') {
      // Country match
      if (territory.geographic.countries.includes(deliveryLocation.country)) {
        score += 30;
      }

      // State match
      if (territory.geographic.states.includes(deliveryLocation.state)) {
        score += 20;
      }

      // City match
      if (territory.geographic.cities.includes(deliveryLocation.city)) {
        score += 25;
      }

      // Radius match (if coordinates available)
      if (deliveryLocation.coordinates && territory.geographic.radius.center) {
        const distance = this.calculateDistance(
          territory.geographic.radius.center,
          deliveryLocation.coordinates
        );
        
        if (distance <= territory.geographic.radius.distance) {
          score += 25;
        }
      }
    }

    if (territory.type === 'category' || territory.type === 'hybrid') {
      const categoryMatch = territory.categories.some(cat => 
        cat._id.toString() === lead.leadInfo.category.toString()
      );
      if (categoryMatch) score += 40;
    }

    // Exclusivity bonus
    if (territory.exclusivity === 'exclusive') {
      score += 15;
    }

    return Math.min(score, 100);
  }

  /**
   * Calculate performance score
   */
  calculatePerformanceScore(agent) {
    const stats = agent.performance.stats;
    let score = 0;

    // Conversion rate (0-40 points)
    score += Math.min(stats.conversionRate * 0.4, 40);

    // Customer satisfaction (0-25 points)
    score += (stats.customerSatisfaction / 5) * 25;

    // Rating (0-20 points)
    score += (agent.performance.rating.average / 5) * 20;

    // Tier bonus (0-15 points)
    const tierBonus = {
      bronze: 0,
      silver: 5,
      gold: 10,
      platinum: 15
    };
    score += tierBonus[agent.performance.tier] || 0;

    return Math.min(score, 100);
  }

  /**
   * Calculate availability score
   */
  calculateAvailabilityScore(agent) {
    const stats = agent.performance.stats;
    const maxLeads = this.getMaxLeadsForTier(agent.performance.tier);
    const currentLeads = stats.acceptedLeads - stats.closedDeals;
    
    // Availability percentage
    const availabilityPercent = ((maxLeads - currentLeads) / maxLeads) * 100;
    
    // Recent activity bonus
    const lastActivity = new Date(agent.lastActivity);
    const hoursSinceActivity = (Date.now() - lastActivity) / (1000 * 60 * 60);
    
    let activityScore = 0;
    if (hoursSinceActivity < 2) activityScore = 20;
    else if (hoursSinceActivity < 8) activityScore = 15;
    else if (hoursSinceActivity < 24) activityScore = 10;
    else activityScore = 5;

    return Math.min(availabilityPercent * 0.8 + activityScore, 100);
  }

  /**
   * Calculate experience score
   */
  calculateExperienceScore(agent, lead) {
    let score = 0;
    
    // Years of experience
    const experience = agent.professionalInfo.yearsOfExperience || 0;
    score += Math.min(experience * 5, 40);

    // Industry experience
    const industryExp = agent.expertise.industryExperience || [];
    const relevantExp = industryExp.find(exp => 
      exp.industry.toLowerCase().includes('food') || 
      exp.industry.toLowerCase().includes('agriculture')
    );
    
    if (relevantExp) {
      score += Math.min(relevantExp.years * 3, 30);
    }

    // Previous success with similar leads
    const similarLeadsScore = Math.min(agent.performance.stats.closedDeals * 0.5, 30);
    score += similarLeadsScore;

    return Math.min(score, 100);
  }

  /**
   * Calculate response time score
   */
  calculateResponseTimeScore(agent) {
    const avgResponseTime = agent.performance.stats.averageResponseTime || 60;
    
    // Score based on response time (lower is better)
    let score = 0;
    if (avgResponseTime <= 15) score = 100;
    else if (avgResponseTime <= 30) score = 80;
    else if (avgResponseTime <= 60) score = 60;
    else if (avgResponseTime <= 120) score = 40;
    else score = 20;

    return score;
  }

  /**
   * Assign selected agents to lead
   */
  async assignAgentsToLead(lead, scoredAgents) {
    const assignments = scoredAgents.map((item, index) => ({
      agentId: item.agent._id,
      assignedAt: new Date(),
      priority: index === 0 ? 'primary' : index === 1 ? 'secondary' : 'backup',
      matchScore: item.score,
      matchReasons: item.matchReasons,
      offerExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      status: 'offered'
    }));

    lead.assignment.assignedAgents = assignments;
    lead.assignment.method = 'auto_match';
    lead.status = 'assigned';
    
    await lead.save();

    // Log activities for each assigned agent
    for (const assignment of assignments) {
      await new AgentActivity({
        agentId: assignment.agentId,
        activity: {
          type: 'lead_view',
          description: `New lead assigned: ${lead.leadInfo.title}`,
          category: 'lead_management'
        },
        relatedEntities: {
          leadId: lead._id,
          buyerId: lead.buyer.userId
        },
        context: {
          source: 'system',
          platform: 'api_call'
        },
        data: {
          leadInfo: {
            leadNumber: lead.leadNumber,
            leadTitle: lead.leadInfo.title,
            leadValue: lead.leadInfo.estimatedValue.amount,
            leadStatus: lead.status
          }
        },
        outcome: {
          status: 'success',
          result: 'Lead assigned successfully'
        }
      }).save();
    }
    
    // Send real-time notifications to matched agents
    await agentWebSocketService.notifyNewLead(lead, assignments);

    return assignments;
  }

  /**
   * Get match reasons for an agent-lead pair
   */
  getMatchReasons(agent, lead) {
    const reasons = [];

    // Expertise reasons
    const categoryMatch = agent.expertise.categories.some(cat => 
      cat._id.toString() === lead.leadInfo.category.toString()
    );
    if (categoryMatch) reasons.push('Category expertise match');

    // Territory reasons
    const territory = agent.territory;
    const deliveryLocation = lead.leadInfo.requirements.deliveryLocation;
    
    if (territory.geographic.countries.includes(deliveryLocation.country)) {
      reasons.push('Geographic territory match');
    }

    // Performance reasons
    if (agent.performance.tier === 'gold' || agent.performance.tier === 'platinum') {
      reasons.push('High-performing agent');
    }

    if (agent.performance.stats.conversionRate > 50) {
      reasons.push('High conversion rate');
    }

    // Availability reasons
    const lastActivity = new Date(agent.lastActivity);
    const hoursSinceActivity = (Date.now() - lastActivity) / (1000 * 60 * 60);
    
    if (hoursSinceActivity < 2) {
      reasons.push('Currently active');
    }

    return reasons;
  }

  /**
   * Helper methods
   */
  calculateUrgency(rfq) {
    const now = new Date();
    const deadline = new Date(rfq.deadlineDate);
    const deliveryDate = new Date(rfq.requirements.deliveryDate);
    
    const timeToDeadline = (deadline - now) / (1000 * 60 * 60 * 24); // days
    const timeToDelivery = (deliveryDate - now) / (1000 * 60 * 60 * 24); // days
    
    if (timeToDeadline <= 1 || timeToDelivery <= 7) return 'urgent';
    if (timeToDeadline <= 3 || timeToDelivery <= 14) return 'high';
    if (timeToDeadline <= 7 || timeToDelivery <= 30) return 'medium';
    return 'low';
  }

  calculateLeadScore(rfq) {
    let score = 50; // Base score
    
    // Value score
    const value = rfq.requirements.budgetRange?.max || rfq.requirements.targetPrice?.amount || 0;
    if (value > 100000) score += 20;
    else if (value > 50000) score += 15;
    else if (value > 10000) score += 10;
    else if (value > 5000) score += 5;
    
    // Completeness score
    if (rfq.requirements.targetPrice) score += 10;
    if (rfq.requirements.deliveryDate) score += 10;
    if (rfq.specifications && rfq.specifications.length > 0) score += 10;
    
    return Math.min(score, 100);
  }

  calculateQualityScore(rfq) {
    let score = 0;
    
    // Description quality
    if (rfq.description && rfq.description.length > 100) score += 20;
    
    // Specifications provided
    if (rfq.specifications && rfq.specifications.length > 0) {
      score += Math.min(rfq.specifications.length * 5, 30);
    }
    
    // Attachments provided
    if (rfq.attachments && rfq.attachments.length > 0) {
      score += Math.min(rfq.attachments.length * 10, 20);
    }
    
    // Complete delivery information
    if (rfq.requirements.deliveryLocation.address) score += 15;
    if (rfq.requirements.deliveryLocation.coordinates) score += 15;
    
    return Math.min(score, 100);
  }

  calculateUrgencyScore(rfq) {
    const urgency = this.calculateUrgency(rfq);
    const scores = {
      urgent: 100,
      high: 75,
      medium: 50,
      low: 25
    };
    return scores[urgency];
  }

  calculateValueScore(rfq) {
    const value = rfq.requirements.budgetRange?.max || rfq.requirements.targetPrice?.amount || 0;
    
    if (value >= 500000) return 100;
    if (value >= 100000) return 80;
    if (value >= 50000) return 60;
    if (value >= 10000) return 40;
    if (value >= 5000) return 20;
    return 10;
  }

  getMaxLeadsForTier(tier) {
    const limits = {
      bronze: 3,
      silver: 5,
      gold: 8,
      platinum: 12
    };
    return limits[tier] || 3;
  }

  calculateDistance(point1, point2) {
    const R = 6371; // Earth's radius in km
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLon = (point2.lng - point1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}

module.exports = new LeadDistributionService();