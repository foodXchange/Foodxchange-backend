# FoodXchange Backend - API Reference

Complete API documentation for the FoodXchange Backend platform.

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Product Management APIs](#product-management-apis)
4. [RFQ System Endpoints](#rfq-system-endpoints)
5. [Order Processing](#order-processing)
6. [Compliance Validation](#compliance-validation)
7. [WebSocket Events](#websocket-events)
8. [Rate Limiting](#rate-limiting)
9. [SDK Examples](#sdk-examples)
10. [Error Handling](#error-handling)

## Overview

### Base URLs

- **Production**: `https://api.foodxchange.com/v1`
- **Staging**: `https://staging-api.foodxchange.com/v1`
- **Development**: `http://localhost:5000/api`

### Request Format

All requests must include:
- `Content-Type: application/json` header
- `Authorization: Bearer <token>` header (for authenticated endpoints)
- `X-Tenant-ID: <tenant-id>` header (for multi-tenant operations)

### Response Format

```json
{
  "success": true,
  "data": {},
  "message": "Operation successful",
  "timestamp": "2025-01-23T12:00:00Z",
  "requestId": "req_123456789"
}
```

### Pagination

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## Authentication

### Register User

```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "role": "buyer",
  "company": {
    "name": "Acme Foods Inc",
    "type": "distributor",
    "taxId": "123456789"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_123456789",
      "email": "user@example.com",
      "role": "buyer",
      "status": "pending_verification"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
      "expiresIn": 3600
    }
  }
}
```

### Login

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_123456789",
      "email": "user@example.com",
      "role": "buyer",
      "permissions": ["products.read", "rfqs.create", "orders.manage"]
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
      "expiresIn": 3600
    }
  }
}
```

### Refresh Token

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Logout

```http
POST /auth/logout
Authorization: Bearer <token>
```

### Get Current User

```http
GET /auth/me
Authorization: Bearer <token>
```

### Update Password

```http
PUT /auth/update-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass456!"
}
```

## Product Management APIs

### List Products

```http
GET /products?page=1&pageSize=20&category=beverages&inStock=true&sort=-createdAt
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `pageSize` (number): Items per page (default: 20, max: 100)
- `category` (string): Filter by category
- `supplier` (string): Filter by supplier ID
- `inStock` (boolean): Filter by stock status
- `minPrice` (number): Minimum price filter
- `maxPrice` (number): Maximum price filter
- `search` (string): Search in name and description
- `sort` (string): Sort field (prefix with - for desc)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "prod_123456789",
      "sku": "BEV-001",
      "name": "Premium Orange Juice",
      "description": "100% pure orange juice",
      "category": "beverages",
      "pricing": {
        "currency": "USD",
        "basePrice": 3.99,
        "unit": "liter",
        "tierPricing": [
          {
            "minQuantity": 100,
            "price": 3.49
          },
          {
            "minQuantity": 500,
            "price": 2.99
          }
        ]
      },
      "inventory": {
        "quantity": 5000,
        "unit": "liters",
        "lowStockThreshold": 500,
        "trackInventory": true
      },
      "images": [
        {
          "url": "https://cdn.foodxchange.com/products/bev-001-1.jpg",
          "alt": "Premium Orange Juice",
          "isPrimary": true
        }
      ],
      "certifications": ["USDA Organic", "Non-GMO"],
      "supplier": {
        "id": "sup_987654321",
        "name": "Fresh Farms Inc",
        "rating": 4.8
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Get Product Details

```http
GET /products/{productId}
Authorization: Bearer <token>
```

### Create Product

```http
POST /products
Authorization: Bearer <token>
Content-Type: application/json

{
  "sku": "BEV-002",
  "name": "Organic Apple Juice",
  "description": "100% organic apple juice from local farms",
  "category": "beverages",
  "tags": ["organic", "local", "juice"],
  "pricing": {
    "currency": "USD",
    "basePrice": 4.99,
    "unit": "liter",
    "tierPricing": [
      {
        "minQuantity": 100,
        "price": 4.49
      }
    ],
    "taxRate": 8.5,
    "isTaxIncluded": false
  },
  "inventory": {
    "trackInventory": true,
    "quantity": 1000,
    "lowStockThreshold": 100,
    "outOfStockBehavior": "hide"
  },
  "specifications": {
    "ingredients": ["100% Organic Apples"],
    "nutritionFacts": {
      "servingSize": "250ml",
      "calories": 120,
      "sugar": "28g",
      "addedSugar": "0g"
    },
    "allergens": [],
    "storageInstructions": "Keep refrigerated after opening",
    "shelfLife": "12 months"
  },
  "packaging": {
    "type": "bottle",
    "material": "glass",
    "size": "1L",
    "unitsPerCase": 12,
    "casesPerPallet": 50
  },
  "logistics": {
    "weight": 1.2,
    "weightUnit": "kg",
    "dimensions": {
      "length": 8,
      "width": 8,
      "height": 25,
      "unit": "cm"
    },
    "requiresRefrigeration": true,
    "temperatureRange": {
      "min": 2,
      "max": 8,
      "unit": "celsius"
    }
  },
  "compliance": {
    "certifications": ["USDA Organic", "Non-GMO"],
    "countryOfOrigin": "USA",
    "hsCode": "2009.71"
  }
}
```

### Update Product

```http
PUT /products/{productId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "pricing": {
    "basePrice": 4.49
  },
  "inventory": {
    "quantity": 800
  }
}
```

### Delete Product

```http
DELETE /products/{productId}
Authorization: Bearer <token>
```

### Upload Product Images

```http
POST /products/{productId}/images
Authorization: Bearer <token>
Content-Type: multipart/form-data

images: [file1.jpg, file2.jpg]
```

### Search Products

```http
GET /products/search?q=organic+juice&category=beverages
Authorization: Bearer <token>
```

### Export Products

```http
GET /products/export?format=csv&category=beverages
Authorization: Bearer <token>
```

**Formats:** `json`, `csv`, `excel`

### Bulk Import Products

```http
POST /products/bulk/import
Authorization: Bearer <token>
Content-Type: application/json

{
  "products": [
    {
      "sku": "PROD-001",
      "name": "Product 1",
      "category": "beverages",
      "pricing": {
        "basePrice": 10.99,
        "currency": "USD"
      }
    }
  ]
}
```

## RFQ System Endpoints

### List RFQs

```http
GET /rfqs?status=published&category=beverages&page=1
Authorization: Bearer <token>
```

**Query Parameters:**
- `status`: `draft`, `published`, `closed`, `awarded`, `cancelled`, `expired`
- `category`: Product category filter
- `fromDate`: Start date (ISO 8601)
- `toDate`: End date (ISO 8601)
- `sort`: `createdAt`, `-createdAt`, `dueDate`, `-dueDate`

### Create RFQ

```http
POST /rfqs
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Bulk Beverage Order Q1 2025",
  "description": "Looking for suppliers for our Q1 beverage needs",
  "category": "beverages",
  "tags": ["bulk", "quarterly", "beverages"],
  "items": [
    {
      "name": "Orange Juice - 1L",
      "quantity": 5000,
      "unit": "bottles",
      "targetPrice": 3.50,
      "specifications": "100% pure, no added sugar",
      "requiredCertifications": ["USDA Organic"],
      "preferredBrands": ["Brand A", "Brand B"]
    }
  ],
  "deliveryLocation": {
    "name": "Main Warehouse",
    "address": "123 Commerce St",
    "city": "New York",
    "state": "NY",
    "country": "USA",
    "postalCode": "10001"
  },
  "deliveryTerms": {
    "incoterm": "DDP",
    "instructions": "Deliver to loading dock between 8 AM - 5 PM"
  },
  "deliverySchedule": {
    "type": "recurring",
    "frequency": "weekly",
    "startDate": "2025-02-01",
    "endDate": "2025-04-30"
  },
  "paymentTerms": {
    "method": "net30",
    "currency": "USD",
    "notes": "2% discount for early payment"
  },
  "dueDate": "2025-01-30T23:59:59Z",
  "validUntil": "2025-02-15T23:59:59Z",
  "visibility": "public",
  "selectionCriteria": {
    "priceWeight": 40,
    "qualityWeight": 30,
    "deliveryWeight": 20,
    "certificationWeight": 10
  },
  "compliance": {
    "requiredCertifications": ["USDA Organic", "FDA Approved"],
    "requiredDocuments": ["Certificate of Analysis", "Product Specification Sheet"],
    "qualityStandards": ["ISO 22000"]
  },
  "additionalRequirements": {
    "sampleRequired": true,
    "siteVisitRequired": false,
    "insuranceRequired": true,
    "minimumRating": 4.0
  }
}
```

### Get RFQ Details

```http
GET /rfqs/{rfqId}
Authorization: Bearer <token>
```

### Update RFQ

```http
PUT /rfqs/{rfqId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "description": "Updated description",
  "dueDate": "2025-02-05T23:59:59Z"
}
```

### Publish RFQ

```http
POST /rfqs/{rfqId}/publish
Authorization: Bearer <token>
```

### Submit Quote

```http
POST /rfqs/{rfqId}/quotes
Authorization: Bearer <token>
Content-Type: application/json

{
  "currency": "USD",
  "validUntil": "2025-02-10T23:59:59Z",
  "items": [
    {
      "itemIndex": 0,
      "price": 3.25,
      "quantity": 5000,
      "leadTime": 7,
      "notes": "Can deliver weekly as requested"
    }
  ],
  "deliveryTerms": {
    "canMeetRequirements": true,
    "notes": "We have trucks available for weekly delivery"
  },
  "paymentTerms": {
    "acceptedTerms": ["net30", "net60"],
    "notes": "3% discount for net15"
  },
  "certifications": ["USDA Organic", "FDA Approved", "ISO 22000"],
  "attachments": [
    {
      "name": "Product Catalog 2025.pdf",
      "url": "https://storage.foodxchange.com/quotes/catalog-2025.pdf",
      "type": "catalog"
    }
  ],
  "terms": "Standard terms apply. Prices valid for 30 days.",
  "notes": "We're a local supplier with 20 years experience"
}
```

### Update Quote

```http
PUT /rfqs/{rfqId}/quotes/{quoteId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "items": [
    {
      "itemIndex": 0,
      "price": 3.15
    }
  ]
}
```

### Withdraw Quote

```http
POST /rfqs/{rfqId}/quotes/{quoteId}/withdraw
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Unable to meet delivery timeline"
}
```

### Evaluate Quotes

```http
POST /rfqs/{rfqId}/evaluate
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "evaluation": {
      "quotes": [
        {
          "quoteId": "quote_123",
          "supplierId": "sup_456",
          "score": 85.5,
          "breakdown": {
            "price": 34,
            "quality": 27,
            "delivery": 16,
            "certification": 8.5
          },
          "rank": 1
        }
      ],
      "recommendation": {
        "supplierId": "sup_456",
        "reason": "Best overall score with competitive pricing"
      }
    }
  }
}
```

### Award RFQ

```http
POST /rfqs/{rfqId}/award
Authorization: Bearer <token>
Content-Type: application/json

{
  "supplierId": "sup_456",
  "quoteId": "quote_123",
  "reason": "Best value and meets all requirements"
}
```

### Cancel RFQ

```http
POST /rfqs/{rfqId}/cancel
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Requirements changed"
}
```

### Extend RFQ Deadline

```http
POST /rfqs/{rfqId}/extend-deadline
Authorization: Bearer <token>
Content-Type: application/json

{
  "newDate": "2025-02-10T23:59:59Z"
}
```

## Order Processing

### Create Order

```http
POST /orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "rfqId": "rfq_123",
  "quoteId": "quote_456",
  "items": [
    {
      "productId": "prod_789",
      "sku": "BEV-001",
      "quantity": 5000,
      "unitPrice": 3.25,
      "totalPrice": 16250.00
    }
  ],
  "shippingAddress": {
    "name": "Main Warehouse",
    "address": "123 Commerce St",
    "city": "New York",
    "state": "NY",
    "country": "USA",
    "postalCode": "10001"
  },
  "billingAddress": {
    "sameAsShipping": true
  },
  "paymentMethod": "net30",
  "notes": "Please coordinate delivery time"
}
```

### Get Order Details

```http
GET /orders/{orderId}
Authorization: Bearer <token>
```

### List Orders

```http
GET /orders?status=pending&page=1&pageSize=20
Authorization: Bearer <token>
```

**Query Parameters:**
- `status`: `pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`
- `fromDate`: Filter by creation date
- `toDate`: Filter by creation date
- `supplierId`: Filter by supplier
- `customerId`: Filter by customer

### Update Order Status

```http
PUT /orders/{orderId}/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "confirmed",
  "notes": "Order confirmed and processing started"
}
```

### Cancel Order

```http
POST /orders/{orderId}/cancel
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Customer requested cancellation"
}
```

### Track Order

```http
GET /orders/{orderId}/tracking
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tracking": {
      "carrier": "FedEx",
      "trackingNumber": "1234567890",
      "status": "in_transit",
      "estimatedDelivery": "2025-02-05",
      "events": [
        {
          "timestamp": "2025-02-01T10:00:00Z",
          "status": "picked_up",
          "location": "New York, NY",
          "description": "Package picked up"
        }
      ]
    }
  }
}
```

### Generate Invoice

```http
GET /orders/{orderId}/invoice
Authorization: Bearer <token>
Accept: application/pdf
```

## Compliance Validation

### Validate Product Compliance

```http
POST /compliance/validate/product
Authorization: Bearer <token>
Content-Type: application/json

{
  "productId": "prod_123",
  "targetMarkets": ["USA", "Canada"],
  "certifications": ["USDA Organic", "Non-GMO"],
  "documents": [
    {
      "type": "certificate",
      "url": "https://docs.foodxchange.com/cert-123.pdf"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "validation": {
      "status": "compliant",
      "score": 95,
      "issues": [],
      "recommendations": [
        {
          "type": "certification",
          "message": "Consider adding FDA registration for broader market access",
          "priority": "low"
        }
      ],
      "marketCompliance": {
        "USA": {
          "status": "compliant",
          "requirements": ["FDA", "USDA"],
          "missing": []
        },
        "Canada": {
          "status": "compliant",
          "requirements": ["CFIA"],
          "missing": []
        }
      }
    }
  }
}
```

### Validate Document

```http
POST /compliance/validate/document
Authorization: Bearer <token>
Content-Type: multipart/form-data

document: certificate.pdf
type: "certificate"
```

### Check RFQ Compliance

```http
POST /compliance/check/rfq/{rfqId}
Authorization: Bearer <token>
```

### Get Compliance Requirements

```http
GET /compliance/requirements?country=USA&category=beverages
Authorization: Bearer <token>
```

### Generate Compliance Report

```http
GET /compliance/report/{entityType}/{entityId}
Authorization: Bearer <token>
Accept: application/pdf
```

## WebSocket Events

### Connection

```javascript
const socket = io('wss://api.foodxchange.com', {
  auth: {
    token: 'Bearer <token>'
  },
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('Connected to WebSocket');
});
```

### RFQ Events

#### Subscribe to RFQ Updates
```javascript
socket.emit('subscribe_rfq', { rfqId: 'rfq_123' });
```

#### RFQ Update Event
```javascript
socket.on('rfq_update', (data) => {
  console.log('RFQ Updated:', data);
  // {
  //   rfqId: 'rfq_123',
  //   status: 'published',
  //   updatedBy: 'usr_456',
  //   timestamp: '2025-01-23T12:00:00Z'
  // }
});
```

#### New Quote Event
```javascript
socket.on('quote_received', (data) => {
  console.log('New Quote:', data);
  // {
  //   rfqId: 'rfq_123',
  //   quoteId: 'quote_789',
  //   supplierId: 'sup_456',
  //   timestamp: '2025-01-23T12:00:00Z'
  // }
});
```

### Order Events

#### Order Status Update
```javascript
socket.on('order_update', (data) => {
  console.log('Order Updated:', data);
  // {
  //   orderId: 'ord_123',
  //   status: 'shipped',
  //   trackingNumber: '1234567890',
  //   timestamp: '2025-01-23T12:00:00Z'
  // }
});
```

### Compliance Events

#### Compliance Alert
```javascript
socket.on('compliance_alert', (data) => {
  console.log('Compliance Alert:', data);
  // {
  //   type: 'certification_expiring',
  //   entityId: 'cert_123',
  //   message: 'USDA Organic certification expires in 30 days',
  //   severity: 'warning',
  //   timestamp: '2025-01-23T12:00:00Z'
  // }
});
```

### User Activity Events

#### User Presence
```javascript
socket.on('user_activity', (data) => {
  console.log('User Activity:', data);
  // {
  //   userId: 'usr_456',
  //   status: 'online',
  //   currentRfq: 'rfq_123',
  //   lastSeen: '2025-01-23T12:00:00Z'
  // }
});
```

### Collaboration Events

#### Typing Indicator
```javascript
// Send typing indicator
socket.emit('typing_indicator', {
  rfqId: 'rfq_123',
  isTyping: true
});

// Receive typing indicator
socket.on('typing_indicator', (data) => {
  console.log('User typing:', data);
  // {
  //   rfqId: 'rfq_123',
  //   userId: 'usr_456',
  //   userName: 'John Doe',
  //   isTyping: true
  // }
});
```

#### Collaboration Message
```javascript
// Send message
socket.emit('collaboration_message', {
  rfqId: 'rfq_123',
  message: 'What about delivery terms?',
  metadata: {
    type: 'question',
    priority: 'high'
  }
});

// Receive message
socket.on('collaboration_message', (data) => {
  console.log('New message:', data);
});
```

## Rate Limiting

### Default Limits

- **API Endpoints**: 100 requests per 15 minutes per IP
- **Search Endpoints**: 30 requests per minute per IP
- **RFQ Creation**: 10 requests per hour per user
- **File Upload**: 20 requests per hour per user

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1706016000
```

### Rate Limit Response

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests, please try again later",
    "retryAfter": 900
  }
}
```

## SDK Examples

### JavaScript/TypeScript SDK

```typescript
import { FoodXchangeClient } from '@foodxchange/sdk';

const client = new FoodXchangeClient({
  apiKey: 'your-api-key',
  environment: 'production'
});

// Authentication
const { user, tokens } = await client.auth.login({
  email: 'user@example.com',
  password: 'password123'
});

// Set auth token
client.setAuthToken(tokens.accessToken);

// Product operations
const products = await client.products.list({
  category: 'beverages',
  page: 1,
  pageSize: 20
});

const product = await client.products.create({
  name: 'New Product',
  sku: 'SKU-001',
  category: 'beverages',
  pricing: {
    basePrice: 10.99,
    currency: 'USD'
  }
});

// RFQ operations
const rfq = await client.rfqs.create({
  title: 'Bulk Order Q1',
  items: [{
    name: 'Product 1',
    quantity: 1000
  }],
  dueDate: new Date('2025-02-01')
});

// Submit quote
const quote = await client.rfqs.submitQuote(rfq.id, {
  items: [{
    itemIndex: 0,
    price: 9.99,
    quantity: 1000
  }],
  validUntil: new Date('2025-02-15')
});

// WebSocket connection
const socket = client.createWebSocket();

socket.on('rfq_update', (data) => {
  console.log('RFQ updated:', data);
});

socket.subscribe('rfq', rfq.id);
```

### Python SDK

```python
from foodxchange import FoodXchangeClient

client = FoodXchangeClient(
    api_key='your-api-key',
    environment='production'
)

# Authentication
auth_response = client.auth.login(
    email='user@example.com',
    password='password123'
)

client.set_auth_token(auth_response['tokens']['accessToken'])

# Product operations
products = client.products.list(
    category='beverages',
    page=1,
    page_size=20
)

product = client.products.create({
    'name': 'New Product',
    'sku': 'SKU-001',
    'category': 'beverages',
    'pricing': {
        'basePrice': 10.99,
        'currency': 'USD'
    }
})

# RFQ operations
rfq = client.rfqs.create({
    'title': 'Bulk Order Q1',
    'items': [{
        'name': 'Product 1',
        'quantity': 1000
    }],
    'dueDate': '2025-02-01T00:00:00Z'
})

# WebSocket connection
def on_rfq_update(data):
    print(f"RFQ updated: {data}")

socket = client.create_websocket()
socket.on('rfq_update', on_rfq_update)
socket.subscribe('rfq', rfq['id'])
socket.connect()
```

### cURL Examples

```bash
# Login
curl -X POST https://api.foodxchange.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'

# List products
curl -X GET "https://api.foodxchange.com/v1/products?category=beverages" \
  -H "Authorization: Bearer <token>"

# Create RFQ
curl -X POST https://api.foodxchange.com/v1/rfqs \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Bulk Order Q1",
    "items": [{
      "name": "Product 1",
      "quantity": 1000
    }],
    "dueDate": "2025-02-01T00:00:00Z"
  }'
```

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  },
  "timestamp": "2025-01-23T12:00:00Z",
  "requestId": "req_123456789"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `DUPLICATE_ENTRY` | 409 | Resource already exists |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

### Validation Errors

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "pricing.basePrice",
        "message": "Base price must be greater than 0",
        "value": -5
      },
      {
        "field": "category",
        "message": "Invalid category",
        "value": "invalid_category",
        "allowedValues": ["beverages", "dairy", "meat", "seafood"]
      }
    ]
  }
}
```

### Business Logic Errors

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_INVENTORY",
    "message": "Requested quantity exceeds available inventory",
    "details": {
      "requested": 5000,
      "available": 2500,
      "productId": "prod_123"
    }
  }
}
```

## API Versioning

### Version Header

```http
X-API-Version: 1.0
```

### Version in URL

```
https://api.foodxchange.com/v1/products
https://api.foodxchange.com/v2/products
```

### Deprecation Notice

```http
X-API-Deprecation: true
X-API-Deprecation-Date: 2025-12-31
X-API-Sunset-Date: 2026-06-30
```

## Testing

### Test Environment

- **Base URL**: `https://sandbox.foodxchange.com/v1`
- **Test Credentials**: Available in developer portal
- **Rate Limits**: 10x higher than production

### Test Data

```json
{
  "testUsers": [
    {
      "email": "buyer@test.foodxchange.com",
      "password": "TestPass123!",
      "role": "buyer"
    },
    {
      "email": "seller@test.foodxchange.com",
      "password": "TestPass123!",
      "role": "seller"
    }
  ],
  "testProducts": ["prod_test_001", "prod_test_002"],
  "testRFQs": ["rfq_test_001", "rfq_test_002"]
}
```

## Support

- **Documentation**: [https://docs.foodxchange.com](https://docs.foodxchange.com)
- **API Status**: [https://status.foodxchange.com](https://status.foodxchange.com)
- **Developer Portal**: [https://developers.foodxchange.com](https://developers.foodxchange.com)
- **Support Email**: api-support@foodxchange.com

---

**Version**: 1.0  
**Last Updated**: January 2025