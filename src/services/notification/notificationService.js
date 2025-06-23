const Notification = require('../../models/notification');
const User = require('../../models/User');
const emailService = require('../email/emailService');

class NotificationService {
  async create(data) {
    try {
      const notification = await Notification.create(data);
      
      // Check if email notification is needed
      const user = await User.findById(data.recipient);
      if (user.preferences?.emailNotifications) {
        await this.sendEmailNotification(user, notification);
      }
      
      return notification;
    } catch (error) {
      console.error('Failed to create notification:', error);
      throw error;
    }
  }

  async sendEmailNotification(user, notification) {
    try {
      await emailService.sendEmail({
        to: user.email,
        subject: notification.title,
        html: `
          <h3>${notification.title}</h3>
          <p>${notification.message}</p>
          <a href="${process.env.CLIENT_URL}/notifications">View in app</a>
        `
      });
    } catch (error) {
      console.error('Failed to send email notification:', error);
    }
  }

  async markAsRead(notificationId, userId) {
    const notification = await Notification.findOne({
      _id: notificationId,
      recipient: userId
    });
    
    if (!notification) {
      throw new Error('Notification not found');
    }
    
    return notification.markAsRead();
  }

  async markAllAsRead(userId) {
    return Notification.markAllAsRead(userId);
  }

  async getUnreadCount(userId) {
    return Notification.countDocuments({
      recipient: userId,
      isRead: false
    });
  }
}

module.exports = new NotificationService();