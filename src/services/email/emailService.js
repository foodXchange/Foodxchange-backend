// src/services/email/emailService.js
const nodemailer = require('nodemailer');
const emailTemplates = require('./emailTemplates');

class EmailService {
  constructor() {
    this.transporter = null;
  }

  getTransporter() {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransporter({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
          user: process.env.EMAIL_USER || 'test@example.com',
          pass: process.env.EMAIL_PASS || 'password'
        }
      });
    }
    return this.transporter;
  }

  async sendEmail(options) {
    try {
      const transporter = this.getTransporter();
      const mailOptions = {
        from: `FoodXchange <${process.env.EMAIL_USER || 'noreply@foodxchange.com'}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html
      };

      const info = await transporter.sendMail(mailOptions);
      console.log('Email sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Email sending failed:', error);
      return { success: false, error: error.message };
    }
  }

  async sendWelcomeEmail(user) {
    const template = emailTemplates.welcome(user);
    return this.sendEmail({
      to: user.email,
      ...template
    });
  }

  async sendProjectInvitation(vendor, project) {
    const template = emailTemplates.projectInvitation(vendor, project);
    return this.sendEmail({
      to: vendor.email,
      ...template
    });
  }

  async sendProposalReceivedEmail(buyer, project, proposal) {
    const template = emailTemplates.proposalReceived(buyer, project, proposal);
    return this.sendEmail({
      to: buyer.email,
      ...template
    });
  }

  async sendProposalAcceptedEmail(vendor, project, proposal) {
    const template = emailTemplates.proposalAccepted(vendor, project, proposal);
    return this.sendEmail({
      to: vendor.email,
      ...template
    });
  }

  async sendProjectExpiringEmail(user, project, daysLeft) {
    const template = emailTemplates.projectExpiring(user, project, daysLeft);
    return this.sendEmail({
      to: user.email,
      ...template
    });
  }

  async sendPasswordResetEmail(user, resetToken) {
    const template = emailTemplates.passwordReset(user, resetToken);
    return this.sendEmail({
      to: user.email,
      ...template
    });
  }

  // Keep this for backward compatibility
  async sendProjectCreatedEmail(user, project) {
    return this.sendProjectInvitation(user, project);
  }
}

module.exports = new EmailService();