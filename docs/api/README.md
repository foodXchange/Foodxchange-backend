# FoodXchange API Documentation

## Overview

The FoodXchange API is a comprehensive B2B food commerce platform that connects food suppliers with businesses. It provides a robust set of endpoints for managing products, orders, RFQs, compliance, analytics, and more.

## Base URL

```
https://api.foodxchange.com/api/v1
```

## Authentication

All API endpoints require authentication using JWT tokens. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Getting Started

1. **Sign Up/Login**: Use the authentication endpoints to obtain a JWT token
2. **Setup Company Profile**: Complete your company information
3. **Start Trading**: Begin creating products, RFQs, and orders

## Core Concepts

### Multi-Tenancy
The platform supports multi-tenant architecture where each company operates in its own isolated environment.

### User Roles
- **Admin**: Full system access
- **Manager**: Company-level management
- **Supplier**: Can create products and respond to RFQs
- **Buyer**: Can create RFQs and place orders
- **User**: Basic access to platform features

### Data Models

#### Product
Products are the core inventory items that suppliers offer for sale.

#### RFQ (Request for Quote)
RFQs allow buyers to request quotes for specific products or services.

#### Order
Orders represent actual purchase transactions between buyers and suppliers.

#### Company
Companies are the organizations that use the platform (both suppliers and buyers).

## API Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `POST /auth/refresh` - Refresh JWT token
- `POST /auth/logout` - User logout
- `POST /auth/forgot-password` - Password reset request
- `POST /auth/reset-password` - Password reset confirmation

### Products
- `GET /products` - List products with filtering and pagination
- `GET /products/:id` - Get product details
- `POST /products` - Create new product (Suppliers only)
- `PUT /products/:id` - Update product (Suppliers only)
- `DELETE /products/:id` - Delete product (Suppliers only)
- `POST /products/:id/images` - Upload product images

### RFQs (Request for Quote)
- `GET /rfqs` - List RFQs with filtering
- `GET /rfqs/:id` - Get RFQ details
- `POST /rfqs` - Create new RFQ (Buyers only)
- `PUT /rfqs/:id` - Update RFQ (Buyers only)
- `POST /rfqs/:id/quotes` - Submit quote for RFQ (Suppliers only)
- `POST /rfqs/:id/award` - Award RFQ to supplier (Buyers only)

### Orders
- `GET /orders` - List orders with filtering
- `GET /orders/:id` - Get order details
- `POST /orders` - Create new order
- `PUT /orders/:id/status` - Update order status
- `POST /orders/:id/approve` - Approve order (if approval workflow enabled)
- `GET /orders/:id/tracking` - Get order tracking information

### Companies
- `GET /companies` - List companies (directory)
- `GET /companies/:id` - Get company details
- `PUT /companies/profile` - Update company profile
- `POST /companies/verify` - Submit company verification documents

### Analytics & Reporting
- `GET /analytics/dashboard` - Get dashboard metrics
- `GET /analytics/reports` - Generate comprehensive reports
- `GET /analytics/real-time` - Get real-time analytics
- `POST /analytics/track` - Track custom events

### Mobile API
- `GET /mobile/dashboard` - Mobile-optimized dashboard
- `GET /mobile/products` - Mobile-optimized product listings
- `GET /mobile/orders` - Mobile-optimized order listings
- `GET /mobile/config` - Mobile app configuration

### AI & Recommendations
- `GET /ai/recommendations` - Get personalized recommendations
- `GET /ai/search` - Advanced search with AI scoring
- `GET /ai/recommendations/trending` - Get trending products
- `GET /ai/recommendations/similar/:productId` - Get similar products

### Compliance & Safety
- `GET /compliance/haccp/dashboard` - HACCP compliance dashboard
- `POST /compliance/haccp/measurements` - Record safety measurements
- `GET /compliance/haccp/alerts` - Get compliance alerts
- `POST /compliance/haccp/alerts/:id/resolve` - Resolve compliance alert

## Response Format

All API responses follow a consistent format:

```json
{
  "success": true,
  "data": {
    // Response data
  },
  "message": "Success message",
  "meta": {
    // Optional metadata (pagination, etc.)
  }
}
```

### Error Responses

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description",
    "details": {
      // Additional error details
    }
  }
}
```

## Status Codes

- `200 OK` - Successful request
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Access denied
- `404 Not Found` - Resource not found
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- **General endpoints**: 100 requests per hour
- **Authentication**: 10 requests per hour
- **Mobile endpoints**: 300 requests per hour
- **Analytics**: 150 requests per hour

Rate limit headers are included in responses:
- `X-RateLimit-Limit` - Request limit
- `X-RateLimit-Remaining` - Remaining requests
- `X-RateLimit-Reset` - Reset time (Unix timestamp)

## Pagination

List endpoints support pagination with the following parameters:

- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)

Pagination response includes:

```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalCount": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrevious": false
  }
}
```

## Filtering and Sorting

### Common Filter Parameters

- `search` - Text search across relevant fields
- `category` - Filter by category
- `status` - Filter by status
- `startDate` / `endDate` - Date range filtering
- `minPrice` / `maxPrice` - Price range filtering

### Sorting

Use the `sort` parameter with field names:
- `sort=name` - Sort by name (ascending)
- `sort=-createdAt` - Sort by creation date (descending)

## Webhooks

The platform supports webhooks for real-time event notifications:

### Supported Events

- `order.created` - New order created
- `order.status_changed` - Order status updated
- `rfq.created` - New RFQ created
- `rfq.quote_received` - New quote received
- `product.created` - New product added
- `compliance.alert` - Compliance violation detected

### Webhook Configuration

Configure webhooks in your company settings or via API:

```json
{
  "url": "https://your-domain.com/webhooks",
  "events": ["order.created", "order.status_changed"],
  "secret": "your-webhook-secret"
}
```

## SDKs and Libraries

### JavaScript/Node.js

```bash
npm install @foodxchange/api-client
```

```javascript
const FoodXchange = require('@foodxchange/api-client');

const client = new FoodXchange({
  apiKey: 'your-api-key',
  environment: 'production' // or 'sandbox'
});

const products = await client.products.list();
```

### Python

```bash
pip install foodxchange-api
```

```python
from foodxchange import FoodXchangeAPI

client = FoodXchangeAPI(
    api_key='your-api-key',
    environment='production'
)

products = client.products.list()
```

## Testing

### Sandbox Environment

Use the sandbox environment for testing:

```
https://api-sandbox.foodxchange.com/api/v1
```

### Test Data

The sandbox includes sample data for testing:
- Test companies
- Sample products
- Mock orders and RFQs

## Support

### Documentation
- API Reference: https://docs.foodxchange.com/api
- User Guides: https://docs.foodxchange.com/guides
- Integration Examples: https://github.com/foodxchange/examples

### Support Channels
- Email: api-support@foodxchange.com
- Slack: #api-support
- GitHub Issues: https://github.com/foodxchange/api-issues

### Status Page
Monitor API status and incidents: https://status.foodxchange.com

## Changelog

### v1.3.0 (Current)
- Added AI-powered recommendations
- Enhanced mobile API endpoints
- Improved analytics and reporting
- Added HACCP compliance features

### v1.2.0
- Added multi-tenant support
- Implemented JWT refresh tokens
- Enhanced search capabilities
- Added webhook support

### v1.1.0
- Added RFQ management
- Implemented order approval workflows
- Added company verification
- Enhanced filtering and sorting

### v1.0.0
- Initial API release
- Basic product and order management
- User authentication
- Company profiles