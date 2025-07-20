import { Request, Response } from 'express';

import { ValidationError, AuthorizationError, NotFoundError } from '../core/errors';
import { Logger } from '../core/logging/logger';
import { User } from '../models/User';
import { getSignalRService } from '../services/azure/SignalRService';
import { getRealtimeEventService } from '../services/realtime/RealtimeEventService';

const logger = new Logger('SignalRController');

export class SignalRController {
  private readonly signalRService = getSignalRService();
  private readonly realtimeEventService = getRealtimeEventService();

  /**
   * Get SignalR connection info for client
   */
  async getConnectionInfo(req: Request, res: Response): Promise<void> {
    try {
      const {userId} = req;
      const {tenantId} = req;

      // Get user roles
      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const roles = [user.role];
      if (user.permissions) {
        roles.push(...user.permissions);
      }

      // Get connection info
      const connectionInfo = await this.signalRService.getConnectionInfo(userId, tenantId, roles);

      res.json({
        success: true,
        data: connectionInfo
      });
    } catch (error) {
      logger.error('Get connection info error:', error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Send message to specific user
   */
  async sendMessageToUser(req: Request, res: Response): Promise<void> {
    try {
      const { targetUserId, message, type = 'message' } = req.body;
      const fromUserId = req.userId;
      const {tenantId} = req;

      if (!targetUserId || !message) {
        throw new ValidationError('Target user ID and message are required');
      }

      // Verify target user exists in same tenant
      const targetUser = await User.findOne({ _id: targetUserId, tenantId });
      if (!targetUser) {
        throw new NotFoundError('Target user not found');
      }

      // Send message via SignalR
      await this.signalRService.sendToUser(targetUserId, type, {
        fromUserId,
        message,
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        message: 'Message sent successfully'
      });
    } catch (error) {
      logger.error('Send message to user error:', error);

      if (error instanceof ValidationError || error instanceof NotFoundError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Send message to group (tenant)
   */
  async sendMessageToGroup(req: Request, res: Response): Promise<void> {
    try {
      const { message, type = 'broadcast' } = req.body;
      const fromUserId = req.userId;
      const {tenantId} = req;

      if (!message) {
        throw new ValidationError('Message is required');
      }

      // Check if user has permission to broadcast
      const user = await User.findById(fromUserId);
      if (!user || !['admin', 'manager'].includes(user.role)) {
        throw new AuthorizationError('Insufficient permissions to broadcast messages');
      }

      // Send message to tenant group
      await this.signalRService.sendToGroup(`tenant_${tenantId}`, type, {
        fromUserId,
        message,
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        message: 'Message broadcast successfully'
      });
    } catch (error) {
      logger.error('Send message to group error:', error);

      if (error instanceof ValidationError || error instanceof AuthorizationError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Send chat message
   */
  async sendChatMessage(req: Request, res: Response): Promise<void> {
    try {
      const { toUserId, message, orderId, rfqId } = req.body;
      const fromUserId = req.userId;
      const {tenantId} = req;

      if (!toUserId || !message) {
        throw new ValidationError('Recipient user ID and message are required');
      }

      // Verify recipient exists in same tenant
      const recipient = await User.findOne({ _id: toUserId, tenantId });
      if (!recipient) {
        throw new NotFoundError('Recipient not found');
      }

      // Prepare metadata
      const metadata = {
        orderId,
        rfqId,
        timestamp: new Date().toISOString()
      };

      // Emit chat message event
      await this.realtimeEventService.emitChatMessage(fromUserId, toUserId, tenantId, message, metadata);

      res.json({
        success: true,
        message: 'Chat message sent successfully'
      });
    } catch (error) {
      logger.error('Send chat message error:', error);

      if (error instanceof ValidationError || error instanceof NotFoundError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Send typing indicator
   */
  async sendTypingIndicator(req: Request, res: Response): Promise<void> {
    try {
      const { toUserId, isTyping } = req.body;
      const fromUserId = req.userId;
      const {tenantId} = req;

      if (!toUserId || typeof isTyping !== 'boolean') {
        throw new ValidationError('Recipient user ID and typing status are required');
      }

      // Send typing indicator
      await this.signalRService.sendToUser(toUserId, 'typing_indicator', {
        fromUserId,
        isTyping,
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        message: 'Typing indicator sent successfully'
      });
    } catch (error) {
      logger.error('Send typing indicator error:', error);

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Join user to group
   */
  async joinGroup(req: Request, res: Response): Promise<void> {
    try {
      const { groupName } = req.body;
      const {userId} = req;
      const {tenantId} = req;

      if (!groupName) {
        throw new ValidationError('Group name is required');
      }

      // Validate group access (implement your own logic)
      if (!this.validateGroupAccess(groupName, userId, tenantId)) {
        throw new AuthorizationError('Access denied to this group');
      }

      // Add user to group
      await this.signalRService.addUserToGroup(userId, groupName);

      res.json({
        success: true,
        message: 'Successfully joined group'
      });
    } catch (error) {
      logger.error('Join group error:', error);

      if (error instanceof ValidationError || error instanceof AuthorizationError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Leave group
   */
  async leaveGroup(req: Request, res: Response): Promise<void> {
    try {
      const { groupName } = req.body;
      const {userId} = req;

      if (!groupName) {
        throw new ValidationError('Group name is required');
      }

      // Remove user from group
      await this.signalRService.removeUserFromGroup(userId, groupName);

      res.json({
        success: true,
        message: 'Successfully left group'
      });
    } catch (error) {
      logger.error('Leave group error:', error);

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Get online users count
   */
  async getOnlineUsersCount(req: Request, res: Response): Promise<void> {
    try {
      const count = await this.signalRService.getConnectedUsersCount();

      res.json({
        success: true,
        data: {
          onlineUsers: count
        }
      });
    } catch (error) {
      logger.error('Get online users count error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Check if user is online
   */
  async checkUserOnline(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const {tenantId} = req;

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      // Verify user exists in same tenant
      const user = await User.findOne({ _id: userId, tenantId });
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const isOnline = await this.signalRService.isUserConnected(userId);

      res.json({
        success: true,
        data: {
          userId,
          isOnline
        }
      });
    } catch (error) {
      logger.error('Check user online error:', error);

      if (error instanceof ValidationError || error instanceof NotFoundError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Send system notification
   */
  async sendSystemNotification(req: Request, res: Response): Promise<void> {
    try {
      const { title, message, userId } = req.body;
      const {tenantId} = req;
      const fromUserId = req.userId;

      if (!title || !message) {
        throw new ValidationError('Title and message are required');
      }

      // Check if user has permission to send system notifications
      const user = await User.findById(fromUserId);
      if (!user || !['admin', 'manager'].includes(user.role)) {
        throw new AuthorizationError('Insufficient permissions to send system notifications');
      }

      // Send system notification
      await this.signalRService.sendSystemNotification(title, message, tenantId, userId);

      res.json({
        success: true,
        message: 'System notification sent successfully'
      });
    } catch (error) {
      logger.error('Send system notification error:', error);

      if (error instanceof ValidationError || error instanceof AuthorizationError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Get SignalR service health
   */
  async getHealth(req: Request, res: Response): Promise<void> {
    try {
      const health = await this.signalRService.healthCheck();

      res.json({
        success: true,
        data: health
      });
    } catch (error) {
      logger.error('Get SignalR health error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Validate group access (implement your own logic)
   */
  private validateGroupAccess(groupName: string, userId: string, tenantId: string): boolean {
    // Implement your group access validation logic here
    // For example, check if user belongs to tenant for tenant groups
    if (groupName.startsWith(`tenant_${tenantId}`)) {
      return true;
    }

    // Check other group access rules
    return false;
  }
}

export default new SignalRController();
