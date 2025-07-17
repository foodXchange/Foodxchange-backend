import { ServiceBusClient, ServiceBusMessage } from '@azure/service-bus';
import { Logger } from '../../core/logging/logger';
import jwt from 'jsonwebtoken';
import axios from 'axios';

const logger = new Logger('SignalRService');

export interface SignalRConnection {
  url: string;
  accessToken: string;
}

export interface SignalRMessage {
  target: string;
  arguments: any[];
  userId?: string;
  groupName?: string;
  connectionId?: string;
}

export interface SignalRNotification {
  type: 'order_update' | 'rfq_update' | 'chat_message' | 'shipment_update' | 'compliance_alert' | 'system_notification';
  userId?: string;
  tenantId: string;
  data: any;
  timestamp: Date;
}

export class SignalRService {
  private connectionString: string;
  private endpoint: string;
  private accessKey: string;
  private hubName: string;
  private apiVersion: string = '2021-10-01';

  constructor() {
    this.connectionString = process.env.AZURE_SIGNALR_CONNECTION_STRING || '';
    this.hubName = process.env.AZURE_SIGNALR_HUB_NAME || 'foodxchange';
    
    if (this.connectionString) {
      this.parseConnectionString();
    } else {
      logger.warn('Azure SignalR connection string not configured');
    }
  }

  private parseConnectionString(): void {
    const parts = this.connectionString.split(';');
    const endpointPart = parts.find(p => p.startsWith('Endpoint='));
    const accessKeyPart = parts.find(p => p.startsWith('AccessKey='));

    if (endpointPart && accessKeyPart) {
      this.endpoint = endpointPart.split('=')[1];
      this.accessKey = accessKeyPart.split('=')[1];
    } else {
      throw new Error('Invalid Azure SignalR connection string format');
    }
  }

  /**
   * Generate access token for SignalR connection
   */
  generateAccessToken(userId: string, tenantId: string, roles: string[] = []): string {
    if (!this.accessKey) {
      throw new Error('SignalR access key not configured');
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      aud: `${this.endpoint}/client/hubs/${this.hubName}`,
      iat: now,
      exp: now + 3600, // 1 hour expiration
      userId,
      tenantId,
      roles
    };

    return jwt.sign(payload, this.accessKey, { algorithm: 'HS256' });
  }

  /**
   * Get SignalR connection info for client
   */
  async getConnectionInfo(userId: string, tenantId: string, roles: string[] = []): Promise<SignalRConnection> {
    try {
      const accessToken = this.generateAccessToken(userId, tenantId, roles);
      const url = `${this.endpoint}/client/hubs/${this.hubName}`;

      return {
        url,
        accessToken
      };
    } catch (error) {
      logger.error('Failed to get SignalR connection info:', error);
      throw error;
    }
  }

  /**
   * Send message to specific user
   */
  async sendToUser(userId: string, target: string, data: any): Promise<void> {
    try {
      const url = `${this.endpoint}/api/v1/hubs/${this.hubName}/users/${userId}`;
      const message = {
        target,
        arguments: [data]
      };

      await this.makeSignalRRequest(url, message);
      logger.debug('Message sent to user', { userId, target });
    } catch (error) {
      logger.error('Failed to send message to user:', error);
      throw error;
    }
  }

  /**
   * Send message to group (tenant)
   */
  async sendToGroup(groupName: string, target: string, data: any): Promise<void> {
    try {
      const url = `${this.endpoint}/api/v1/hubs/${this.hubName}/groups/${groupName}`;
      const message = {
        target,
        arguments: [data]
      };

      await this.makeSignalRRequest(url, message);
      logger.debug('Message sent to group', { groupName, target });
    } catch (error) {
      logger.error('Failed to send message to group:', error);
      throw error;
    }
  }

  /**
   * Send message to all connected clients
   */
  async sendToAll(target: string, data: any): Promise<void> {
    try {
      const url = `${this.endpoint}/api/v1/hubs/${this.hubName}`;
      const message = {
        target,
        arguments: [data]
      };

      await this.makeSignalRRequest(url, message);
      logger.debug('Message sent to all clients', { target });
    } catch (error) {
      logger.error('Failed to send message to all:', error);
      throw error;
    }
  }

  /**
   * Add user to group
   */
  async addUserToGroup(userId: string, groupName: string): Promise<void> {
    try {
      const url = `${this.endpoint}/api/v1/hubs/${this.hubName}/groups/${groupName}/users/${userId}`;
      
      await this.makeSignalRRequest(url, {}, 'PUT');
      logger.debug('User added to group', { userId, groupName });
    } catch (error) {
      logger.error('Failed to add user to group:', error);
      throw error;
    }
  }

  /**
   * Remove user from group
   */
  async removeUserFromGroup(userId: string, groupName: string): Promise<void> {
    try {
      const url = `${this.endpoint}/api/v1/hubs/${this.hubName}/groups/${groupName}/users/${userId}`;
      
      await this.makeSignalRRequest(url, {}, 'DELETE');
      logger.debug('User removed from group', { userId, groupName });
    } catch (error) {
      logger.error('Failed to remove user from group:', error);
      throw error;
    }
  }

  /**
   * Check if user is connected
   */
  async isUserConnected(userId: string): Promise<boolean> {
    try {
      const url = `${this.endpoint}/api/v1/hubs/${this.hubName}/users/${userId}`;
      const response = await this.makeSignalRRequest(url, {}, 'HEAD');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get connected users count
   */
  async getConnectedUsersCount(): Promise<number> {
    try {
      const url = `${this.endpoint}/api/v1/hubs/${this.hubName}/connections`;
      const response = await this.makeSignalRRequest(url, {}, 'GET');
      return response.data?.count || 0;
    } catch (error) {
      logger.error('Failed to get connected users count:', error);
      return 0;
    }
  }

  /**
   * Send notification based on type
   */
  async sendNotification(notification: SignalRNotification): Promise<void> {
    try {
      const { type, userId, tenantId, data, timestamp } = notification;
      
      const message = {
        type,
        data,
        timestamp: timestamp.toISOString(),
        tenantId
      };

      // Send to specific user or tenant group
      if (userId) {
        await this.sendToUser(userId, 'notification', message);
      } else {
        await this.sendToGroup(`tenant_${tenantId}`, 'notification', message);
      }

      logger.info('Notification sent', { type, userId, tenantId });
    } catch (error) {
      logger.error('Failed to send notification:', error);
      throw error;
    }
  }

  /**
   * Send order update notification
   */
  async sendOrderUpdate(orderId: string, status: string, userId: string, tenantId: string, data: any): Promise<void> {
    await this.sendNotification({
      type: 'order_update',
      userId,
      tenantId,
      data: {
        orderId,
        status,
        ...data
      },
      timestamp: new Date()
    });
  }

  /**
   * Send RFQ update notification
   */
  async sendRFQUpdate(rfqId: string, status: string, userId: string, tenantId: string, data: any): Promise<void> {
    await this.sendNotification({
      type: 'rfq_update',
      userId,
      tenantId,
      data: {
        rfqId,
        status,
        ...data
      },
      timestamp: new Date()
    });
  }

  /**
   * Send chat message
   */
  async sendChatMessage(fromUserId: string, toUserId: string, tenantId: string, message: string, metadata?: any): Promise<void> {
    const chatData = {
      fromUserId,
      toUserId,
      message,
      timestamp: new Date().toISOString(),
      metadata
    };

    await this.sendToUser(toUserId, 'chat_message', chatData);
    await this.sendToUser(fromUserId, 'chat_message_sent', chatData);
  }

  /**
   * Send shipment tracking update
   */
  async sendShipmentUpdate(orderId: string, shipmentId: string, trackingData: any, userId: string, tenantId: string): Promise<void> {
    await this.sendNotification({
      type: 'shipment_update',
      userId,
      tenantId,
      data: {
        orderId,
        shipmentId,
        trackingData
      },
      timestamp: new Date()
    });
  }

  /**
   * Send compliance alert
   */
  async sendComplianceAlert(alertType: string, severity: 'low' | 'medium' | 'high' | 'critical', userId: string, tenantId: string, data: any): Promise<void> {
    await this.sendNotification({
      type: 'compliance_alert',
      userId,
      tenantId,
      data: {
        alertType,
        severity,
        ...data
      },
      timestamp: new Date()
    });
  }

  /**
   * Send system notification
   */
  async sendSystemNotification(title: string, message: string, tenantId: string, userId?: string): Promise<void> {
    await this.sendNotification({
      type: 'system_notification',
      userId,
      tenantId,
      data: {
        title,
        message
      },
      timestamp: new Date()
    });
  }

  /**
   * Make HTTP request to SignalR REST API
   */
  private async makeSignalRRequest(url: string, data: any, method: string = 'POST'): Promise<any> {
    if (!this.accessKey) {
      throw new Error('SignalR service not configured');
    }

    const token = this.generateServiceToken();
    
    const config = {
      method,
      url,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: method !== 'GET' && method !== 'HEAD' ? data : undefined
    };

    return await axios(config);
  }

  /**
   * Generate service token for REST API calls
   */
  private generateServiceToken(): string {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      aud: this.endpoint,
      iat: now,
      exp: now + 3600 // 1 hour expiration
    };

    return jwt.sign(payload, this.accessKey, { algorithm: 'HS256' });
  }

  /**
   * Health check for SignalR service
   */
  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      if (!this.connectionString) {
        return { healthy: false, message: 'SignalR not configured' };
      }

      const count = await this.getConnectedUsersCount();
      return { 
        healthy: true, 
        message: `SignalR healthy, ${count} connected users` 
      };
    } catch (error) {
      return { 
        healthy: false, 
        message: `SignalR health check failed: ${error.message}` 
      };
    }
  }
}

// Singleton instance
let signalRService: SignalRService;

export const getSignalRService = (): SignalRService => {
  if (!signalRService) {
    signalRService = new SignalRService();
  }
  return signalRService;
};

// Export default instance
export default getSignalRService();