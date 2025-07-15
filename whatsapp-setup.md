# WhatsApp Notifications Setup Guide

This guide explains how to set up WhatsApp notifications for the FoodXchange agent system.

## Overview

The WhatsApp notification system provides real-time messaging to agents for:
- New lead notifications
- Commission updates
- Lead status changes
- Weekly performance reports
- Urgent alerts

## Service Options

### Option 1: Twilio (Recommended)
Twilio provides the most comprehensive WhatsApp Business API integration.

**Setup Steps:**
1. Create a Twilio account at https://www.twilio.com/
2. Get your Account SID and Auth Token
3. Set up WhatsApp Business API or use Twilio Sandbox
4. Configure webhook endpoints

**Environment Variables:**
```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886  # Sandbox number or approved number
```

### Option 2: Azure Communication Services (Fallback)
Used as SMS fallback when WhatsApp is unavailable.

**Environment Variables:**
```bash
# Azure Communication Services
AZURE_COMMUNICATION_CONNECTION_STRING=endpoint=https://your-resource.communication.azure.com/;accesskey=your-access-key
AZURE_COMMUNICATION_PHONE_NUMBER=+1234567890
```

## Webhook Configuration

### 1. Twilio Webhook
Configure your Twilio WhatsApp webhook to point to:
```
https://yourdomain.com/api/v1/webhooks/twilio/whatsapp
```

### 2. Twilio Status Webhook
Configure status updates webhook:
```
https://yourdomain.com/api/v1/webhooks/twilio/whatsapp/status
```

### 3. Azure SMS Webhook
Configure Azure SMS delivery reports:
```
https://yourdomain.com/api/v1/webhooks/azure/sms
```

## Agent Setup

### 1. Agent Registration
Agents must provide their WhatsApp number during registration:
```javascript
{
  "personalInfo": {
    "whatsapp": "+1234567890"  // International format
  }
}
```

### 2. WhatsApp Commands
Agents can respond to notifications using these commands:
- `ACCEPT LEAD123` - Accept a lead
- `DECLINE LEAD123 reason` - Decline a lead with reason
- `STATUS` - Get current status
- `HELP` - Show available commands

## Message Templates

### New Lead Notification
```
🔔 *New Lead Available!*

*Lead:* Premium Organic Apples
*Value:* USD 15,000
*Location:* New York, USA
*Urgency:* HIGH
*Match Score:* 85%

⏰ *Response Time:* 45m

✅ Reply 'ACCEPT LEAD123' to accept
❌ Reply 'DECLINE LEAD123' to decline

_Lead #LEAD123_
```

### Commission Update
```
💰 *Commission Update!*

*Type:* Base Commission
*Amount:* USD 750.00
*Status:* ✅ Approved
*Deal:* ORD-2024-001

Tier bonus (gold): +150.00

_Your total pending commission: USD 2,480.00_
```

## Testing

### 1. WhatsApp Sandbox (Twilio)
Use Twilio's sandbox for testing:
1. Send "join [sandbox-keyword]" to +1 (415) 523-8886
2. Test with agent phone numbers

### 2. Test Endpoints
```bash
# Test webhook endpoint
curl -X POST https://yourdomain.com/api/v1/webhooks/twilio/whatsapp \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=whatsapp:+1234567890&Body=STATUS&MessageSid=test123"
```

## Error Handling

### Fallback Strategy
1. **Primary**: WhatsApp via Twilio
2. **Fallback**: SMS via Azure Communication Services
3. **Backup**: Email notification

### Monitoring
- All messages are logged in `AgentCommunication` collection
- Delivery status is tracked
- Failed messages trigger fallback mechanisms

## Security

### 1. Webhook Validation
- Verify Twilio signatures in production
- Use HTTPS for all webhook endpoints
- Validate request origin

### 2. Rate Limiting
- Messages are rate-limited per agent
- Prevents spam and abuse
- Configurable limits per tier

## Production Deployment

### 1. Twilio Setup
1. Apply for WhatsApp Business API
2. Get approved phone number
3. Submit message templates for approval
4. Configure production webhooks

### 2. Azure Setup
1. Create Azure Communication Services resource
2. Get phone number for SMS fallback
3. Configure delivery reports

### 3. Environment Variables
```bash
# Production Configuration
NODE_ENV=production
TWILIO_ACCOUNT_SID=your_production_sid
TWILIO_AUTH_TOKEN=your_production_token
TWILIO_WHATSAPP_FROM=whatsapp:+your_approved_number
AZURE_COMMUNICATION_CONNECTION_STRING=your_production_connection
AZURE_COMMUNICATION_PHONE_NUMBER=your_production_number
```

## Troubleshooting

### Common Issues

1. **WhatsApp not delivering**
   - Check agent's WhatsApp number format
   - Verify Twilio sandbox opt-in
   - Check webhook configuration

2. **Fallback SMS not working**
   - Verify Azure Communication Services setup
   - Check phone number formatting
   - Confirm webhook endpoint

3. **Agent responses not processed**
   - Check webhook URL accessibility
   - Verify agent exists in database
   - Check command format

### Debug Mode
Enable debug logging:
```bash
DEBUG=whatsapp:*
```

## Best Practices

1. **Message Timing**
   - Send during business hours
   - Respect time zones
   - Use urgency appropriately

2. **Content**
   - Keep messages concise
   - Use clear action items
   - Include relevant details

3. **Opt-out Management**
   - Provide opt-out mechanisms
   - Respect user preferences
   - Maintain compliance

## Compliance

### GDPR/Privacy
- Store minimal personal data
- Provide data export/deletion
- Obtain consent for messaging

### WhatsApp Policies
- Follow WhatsApp Business Policy
- Use approved templates
- Respect messaging limits

### Telecommunications
- Comply with local regulations
- Respect do-not-call lists
- Maintain audit trails