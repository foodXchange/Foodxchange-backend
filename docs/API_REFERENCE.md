# API Reference

Complete API documentation for FoodXchange Backend v2.0.

## Base Information

### Base URLs
- **Development**: `http://localhost:5000/api/v1`
- **Staging**: `https://staging-api.foodxchange.com/api/v1`
- **Production**: `https://api.foodxchange.com/api/v1`

### Authentication
All API requests require authentication unless specified otherwise.

```http
Authorization: Bearer <jwt-token>
X-API-Key: <api-key>  # Alternative for B2B integrations
```

### Response Format
All responses follow this structure:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "metadata": {
    "timestamp": "2025-07-23T10:00:00Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "version": "1.0",
    "processingTime": 45
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Error Response
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "field": ["error message"]
    }
  },
  "metadata": {}
}
```

## Authentication Endpoints

### Register User
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe",
  "company": {
    "name": "ABC Foods Ltd",
    "type": "buyer",
    "taxId": "123456789"
  },
  "role": "buyer"
}

Response: 201 Created
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "role": "buyer",
      "verified": false
    },
    "tokens": {
      "access": "eyJhbGc...",
      "refresh": "eyJhbGc...",
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
  "password": "SecurePassword123!"
}

Response: 200 OK
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "role": "buyer"
    },
    "tokens": {
      "access": "eyJhbGc...",
      "refresh": "eyJhbGc...",
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
  "refreshToken": "eyJhbGc..."
}

Response: 200 OK
{
  "success": true,
  "data": {
    "tokens": {
      "access": "eyJhbGc...",
      "refresh": "eyJhbGc...",
      "expiresIn": 3600
    }
  }
}
```

### Logout
```http
POST /auth/logout
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "message": "Logged out successfully"
  }
}
```

## Product Endpoints

### List Products
```http
GET /products?category=vegetables&status=active&page=1&limit=20&sort=-createdAt
Authorization: Bearer <token>

Query Parameters:
- category: string (optional) - Filter by category
- status: string (optional) - active, inactive, draft
- minPrice: number (optional) - Minimum price
- maxPrice: number (optional) - Maximum price
- search: string (optional) - Search in name and description
- page: number (default: 1) - Page number
- limit: number (default: 20, max: 100) - Items per page
- sort: string (default: -createdAt) - Sort field with - for descending

Response: 200 OK
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "prod_123",
        "sku": "VEG-TOM-001",
        "name": "Organic Tomatoes",
        "description": "Fresh organic tomatoes from local farms",
        "category": ["vegetables", "organic"],
        "pricing": {
          "basePrice": {
            "amount": 5.99,
            "currency": "USD"
          },
          "unit": "kg",
          "tiers": [
            {
              "minQuantity": 100,
              "price": 5.49
            },
            {
              "minQuantity": 500,
              "price": 4.99
            }
          ]
        },
        "inventory": {
          "available": 1000,
          "reserved": 50,
          "unit": "kg"
        },
        "media": {
          "images": [
            {
              "url": "https://cdn.foodxchange.com/products/tomatoes-1.jpg",
              "alt": "Organic tomatoes",
              "isPrimary": true
            }
          ]
        },
        "compliance": {
          "certifications": ["ORGANIC", "GAP"],
          "allergens": [],
          "nutrition": {
            "calories": 18,
            "protein": 0.9,
            "carbs": 3.9,
            "fat": 0.2
          }
        },
        "supplier": {
          "id": "company_456",
          "name": "Green Farms Ltd",
          "rating": 4.8
        },
        "createdAt": "2025-07-20T10:00:00Z",
        "updatedAt": "2025-07-23T08:30:00Z"
      }
    ]
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Get Product Details
```http
GET /products/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "product": {
      // Full product object
    }
  }
}
```

### Create Product
```http
POST /products
Authorization: Bearer <token>
Content-Type: application/json

{
  "sku": "VEG-TOM-001",
  "name": "Organic Tomatoes",
  "description": "Fresh organic tomatoes",
  "category": ["vegetables", "organic"],
  "pricing": {
    "basePrice": {
      "amount": 5.99,
      "currency": "USD"
    },
    "unit": "kg"
  },
  "inventory": {
    "available": 1000,
    "unit": "kg"
  }
}

Response: 201 Created
{
  "success": true,
  "data": {
    "product": {
      // Created product object
    }
  }
}
```

### Update Product
```http
PUT /products/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "pricing": {
    "basePrice": {
      "amount": 6.49
    }
  },
  "inventory": {
    "available": 800
  }
}

Response: 200 OK
{
  "success": true,
  "data": {
    "product": {
      // Updated product object
    }
  }
}
```

### Delete Product
```http
DELETE /products/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "message": "Product deleted successfully"
  }
}
```

### Bulk Operations
```http
POST /products/bulk
Authorization: Bearer <token>
Content-Type: application/json

{
  "operation": "update",
  "filters": {
    "category": "vegetables"
  },
  "data": {
    "status": "inactive"
  }
}

Response: 200 OK
{
  "success": true,
  "data": {
    "affected": 25,
    "message": "25 products updated successfully"
  }
}
```

## RFQ (Request for Quote) Endpoints

### Create RFQ
```http
POST /rfqs
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Bulk Vegetable Order Q3 2025",
  "description": "Looking for suppliers for quarterly vegetable supply",
  "items": [
    {
      "productId": "prod_123",
      "quantity": 1000,
      "unit": "kg",
      "specifications": "Organic certified, delivered weekly"
    }
  ],
  "requirements": {
    "delivery": {
      "location": "New York, NY",
      "schedule": "weekly",
      "startDate": "2025-08-01"
    },
    "payment": {
      "terms": "NET30",
      "method": ["bank_transfer", "credit"]
    },
    "compliance": ["ORGANIC", "GAP"]
  },
  "expiryDate": "2025-07-30T23:59:59Z"
}

Response: 201 Created
{
  "success": true,
  "data": {
    "rfq": {
      "id": "rfq_789",
      "number": "RFQ-2025-0123",
      "status": "open",
      "matchedSuppliers": 12
    }
  }
}
```

### List RFQs
```http
GET /rfqs?status=open&category=vegetables
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "rfqs": [
      {
        "id": "rfq_789",
        "number": "RFQ-2025-0123",
        "title": "Bulk Vegetable Order Q3 2025",
        "status": "open",
        "buyer": {
          "id": "company_111",
          "name": "Restaurant Chain ABC"
        },
        "items": 3,
        "proposalCount": 5,
        "expiryDate": "2025-07-30T23:59:59Z",
        "createdAt": "2025-07-23T10:00:00Z"
      }
    ]
  },
  "pagination": {}
}
```

### Submit Proposal
```http
POST /rfqs/:id/proposals
Authorization: Bearer <token>
Content-Type: application/json

{
  "items": [
    {
      "rfqItemId": "item_001",
      "unitPrice": 5.25,
      "totalPrice": 5250,
      "notes": "Can deliver weekly as requested"
    }
  ],
  "totalAmount": 5250,
  "validUntil": "2025-07-29T23:59:59Z",
  "terms": {
    "payment": "NET30",
    "delivery": "FOB Origin"
  },
  "attachments": [
    {
      "name": "Product Catalog.pdf",
      "url": "https://cdn.foodxchange.com/docs/catalog.pdf"
    }
  ]
}

Response: 201 Created
{
  "success": true,
  "data": {
    "proposal": {
      "id": "proposal_456",
      "status": "submitted",
      "rfqId": "rfq_789"
    }
  }
}
```

### Award RFQ
```http
POST /rfqs/:id/award
Authorization: Bearer <token>
Content-Type: application/json

{
  "proposalId": "proposal_456",
  "notes": "Best price and terms"
}

Response: 200 OK
{
  "success": true,
  "data": {
    "rfq": {
      "id": "rfq_789",
      "status": "awarded",
      "awardedTo": "company_456",
      "orderId": "order_999"
    }
  }
}
```

## Order Endpoints

### Create Order
```http
POST /orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "standard",
  "source": "rfq",
  "sourceId": "rfq_789",
  "items": [
    {
      "productId": "prod_123",
      "quantity": 1000,
      "unitPrice": 5.25,
      "totalPrice": 5250
    }
  ],
  "shipping": {
    "address": {
      "line1": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zipCode": "10001",
      "country": "US"
    },
    "method": "standard",
    "instructions": "Deliver to loading dock"
  },
  "payment": {
    "method": "bank_transfer",
    "terms": "NET30"
  }
}

Response: 201 Created
{
  "success": true,
  "data": {
    "order": {
      "id": "order_999",
      "number": "ORD-2025-0456",
      "status": "pending",
      "total": 5250,
      "estimatedDelivery": "2025-08-05"
    }
  }
}
```

### List Orders
```http
GET /orders?status=pending,processing&startDate=2025-07-01
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "order_999",
        "number": "ORD-2025-0456",
        "status": "processing",
        "buyer": {
          "id": "company_111",
          "name": "Restaurant Chain ABC"
        },
        "supplier": {
          "id": "company_456",
          "name": "Green Farms Ltd"
        },
        "total": 5250,
        "currency": "USD",
        "createdAt": "2025-07-23T11:00:00Z",
        "estimatedDelivery": "2025-08-05"
      }
    ]
  },
  "pagination": {}
}
```

### Update Order Status
```http
PATCH /orders/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "shipped",
  "tracking": {
    "carrier": "FedEx",
    "trackingNumber": "1234567890",
    "estimatedDelivery": "2025-08-05T14:00:00Z"
  }
}

Response: 200 OK
{
  "success": true,
  "data": {
    "order": {
      "id": "order_999",
      "status": "shipped",
      "tracking": {
        "carrier": "FedEx",
        "trackingNumber": "1234567890",
        "url": "https://fedex.com/track/1234567890"
      }
    }
  }
}
```

### Cancel Order
```http
POST /orders/:id/cancel
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "customer_request",
  "notes": "Customer changed requirements"
}

Response: 200 OK
{
  "success": true,
  "data": {
    "order": {
      "id": "order_999",
      "status": "cancelled",
      "cancelledAt": "2025-07-23T12:00:00Z"
    }
  }
}
```

## Compliance Endpoints

### Validate Compliance
```http
POST /compliance/validate
Authorization: Bearer <token>
Content-Type: application/json

{
  "productId": "prod_123",
  "market": "EU",
  "certifications": ["ORGANIC", "GAP"],
  "specifications": {
    "pesticides": 0.01,
    "origin": "USA"
  }
}

Response: 200 OK
{
  "success": true,
  "data": {
    "validation": {
      "status": "passed",
      "market": "EU",
      "results": [
        {
          "rule": "pesticide_limits",
          "status": "passed",
          "details": "Within EU limits"
        },
        {
          "rule": "organic_certification",
          "status": "passed",
          "details": "Valid ORGANIC certification"
        }
      ],
      "validUntil": "2025-12-31T23:59:59Z"
    }
  }
}
```

### Upload Certification
```http
POST /compliance/certifications
Authorization: Bearer <token>
Content-Type: multipart/form-data

{
  "type": "ORGANIC",
  "file": <file>,
  "validFrom": "2025-01-01",
  "validTo": "2025-12-31",
  "issuedBy": "USDA"
}

Response: 201 Created
{
  "success": true,
  "data": {
    "certification": {
      "id": "cert_567",
      "type": "ORGANIC",
      "status": "pending_verification",
      "documentUrl": "https://cdn.foodxchange.com/certs/cert_567.pdf"
    }
  }
}
```

## Analytics Endpoints

### Dashboard Metrics
```http
GET /analytics/dashboard?period=last30days
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "metrics": {
      "orders": {
        "total": 156,
        "value": 125670,
        "change": "+12.5%"
      },
      "products": {
        "active": 234,
        "views": 15670,
        "conversion": "3.2%"
      },
      "rfqs": {
        "open": 23,
        "awarded": 45,
        "successRate": "78%"
      }
    },
    "charts": {
      "salesTrend": [
        {
          "date": "2025-07-01",
          "value": 4500
        }
      ],
      "topProducts": [
        {
          "name": "Organic Tomatoes",
          "sales": 45000
        }
      ]
    }
  }
}
```

### Generate Report
```http
POST /analytics/reports
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "sales",
  "period": {
    "start": "2025-07-01",
    "end": "2025-07-31"
  },
  "format": "pdf",
  "email": "manager@company.com"
}

Response: 202 Accepted
{
  "success": true,
  "data": {
    "report": {
      "id": "report_123",
      "status": "processing",
      "estimatedTime": 300
    }
  }
}
```

## WebSocket Events

### Connection
```javascript
const socket = io('wss://api.foodxchange.com', {
  auth: {
    token: 'Bearer <jwt-token>'
  }
});

socket.on('connect', () => {
  console.log('Connected to WebSocket');
});
```

### Subscribe to Events
```javascript
// Join rooms
socket.emit('join', {
  rooms: ['orders', 'rfqs', 'chat']
});

// Order updates
socket.on('order:update', (data) => {
  console.log('Order updated:', data);
  // {
  //   orderId: 'order_999',
  //   status: 'shipped',
  //   timestamp: '2025-07-23T12:00:00Z'
  // }
});

// RFQ notifications
socket.on('rfq:new_proposal', (data) => {
  console.log('New proposal received:', data);
});

// Chat messages
socket.on('chat:message', (data) => {
  console.log('New message:', data);
});
```

### Send Events
```javascript
// Send chat message
socket.emit('chat:send', {
  roomId: 'order_999',
  message: 'When will the order be delivered?'
});

// Update order status (if authorized)
socket.emit('order:update_status', {
  orderId: 'order_999',
  status: 'delivered'
});
```

## Rate Limiting

API rate limits are enforced per user and endpoint:

| Endpoint Type | Rate Limit | Window |
|--------------|------------|--------|
| Authentication | 5 requests | 1 minute |
| Public endpoints | 100 requests | 1 minute |
| Standard API | 1000 requests | 1 hour |
| Premium API | 10000 requests | 1 hour |
| Bulk operations | 10 requests | 1 hour |

Rate limit headers:
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1627891200
```

## Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Invalid input data |
| `AUTHENTICATION_ERROR` | Invalid or expired token |
| `AUTHORIZATION_ERROR` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `CONFLICT` | Resource conflict (e.g., duplicate) |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `INTERNAL_ERROR` | Server error |
| `SERVICE_UNAVAILABLE` | Service temporarily unavailable |

## SDKs and Code Examples

### JavaScript/Node.js
```javascript
const FoodXchangeAPI = require('@foodxchange/sdk');

const api = new FoodXchangeAPI({
  apiKey: 'your-api-key',
  environment: 'production'
});

// Get products
const products = await api.products.list({
  category: 'vegetables',
  limit: 20
});

// Create order
const order = await api.orders.create({
  items: [...],
  shipping: {...}
});
```

### Python
```python
from foodxchange import Client

client = Client(api_key='your-api-key')

# Get products
products = client.products.list(
    category='vegetables',
    limit=20
)

# Create order
order = client.orders.create(
    items=[...],
    shipping={...}
)
```

### cURL Examples
```bash
# Get products
curl -X GET "https://api.foodxchange.com/api/v1/products?category=vegetables" \
  -H "Authorization: Bearer <token>"

# Create order
curl -X POST "https://api.foodxchange.com/api/v1/orders" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"items":[...],"shipping":{...}}'
```

## Postman Collection

Download our Postman collection for easy API testing:
[Download Postman Collection](https://api.foodxchange.com/docs/postman-collection.json)

## OpenAPI Specification

Access our OpenAPI 3.0 specification:
- Swagger UI: https://api.foodxchange.com/api-docs
- OpenAPI JSON: https://api.foodxchange.com/openapi.json

---

For more information, visit our [Developer Portal](https://developers.foodxchange.com) or contact support@foodxchange.com.