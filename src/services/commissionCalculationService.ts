const Agent = require('../models/Agent');
const AgentCommission = require('../models/AgentCommission');
const AgentLead = require('../models/AgentLead');
const Order = require('../models/Order');
const mongoose = require('mongoose');
const agentWebSocketService = require('./websocket/agentWebSocketService');

class CommissionCalculationService {
  /**
   * Calculate commission for a completed deal
   */
  async calculateCommission(dealData) {
    try {
      const { agentId, leadId, orderId, dealValue, currency = 'USD' } = dealData;
      
      const agent = await Agent.findById(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      const lead = leadId ? await AgentLead.findById(leadId) : null;
      const order = orderId ? await Order.findById(orderId) : null;

      // Calculate base commission
      const baseCommission = await this.calculateBaseCommission(agent, dealValue);
      
      // Calculate tier bonus
      const tierBonus = await this.calculateTierBonus(agent, baseCommission);
      
      // Calculate special bonuses
      const specialBonuses = await this.calculateSpecialBonuses(agent, lead, order, dealValue);
      
      // Calculate penalties (if any)
      const penalties = await this.calculatePenalties(agent, lead, order);
      
      // Create commission record
      const commission = new AgentCommission({
        agentId: agent._id,
        type: 'base_commission',
        source: {
          type: orderId ? 'order' : 'deal',
          sourceId: orderId || leadId,
          sourceModel: orderId ? 'Order' : 'AgentLead',
          referenceNumber: order?.orderNumber || lead?.leadNumber,
          description: `Commission for ${order?.orderNumber || lead?.leadInfo.title}`
        },
        relatedEntities: {
          leadId: leadId,
          orderId: orderId,
          buyerId: lead?.buyer.userId,
          buyerCompanyId: lead?.buyer.company,
          supplierId: order?.supplier
        },
        financial: {
          dealValue: {
            amount: dealValue,
            currency: currency
          },
          commission: {
            rate: agent.commission.baseRate.percentage,
            baseAmount: baseCommission.amount,
            bonusAmount: tierBonus.amount + specialBonuses.totalAmount,
            penaltyAmount: penalties.totalAmount,
            totalAmount: baseCommission.amount + tierBonus.amount + specialBonuses.totalAmount - penalties.totalAmount,
            currency: currency
          },
          netAmount: baseCommission.amount + tierBonus.amount + specialBonuses.totalAmount - penalties.totalAmount
        },
        calculation: {
          method: agent.commission.structure,
          tier: {
            current: agent.performance.tier,
            multiplier: this.getTierMultiplier(agent.performance.tier),
            bonusEarned: tierBonus.amount
          },
          breakdown: {
            baseCalculation: `${dealValue} × ${agent.commission.baseRate.percentage}% = ${baseCommission.amount}`,
            bonusCalculation: this.formatBonusCalculation(tierBonus, specialBonuses),
            adjustmentCalculation: penalties.totalAmount > 0 ? `Penalties: -${penalties.totalAmount}` : 'No penalties',
            finalCalculation: `${baseCommission.amount} + ${tierBonus.amount + specialBonuses.totalAmount} - ${penalties.totalAmount} = ${baseCommission.amount + tierBonus.amount + specialBonuses.totalAmount - penalties.totalAmount}`
          }
        },
        status: this.requiresApproval(agent, baseCommission.amount + tierBonus.amount + specialBonuses.totalAmount) ? 'pending_approval' : 'approved'
      });

      await commission.save();

      // Create additional commission records for bonuses
      const bonusCommissions = await this.createBonusCommissions(agent, specialBonuses, commission._id, dealData);

      // Set up recurring commission if enabled
      if (agent.commission.recurringCommission.enabled) {
        await this.setupRecurringCommission(agent, commission, dealData);
      }

      // Update agent performance stats
      await this.updateAgentStats(agent, dealValue, commission.financial.netAmount);
      
      // Send real-time notification to agent
      await agentWebSocketService.notifyCommissionUpdate(agent._id.toString(), commission);

      return {
        primaryCommission: commission,
        bonusCommissions: bonusCommissions,
        totalAmount: commission.financial.netAmount + bonusCommissions.reduce((sum, bonus) => sum + bonus.financial.netAmount, 0)
      };
    } catch (error) {
      throw new Error(`Commission calculation failed: ${error.message}`);
    }
  }

  /**
   * Calculate base commission amount
   */
  async calculateBaseCommission(agent, dealValue) {
    const commissionStructure = agent.commission.structure;
    let amount = 0;

    switch (commissionStructure) {
      case 'percentage':
        amount = dealValue * (agent.commission.baseRate.percentage / 100);
        break;
      case 'fixed':
        amount = agent.commission.baseRate.fixedAmount;
        break;
      case 'hybrid':
        const percentageAmount = dealValue * (agent.commission.baseRate.percentage / 100);
        const fixedAmount = agent.commission.baseRate.fixedAmount;
        amount = Math.max(percentageAmount, fixedAmount);
        break;
      default:
        amount = dealValue * (agent.commission.baseRate.percentage / 100);
    }

    return {
      amount: Math.round(amount * 100) / 100,
      method: commissionStructure,
      rate: agent.commission.baseRate.percentage,
      fixedAmount: agent.commission.baseRate.fixedAmount
    };
  }

  /**
   * Calculate tier bonus
   */
  async calculateTierBonus(agent, baseCommission) {
    const tier = agent.performance.tier;
    const tierBonuses = agent.commission.tierBonuses;
    
    let bonusPercentage = 0;
    switch (tier) {
      case 'silver':
        bonusPercentage = tierBonuses.silver;
        break;
      case 'gold':
        bonusPercentage = tierBonuses.gold;
        break;
      case 'platinum':
        bonusPercentage = tierBonuses.platinum;
        break;
      default:
        bonusPercentage = 0;
    }

    const amount = baseCommission.amount * (bonusPercentage / 100);
    
    return {
      amount: Math.round(amount * 100) / 100,
      percentage: bonusPercentage,
      tier: tier
    };
  }

  /**
   * Calculate special bonuses
   */
  async calculateSpecialBonuses(agent, lead, order, dealValue) {
    const bonuses = [];
    const specialBonuses = agent.commission.specialBonuses;

    // New supplier bonus
    if (lead && await this.isNewSupplier(lead)) {
      bonuses.push({
        type: 'new_supplier_bonus',
        amount: specialBonuses.newSupplier,
        reason: 'First deal with new supplier'
      });
    }

    // New buyer bonus
    if (lead && await this.isNewBuyer(lead)) {
      bonuses.push({
        type: 'new_buyer_bonus',
        amount: specialBonuses.newBuyer,
        reason: 'First deal with new buyer'
      });
    }

    // First deal bonus (agent's first successful deal)
    if (await this.isAgentFirstDeal(agent)) {
      bonuses.push({
        type: 'first_deal_bonus',
        amount: specialBonuses.firstDeal,
        reason: 'Agent\'s first successful deal'
      });
    }

    // High-value deal bonus
    if (dealValue > 100000) {
      bonuses.push({
        type: 'high_value_bonus',
        amount: dealValue * 0.001, // 0.1% of deal value
        reason: 'High-value deal bonus'
      });
    }

    // Quick closure bonus (closed within 48 hours)
    if (lead && await this.isQuickClosure(lead)) {
      bonuses.push({
        type: 'quick_closure_bonus',
        amount: dealValue * 0.0005, // 0.05% of deal value
        reason: 'Quick closure bonus'
      });
    }

    // Check monthly target bonus
    const monthlyTargetBonus = await this.checkMonthlyTargetBonus(agent, dealValue);
    if (monthlyTargetBonus.eligible) {
      bonuses.push({
        type: 'monthly_target_bonus',
        amount: monthlyTargetBonus.amount,
        reason: 'Monthly target achieved'
      });
    }

    const totalAmount = bonuses.reduce((sum, bonus) => sum + bonus.amount, 0);

    return {
      bonuses: bonuses,
      totalAmount: Math.round(totalAmount * 100) / 100
    };
  }

  /**
   * Calculate penalties
   */
  async calculatePenalties(agent, lead, order) {
    const penalties = [];

    // Late response penalty
    if (lead && await this.hasLateResponse(lead, agent)) {
      penalties.push({
        type: 'late_response_penalty',
        amount: 50,
        reason: 'Late response to lead'
      });
    }

    // Quality penalty
    if (lead && await this.hasQualityIssues(lead, agent)) {
      penalties.push({
        type: 'quality_penalty',
        amount: 100,
        reason: 'Quality issues reported'
      });
    }

    // Compliance penalty
    if (await this.hasComplianceIssues(agent)) {
      penalties.push({
        type: 'compliance_penalty',
        amount: 200,
        reason: 'Compliance issues'
      });
    }

    const totalAmount = penalties.reduce((sum, penalty) => sum + penalty.amount, 0);

    return {
      penalties: penalties,
      totalAmount: Math.round(totalAmount * 100) / 100
    };
  }

  /**
   * Create bonus commission records
   */
  async createBonusCommissions(agent, specialBonuses, parentCommissionId, dealData) {
    const bonusCommissions = [];

    for (const bonus of specialBonuses.bonuses) {
      const bonusCommission = new AgentCommission({
        agentId: agent._id,
        type: bonus.type,
        source: {
          type: 'bonus',
          sourceId: parentCommissionId,
          sourceModel: 'AgentCommission',
          description: bonus.reason
        },
        relatedEntities: {
          leadId: dealData.leadId,
          orderId: dealData.orderId,
          parentCommissionId: parentCommissionId
        },
        financial: {
          dealValue: {
            amount: dealData.dealValue,
            currency: dealData.currency || 'USD'
          },
          commission: {
            rate: 0,
            baseAmount: 0,
            bonusAmount: bonus.amount,
            penaltyAmount: 0,
            totalAmount: bonus.amount,
            currency: dealData.currency || 'USD'
          },
          netAmount: bonus.amount
        },
        calculation: {
          method: 'fixed_amount',
          breakdown: {
            baseCalculation: bonus.reason,
            bonusCalculation: `Fixed bonus: ${bonus.amount}`,
            finalCalculation: `${bonus.amount}`
          }
        },
        status: 'approved'
      });

      await bonusCommission.save();
      bonusCommissions.push(bonusCommission);
    }

    return bonusCommissions;
  }

  /**
   * Setup recurring commission
   */
  async setupRecurringCommission(agent, originalCommission, dealData) {
    const recurringSettings = agent.commission.recurringCommission;
    const recurringRate = recurringSettings.rate;
    const duration = recurringSettings.duration; // months

    for (let month = 1; month <= duration; month++) {
      const recurringCommission = new AgentCommission({
        agentId: agent._id,
        type: 'recurring_commission',
        source: {
          type: 'recurring',
          sourceId: originalCommission._id,
          sourceModel: 'AgentCommission',
          description: `Month ${month} recurring commission`
        },
        relatedEntities: {
          leadId: dealData.leadId,
          orderId: dealData.orderId,
          parentCommissionId: originalCommission._id
        },
        financial: {
          dealValue: {
            amount: dealData.dealValue,
            currency: dealData.currency || 'USD'
          },
          commission: {
            rate: recurringRate,
            baseAmount: dealData.dealValue * (recurringRate / 100),
            bonusAmount: 0,
            penaltyAmount: 0,
            totalAmount: dealData.dealValue * (recurringRate / 100),
            currency: dealData.currency || 'USD'
          },
          netAmount: dealData.dealValue * (recurringRate / 100)
        },
        calculation: {
          method: 'percentage',
          recurring: {
            isRecurring: true,
            frequency: 'monthly',
            remainingPayments: duration - month,
            originalAmount: originalCommission.financial.netAmount,
            nextPaymentDate: new Date(Date.now() + month * 30 * 24 * 60 * 60 * 1000)
          },
          breakdown: {
            baseCalculation: `${dealData.dealValue} × ${recurringRate}% = ${dealData.dealValue * (recurringRate / 100)}`,
            finalCalculation: `${dealData.dealValue * (recurringRate / 100)}`
          }
        },
        status: 'approved',
        lifecycle: {
          calculatedAt: new Date()
        },
        payment: {
          schedule: {
            scheduledDate: new Date(Date.now() + month * 30 * 24 * 60 * 60 * 1000),
            paymentCycle: 'monthly'
          }
        }
      });

      await recurringCommission.save();
    }
  }

  /**
   * Update agent performance statistics
   */
  async updateAgentStats(agent, dealValue, commissionAmount) {
    agent.performance.stats.closedDeals += 1;
    agent.performance.stats.totalRevenue += dealValue;
    agent.performance.stats.conversionRate = (agent.performance.stats.closedDeals / agent.performance.stats.acceptedLeads) * 100;

    // Update tier based on performance
    const newTier = await this.calculateAgentTier(agent);
    if (newTier !== agent.performance.tier) {
      agent.performance.tier = newTier;
    }

    await agent.save();
  }

  /**
   * Calculate agent tier based on performance
   */
  async calculateAgentTier(agent) {
    const stats = agent.performance.stats;
    const rating = agent.performance.rating.average;
    
    // Tier criteria
    const criteria = {
      platinum: {
        closedDeals: 50,
        totalRevenue: 500000,
        conversionRate: 70,
        rating: 4.5
      },
      gold: {
        closedDeals: 25,
        totalRevenue: 250000,
        conversionRate: 60,
        rating: 4.0
      },
      silver: {
        closedDeals: 10,
        totalRevenue: 100000,
        conversionRate: 50,
        rating: 3.5
      },
      bronze: {
        closedDeals: 0,
        totalRevenue: 0,
        conversionRate: 0,
        rating: 0
      }
    };

    // Check from highest to lowest tier
    for (const [tier, requirements] of Object.entries(criteria)) {
      if (tier === 'bronze') return 'bronze';
      
      if (stats.closedDeals >= requirements.closedDeals &&
          stats.totalRevenue >= requirements.totalRevenue &&
          stats.conversionRate >= requirements.conversionRate &&
          rating >= requirements.rating) {
        return tier;
      }
    }

    return 'bronze';
  }

  /**
   * Helper methods
   */
  getTierMultiplier(tier) {
    const multipliers = {
      bronze: 1.0,
      silver: 1.2,
      gold: 1.5,
      platinum: 2.0
    };
    return multipliers[tier] || 1.0;
  }

  formatBonusCalculation(tierBonus, specialBonuses) {
    let calculation = '';
    
    if (tierBonus.amount > 0) {
      calculation += `Tier bonus (${tierBonus.tier}): +${tierBonus.amount}`;
    }
    
    if (specialBonuses.bonuses.length > 0) {
      const bonusDescriptions = specialBonuses.bonuses.map(bonus => 
        `${bonus.type}: +${bonus.amount}`
      ).join(', ');
      
      if (calculation) calculation += ', ';
      calculation += bonusDescriptions;
    }
    
    return calculation || 'No bonuses';
  }

  requiresApproval(agent, amount) {
    const threshold = agent.commission.approval?.threshold || 1000;
    return amount > threshold;
  }

  async isNewSupplier(lead) {
    // Check if this is the first deal with the supplier
    const previousDeals = await AgentLead.countDocuments({
      'suppliers.supplierId': { $in: lead.suppliers.map(s => s.supplierId) },
      status: 'closed_won',
      _id: { $ne: lead._id }
    });
    
    return previousDeals === 0;
  }

  async isNewBuyer(lead) {
    // Check if this is the first deal with the buyer
    const previousDeals = await AgentLead.countDocuments({
      'buyer.company': lead.buyer.company,
      status: 'closed_won',
      _id: { $ne: lead._id }
    });
    
    return previousDeals === 0;
  }

  async isAgentFirstDeal(agent) {
    const previousDeals = await AgentLead.countDocuments({
      'assignment.activeAgent': agent._id,
      status: 'closed_won'
    });
    
    return previousDeals === 1; // This is the first deal
  }

  async isQuickClosure(lead) {
    const acceptedAt = new Date(lead.assignment.acceptedAt);
    const closedAt = new Date(lead.closedAt);
    const hoursToClose = (closedAt - acceptedAt) / (1000 * 60 * 60);
    
    return hoursToClose <= 48;
  }

  async checkMonthlyTargetBonus(agent, dealValue) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const monthlyRevenue = await AgentLead.aggregate([
      {
        $match: {
          'assignment.activeAgent': agent._id,
          status: 'closed_won',
          closedAt: {
            $gte: startOfMonth,
            $lte: endOfMonth
          }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$financial.dealValue.amount' }
        }
      }
    ]);
    
    const currentMonthRevenue = monthlyRevenue.length > 0 ? monthlyRevenue[0].totalRevenue : 0;
    const targetRevenue = 50000; // Monthly target
    
    if (currentMonthRevenue >= targetRevenue) {
      return {
        eligible: true,
        amount: agent.commission.specialBonuses.monthlyTarget
      };
    }
    
    return {
      eligible: false,
      amount: 0
    };
  }

  async hasLateResponse(lead, agent) {
    const assignment = lead.assignment.assignedAgents.find(
      a => a.agentId.toString() === agent._id.toString()
    );
    
    if (!assignment) return false;
    
    const responseTime = assignment.response?.responseTime || 0;
    return responseTime > 120; // More than 2 hours
  }

  async hasQualityIssues(lead, agent) {
    // Check if there are any quality issues reported
    return lead.feedback?.buyerFeedback?.rating < 3;
  }

  async hasComplianceIssues(agent) {
    // Check if agent has any compliance issues
    return agent.internal?.riskLevel === 'high';
  }
}

module.exports = new CommissionCalculationService();