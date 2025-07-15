const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const whatsappService = require('../services/whatsappService');
const logger = require('../config/logger');

/**
 * @route   POST /api/v1/webhooks/twilio/whatsapp
 * @desc    Receive WhatsApp messages from Twilio
 * @access  Public (but should be verified with Twilio signature)
 */
router.post('/twilio/whatsapp', asyncHandler(async (req, res) => {
  try {
    // Twilio sends data in req.body
    const { From, Body, MessageSid, AccountSid } = req.body;
    
    // Verify the request is from Twilio (in production)
    if (process.env.NODE_ENV === 'production') {
      const twilioSignature = req.headers['x-twilio-signature'];
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      
      // TODO: Implement Twilio signature validation
      // const isValid = twilio.validateRequest(
      //   process.env.TWILIO_AUTH_TOKEN,
      //   twilioSignature,
      //   url,
      //   req.body
      // );
      
      // if (!isValid) {
      //   return res.status(403).send('Forbidden');
      // }
    }
    
    logger.info('Received WhatsApp message:', {
      from: From,
      body: Body,
      messageId: MessageSid
    });
    
    // Process the incoming message
    const result = await whatsappService.processIncomingMessage(From, Body, MessageSid);
    
    // Twilio expects TwiML response
    res.type('text/xml');
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  } catch (error) {
    logger.error('WhatsApp webhook error:', error);
    res.status(500).send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  }
}));

/**
 * @route   GET /api/v1/webhooks/twilio/whatsapp/status
 * @desc    Receive WhatsApp message status updates
 * @access  Public
 */
router.post('/twilio/whatsapp/status', asyncHandler(async (req, res) => {
  try {
    const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body;
    
    logger.info('WhatsApp status update:', {
      messageId: MessageSid,
      status: MessageStatus,
      error: ErrorCode
    });
    
    // Update communication record
    const AgentCommunication = require('../models/AgentCommunication');
    await AgentCommunication.findOneAndUpdate(
      { 'messageInfo.messageId': MessageSid },
      {
        'delivery.status': MessageStatus,
        'delivery.deliveredAt': MessageStatus === 'delivered' ? new Date() : undefined,
        'delivery.error': ErrorCode ? {
          code: ErrorCode,
          message: ErrorMessage
        } : undefined
      }
    );
    
    res.status(200).send('OK');
  } catch (error) {
    logger.error('WhatsApp status webhook error:', error);
    res.status(500).send('Error');
  }
}));

/**
 * @route   POST /api/v1/webhooks/azure/sms
 * @desc    Receive SMS delivery reports from Azure
 * @access  Public
 */
router.post('/azure/sms', asyncHandler(async (req, res) => {
  try {
    // Azure Communication Services webhook format
    const { messageId, to, status, deliveryStatus, deliveryTime } = req.body;
    
    logger.info('Azure SMS delivery report:', {
      messageId,
      to,
      status,
      deliveryStatus
    });
    
    // Update communication record
    const AgentCommunication = require('../models/AgentCommunication');
    await AgentCommunication.findOneAndUpdate(
      { 'messageInfo.messageId': messageId },
      {
        'delivery.status': deliveryStatus?.toLowerCase() || status,
        'delivery.deliveredAt': deliveryTime ? new Date(deliveryTime) : undefined
      }
    );
    
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Azure SMS webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}));

module.exports = router;