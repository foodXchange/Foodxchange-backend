# Payment Processing Integration

## Overview

The FoodXchange payment processing system provides a comprehensive, secure, and scalable solution for handling financial transactions in the B2B food commerce platform. The system supports multiple payment gateways, currencies, and payment methods while maintaining PCI compliance and robust audit trails.

## Features

### Core Payment Processing
- **Multi-Gateway Support**: Stripe, PayPal, and extensible architecture for additional gateways
- **Multiple Payment Methods**: Credit cards, debit cards, bank transfers, ACH, wire transfers
- **Currency Support**: USD, EUR, GBP, CAD, AUD, JPY, CNY, INR
- **Real-time Processing**: Immediate payment confirmation and status updates
- **Automatic Retry Logic**: Failed payment retry mechanism with exponential backoff

### Financial Management
- **Fee Calculation**: Automatic platform and gateway fee calculation
- **Refund Processing**: Full and partial refunds with reason tracking
- **Revenue Analytics**: Comprehensive financial reporting and statistics
- **Tax Compliance**: Support for tax ID tracking and billing information

### Security & Compliance
- **PCI Compliance**: Secure payment data handling
- **Audit Logging**: Complete transaction audit trails
- **KYC/AML Checks**: Know Your Customer and Anti-Money Laundering verification
- **Fraud Detection**: Risk scoring and suspicious activity monitoring
- **Data Encryption**: Sensitive payment data encryption and tokenization

### Advanced Features
- **Dispute Management**: Chargeback and dispute handling workflow
- **Webhook Support**: Real-time event notifications from payment gateways
- **Scheduled Payments**: Support for recurring and scheduled transactions
- **Multi-party Payments**: Split payments between multiple sellers
- **Payment Timeline**: Complete transaction lifecycle tracking

## Architecture

### Payment Models

#### Payment Model (`src/models/Payment.ts`)
- Comprehensive payment record with full transaction lifecycle
- Support for refunds, disputes, and compliance tracking
- Built-in methods for fee calculation and status management

#### Payment Gateway Interface (`src/services/payment/PaymentGateway.ts`)
- Abstract base class for payment gateway implementations
- Standardized interface for all payment operations
- Common validation and error handling methods

### Gateway Implementations

#### Stripe Gateway (`src/services/payment/StripeGateway.ts`)
- Full Stripe API integration
- Support for payment intents, customers, and payment methods
- 3D Secure authentication handling
- Webhook event processing

#### PayPal Gateway (`src/services/payment/PayPalGateway.ts`)
- PayPal REST API integration
- Order creation and capture flow
- Express checkout support
- IPN (Instant Payment Notification) handling

### Service Layer

#### Payment Service (`src/services/payment/PaymentService.ts`)
- Orchestrates payment processing across multiple gateways
- Handles business logic and database operations
- Event emission for payment lifecycle events
- Metrics collection and monitoring

## API Endpoints

### Payment Processing
```
POST /api/payments/process
POST /api/payments/:id/confirm
POST /api/payments/:id/cancel
```

### Refund Management
```
POST /api/payments/:id/refund
```

### Query Operations
```
GET /api/payments/:id
GET /api/payments/user
GET /api/payments/order/:orderId
GET /api/payments/stats
```

### Webhook Handling
```
POST /api/payments/webhook/stripe
POST /api/payments/webhook/paypal
```

## Configuration

### Environment Variables

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# PayPal Configuration
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_WEBHOOK_ID=your_webhook_id

# Database
MONGODB_URI=mongodb://localhost:27017/foodxchange
```

### Gateway Setup

#### Stripe Setup
1. Create a Stripe account at https://stripe.com
2. Obtain API keys from the Stripe Dashboard
3. Configure webhook endpoints for real-time events
4. Enable required payment methods in dashboard

#### PayPal Setup
1. Create a PayPal Developer account
2. Create an application in the PayPal Developer Console
3. Configure webhook notifications
4. Set up sandbox for testing

## Usage Examples

### Processing a Payment

```javascript
const paymentRequest = {
  orderId: "order_123",
  buyerId: "buyer_456",
  sellerId: "seller_789",
  amount: 10000, // $100.00 in cents
  currency: "USD",
  paymentMethod: {
    type: "credit_card",
    token: "card_token_from_frontend"
  },
  customer: {
    id: "customer_123",
    email: "buyer@example.com",
    name: "John Doe"
  },
  billing: {
    name: "John Doe",
    email: "buyer@example.com",
    address: {
      line1: "123 Main St",
      city: "Anytown",
      state: "NY",
      postalCode: "12345",
      country: "US"
    }
  }
};

const result = await paymentService.processPayment(paymentRequest);
```

### Processing a Refund

```javascript
const refundResult = await paymentService.refundPayment(
  paymentId,
  2500, // $25.00 in cents
  "Customer requested refund",
  userId
);
```

### Handling Webhooks

```javascript
app.post('/api/payments/webhook/stripe', (req, res) => {
  const signature = req.headers['stripe-signature'];
  paymentService.handleWebhook('stripe', req.body, signature);
  res.status(200).send('OK');
});
```

## Security Considerations

### PCI Compliance
- Never store sensitive card data in your database
- Use payment gateway tokens for card references
- Implement proper access controls and audit logging
- Regularly review and update security practices

### Data Protection
- Encrypt sensitive payment information
- Implement proper input validation
- Use HTTPS for all payment-related communications
- Follow GDPR and other data protection regulations

### Fraud Prevention
- Implement velocity checks and rate limiting
- Monitor for suspicious transaction patterns
- Use machine learning for fraud detection
- Maintain blacklists and whitelists

## Monitoring and Analytics

### Key Metrics
- Payment success/failure rates
- Average transaction value
- Revenue by payment method
- Refund rates and reasons
- Gateway performance metrics

### Alerting
- Failed payment notifications
- High-value transaction alerts
- Unusual activity patterns
- System health monitoring

## Testing

### Unit Tests
```bash
npm test -- --grep "Payment"
```

### Integration Tests
```bash
node test-payment-simple.js
```

### Manual Testing
Use the provided test scripts to validate:
- Payment creation and processing
- Fee calculation accuracy
- Refund functionality
- Webhook handling
- Error scenarios

## Troubleshooting

### Common Issues

#### Payment Failures
- Check gateway configuration
- Verify webhook endpoints
- Review error logs and audit trails
- Validate payment method details

#### Refund Issues
- Ensure payment is in completed status
- Check refundable amount calculations
- Verify gateway refund capabilities
- Review refund processing logs

#### Integration Problems
- Validate API credentials
- Check network connectivity
- Review webhook signature verification
- Test with sandbox environments

### Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| INVALID_AMOUNT | Amount must be positive | Check amount format (cents) |
| GATEWAY_ERROR | Payment gateway issue | Retry or check gateway status |
| INSUFFICIENT_FUNDS | Insufficient account balance | Request alternative payment method |
| CARD_DECLINED | Card was declined | Try different card or contact bank |
| REFUND_FAILED | Refund processing failed | Check refund eligibility |

## Performance Optimization

### Database Optimization
- Proper indexing on payment status and timestamps
- Efficient queries for reporting and analytics
- Regular database maintenance and monitoring

### Caching Strategy
- Cache payment gateway responses
- Use Redis for session management
- Implement query result caching

### Scalability
- Horizontal scaling for payment processing
- Load balancing across multiple instances
- Database sharding for high-volume transactions

## Compliance and Regulations

### PCI DSS Compliance
- Secure network and systems
- Protect cardholder data
- Maintain vulnerability management
- Implement strong access controls
- Regularly monitor and test networks

### Financial Regulations
- SOX compliance for financial reporting
- GDPR for European customer data
- AML/KYC verification requirements
- Local tax and regulatory compliance

## Future Enhancements

### Planned Features
- Cryptocurrency payment support
- Buy now, pay later (BNPL) integration
- Advanced fraud detection with ML
- Multi-currency automatic conversion
- Enhanced reporting and analytics

### Integration Roadmap
- Additional payment gateways
- Banking API integrations
- Accounting system connectors
- ERP system integrations

## Support and Maintenance

### Monitoring
- 24/7 payment system monitoring
- Real-time alerting for critical issues
- Performance metrics dashboard
- Automated health checks

### Maintenance Windows
- Scheduled maintenance during low-traffic periods
- Graceful degradation for gateway outages
- Automatic failover capabilities
- Regular security updates

For technical support or questions about the payment system, please refer to the development team or check the API documentation.