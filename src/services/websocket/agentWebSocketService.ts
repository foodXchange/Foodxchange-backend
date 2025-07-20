const jwt = require('jsonwebtoken');
const WebSocket = require('ws');

const Agent = require('../../models/Agent');
const AgentActivity = require('../../models/AgentActivity');
const whatsappService = require('../whatsappService');

class AgentWebSocketService {
  constructor() {
    this.agentConnections = new Map(); // agentId -> websocket connection
    this.leadRooms = new Map(); // leadId -> Set of agentIds
    this.userToAgent = new Map(); // userId -> agentId mapping
  }

  /**
   * Initialize agent websocket handlers
   */
  initialize(io) {
    this.io = io;

    // Agent namespace
    const agentNamespace = io.of('/agents');

    agentNamespace.use(async (socket, next) => {
      try {
        const {token} = socket.handshake.auth;
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

        // Verify user has agent role
        if (decoded.role !== 'agent') {
          return next(new Error('Not authorized as agent'));
        }

        // Get agent profile
        const agent = await Agent.findOne({ userId: decoded._id });
        if (!agent) {
          return next(new Error('Agent profile not found'));
        }

        socket.userId = decoded._id;
        socket.agentId = agent._id.toString();
        socket.agent = agent;

        next();
      } catch (err) {
        next(new Error('Authentication failed'));
      }
    });

    agentNamespace.on('connection', (socket) => {
      this.handleAgentConnection(socket);
    });

    console.log('🚀 Agent WebSocket service initialized');
  }

  /**
   * Handle agent connection
   */
  handleAgentConnection(socket) {
    const { agentId, agent } = socket;

    console.log(`🟢 Agent connected: ${agent.fullName} (${agentId})`);

    // Store connection
    this.agentConnections.set(agentId, socket);
    this.userToAgent.set(socket.userId, agentId);

    // Update agent status
    this.updateAgentStatus(agentId, 'online');

    // Join agent's personal room
    socket.join(`agent:${agentId}`);

    // Send initial data
    socket.emit('connected', {
      agentId,
      agent: {
        name: agent.fullName,
        tier: agent.performance.tier,
        status: agent.status
      },
      timestamp: new Date()
    });

    // Log activity
    this.logAgentActivity(agentId, 'login', {
      source: 'websocket',
      platform: 'web_app'
    });

    // Handle events
    this.setupAgentEventHandlers(socket);

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`🔴 Agent disconnected: ${agent.fullName} (${agentId})`);
      this.handleAgentDisconnection(agentId);
    });
  }

  /**
   * Setup agent event handlers
   */
  setupAgentEventHandlers(socket) {
    const { agentId } = socket;

    // Lead events
    socket.on('join_lead_room', (leadId) => {
      socket.join(`lead:${leadId}`);
      if (!this.leadRooms.has(leadId)) {
        this.leadRooms.set(leadId, new Set());
      }
      this.leadRooms.get(leadId).add(agentId);
      console.log(`Agent ${agentId} joined lead room: ${leadId}`);
    });

    socket.on('leave_lead_room', (leadId) => {
      socket.leave(`lead:${leadId}`);
      if (this.leadRooms.has(leadId)) {
        this.leadRooms.get(leadId).delete(agentId);
      }
    });

    // Lead acceptance/decline
    socket.on('lead_response', async (data) => {
      const { leadId, action, reason } = data;
      await this.handleLeadResponse(agentId, leadId, action, reason);
    });

    // Status updates
    socket.on('update_status', async (status) => {
      await this.updateAgentStatus(agentId, status);
    });

    // Location updates
    socket.on('location_update', async (location) => {
      await this.updateAgentLocation(agentId, location);
    });

    // Typing indicators
    socket.on('typing', (data) => {
      const { leadId, isTyping } = data;
      socket.to(`lead:${leadId}`).emit('agent_typing', {
        agentId,
        isTyping,
        timestamp: new Date()
      });
    });

    // Message sending
    socket.on('send_message', async (data) => {
      const { leadId, message, type } = data;
      await this.handleAgentMessage(agentId, leadId, message, type);
    });
  }

  /**
   * Handle agent disconnection
   */
  async handleAgentDisconnection(agentId) {
    // Remove from connections
    this.agentConnections.delete(agentId);

    // Remove from all lead rooms
    this.leadRooms.forEach((agents, leadId) => {
      agents.delete(agentId);
    });

    // Update status
    await this.updateAgentStatus(agentId, 'offline');

    // Log activity
    await this.logAgentActivity(agentId, 'logout', {
      source: 'websocket',
      platform: 'web_app'
    });
  }

  /**
   * Send notification to specific agent
   */
  sendToAgent(agentId, event, data) {
    const socket = this.agentConnections.get(agentId);
    if (socket) {
      socket.emit(event, {
        ...data,
        timestamp: new Date()
      });
      return true;
    }
    return false;
  }

  /**
   * Broadcast to all agents in a lead room
   */
  broadcastToLead(leadId, event, data, excludeAgentId = null) {
    const room = `lead:${leadId}`;
    const io = this.io.of('/agents');

    if (excludeAgentId) {
      io.to(room).except(`agent:${excludeAgentId}`).emit(event, data);
    } else {
      io.to(room).emit(event, data);
    }
  }

  /**
   * Send new lead notification to matched agents
   */
  async notifyNewLead(lead, matchedAgents) {
    for (const match of matchedAgents) {
      const agentId = match.agentId.toString();

      // Send real-time notification if connected
      const sent = this.sendToAgent(agentId, 'new_lead_available', {
        lead: {
          id: lead._id,
          leadNumber: lead.leadNumber,
          title: lead.leadInfo.title,
          urgency: lead.leadInfo.urgency,
          estimatedValue: lead.leadInfo.estimatedValue,
          location: lead.leadInfo.requirements.deliveryLocation.city,
          matchScore: match.matchScore,
          offerExpiresAt: match.offerExpiresAt,
          timeRemaining: match.offerExpiresAt - Date.now()
        }
      });

      if (sent) {
        console.log(`📬 New lead notification sent to agent ${agentId}`);
      }

      // Also send WhatsApp notification
      try {
        await whatsappService.notifyNewLead(agentId, lead);
        console.log(`📱 WhatsApp notification sent to agent ${agentId}`);
      } catch (error) {
        console.error(`WhatsApp notification failed for agent ${agentId}:`, error);
      }

      // Start countdown timer for lead offer
      this.startLeadOfferTimer(agentId, lead._id, match.offerExpiresAt);
    }
  }

  /**
   * Start countdown timer for lead offer
   */
  startLeadOfferTimer(agentId, leadId, expiresAt) {
    const intervalId = setInterval(() => {
      const timeRemaining = expiresAt - Date.now();

      if (timeRemaining <= 0) {
        clearInterval(intervalId);
        this.sendToAgent(agentId, 'lead_offer_expired', { leadId });
      } else {
        this.sendToAgent(agentId, 'lead_timer_update', {
          leadId,
          timeRemaining,
          expiresAt
        });
      }
    }, 10000); // Update every 10 seconds

    // Store interval ID for cleanup if needed
    if (!this.leadTimers) this.leadTimers = new Map();
    this.leadTimers.set(`${agentId}:${leadId}`, intervalId);
  }

  /**
   * Handle lead response (accept/decline)
   */
  async handleLeadResponse(agentId, leadId, action, reason) {
    // Clear timer
    if (this.leadTimers) {
      const timerId = this.leadTimers.get(`${agentId}:${leadId}`);
      if (timerId) {
        clearInterval(timerId);
        this.leadTimers.delete(`${agentId}:${leadId}`);
      }
    }

    // Notify other agents in the lead room
    this.broadcastToLead(leadId, 'lead_status_update', {
      leadId,
      agentId,
      action,
      timestamp: new Date()
    }, agentId);

    // Log activity
    await this.logAgentActivity(agentId, `lead_${action}`, {
      leadId,
      reason
    });
  }

  /**
   * Send commission update notification
   */
  async notifyCommissionUpdate(agentId, commission) {
    this.sendToAgent(agentId, 'commission_update', {
      commission: {
        id: commission._id,
        type: commission.type,
        amount: commission.financial.netAmount,
        status: commission.status,
        dealValue: commission.financial.dealValue.amount,
        leadNumber: commission.source.referenceNumber
      }
    });

    // Also send WhatsApp notification
    try {
      await whatsappService.notifyCommissionUpdate(agentId, commission);
      console.log(`📱 WhatsApp commission notification sent to agent ${agentId}`);
    } catch (error) {
      console.error(`WhatsApp commission notification failed for agent ${agentId}:`, error);
    }
  }

  /**
   * Send order status update
   */
  async notifyOrderUpdate(agentId, order, previousStatus) {
    this.sendToAgent(agentId, 'order_update', {
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        previousStatus,
        newStatus: order.status,
        commissionPaid: order.agentCommissionPaid
      }
    });
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(agentId, status) {
    try {
      await Agent.findByIdAndUpdate(agentId, {
        'performance.metrics.lastLoginAt': new Date(),
        lastActivity: new Date()
      });

      // Broadcast status to relevant parties
      this.io.emit('agent_status_update', {
        agentId,
        status,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error updating agent status:', error);
    }
  }

  /**
   * Update agent location
   */
  async updateAgentLocation(agentId, location) {
    try {
      // Log location activity
      await this.logAgentActivity(agentId, 'location_update', {
        location,
        source: 'websocket'
      });

      console.log(`📍 Agent ${agentId} location updated`);
    } catch (error) {
      console.error('Error updating agent location:', error);
    }
  }

  /**
   * Handle agent message
   */
  async handleAgentMessage(agentId, leadId, message, type) {
    try {
      // Broadcast message to lead room
      this.broadcastToLead(leadId, 'new_message', {
        agentId,
        leadId,
        message,
        type,
        timestamp: new Date()
      });

      // Log communication activity
      await this.logAgentActivity(agentId, 'message_sent', {
        leadId,
        messageType: type
      });
    } catch (error) {
      console.error('Error handling agent message:', error);
    }
  }

  /**
   * Log agent activity
   */
  async logAgentActivity(agentId, activityType, data = {}) {
    try {
      const activity = new AgentActivity({
        agentId,
        activity: {
          type: activityType,
          category: this.getActivityCategory(activityType)
        },
        context: {
          source: data.source || 'websocket',
          platform: data.platform || 'web_app'
        },
        location: data.location,
        relatedEntities: {
          leadId: data.leadId
        },
        outcome: {
          status: 'success'
        }
      });

      await activity.save();
    } catch (error) {
      console.error('Error logging agent activity:', error);
    }
  }

  /**
   * Get activity category
   */
  getActivityCategory(activityType) {
    const categories = {
      'login': 'system',
      'logout': 'system',
      'lead_accept': 'lead_management',
      'lead_decline': 'lead_management',
      'lead_view': 'lead_management',
      'message_sent': 'communication',
      'location_update': 'system'
    };

    return categories[activityType] || 'system';
  }

  /**
   * Get connected agents count
   */
  getConnectedAgentsCount() {
    return this.agentConnections.size;
  }

  /**
   * Get agent connection status
   */
  isAgentConnected(agentId) {
    return this.agentConnections.has(agentId);
  }

  /**
   * Send bulk notification to multiple agents
   */
  async sendBulkNotification(agentIds, event, data) {
    const results = [];
    for (const agentId of agentIds) {
      const sent = this.sendToAgent(agentId, event, data);
      results.push({ agentId, sent });
    }
    return results;
  }
}

// Create singleton instance
const agentWebSocketService = new AgentWebSocketService();

module.exports = agentWebSocketService;
