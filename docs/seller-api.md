# Seller API Documentation

## Authentication Endpoints

### Register Seller
POST /api/sellers/register
Body: {
  email: string,
  password: string,
  companyName: string,
  contactName: string,
  phone: string,
  country: string,
  productCategories: array,
  description: string
}

### Login Seller
POST /api/auth/login
Body: {
  email: string,
  password: string
}

## Seller Dashboard

### Get Dashboard Data
GET /api/sellers/dashboard
Headers: Authorization: Bearer {token}

### Get Analytics
GET /api/sellers/analytics?startDate={date}&endDate={date}
Headers: Authorization: Bearer {token}

## Profile Management

### Get Profile
GET /api/sellers/profile
Headers: Authorization: Bearer {token}

### Update Profile
PUT /api/sellers/profile
Headers: Authorization: Bearer {token}
Body: {
  companyName: string,
  contactName: string,
  phone: string,
  address: object,
  description: string,
  productCategories: array,
  certifications: object,
  preferences: object
}

## Product Management

### Get Products
GET /api/sellers/products
Headers: Authorization: Bearer {token}

### Create Product
POST /api/sellers/products
Headers: Authorization: Bearer {token}
Body: {
  name: string,
  category: string,
  description: string,
  price: number,
  unit: string,
  minimumOrder: number,
  images: array
}

### Update Product
PUT /api/sellers/products/:id
Headers: Authorization: Bearer {token}

### Delete Product
DELETE /api/sellers/products/:id
Headers: Authorization: Bearer {token}

## Order Management

### Get Orders
GET /api/sellers/orders
Headers: Authorization: Bearer {token}

### Get Order Details
GET /api/sellers/orders/:id
Headers: Authorization: Bearer {token}

### Update Order Status
PUT /api/sellers/orders/:id/status
Headers: Authorization: Bearer {token}
Body: {
  status: string
}

## Sample Management

### Get Samples
GET /api/sellers/samples
Headers: Authorization: Bearer {token}

### Update Sample Status
PUT /api/sellers/samples/:id
Headers: Authorization: Bearer {token}
Body: {
  status: string,
  trackingNumber: string,
  notes: string
}

## Document Management

### Get Documents
GET /api/sellers/documents
Headers: Authorization: Bearer {token}

### Upload Document
POST /api/sellers/documents
Headers: Authorization: Bearer {token}
Body: FormData with file

### Delete Document
DELETE /api/sellers/documents/:id
Headers: Authorization: Bearer {token}

## Messaging

### Get Messages
GET /api/sellers/messages
Headers: Authorization: Bearer {token}

### Send Message
POST /api/sellers/messages
Headers: Authorization: Bearer {token}
Body: {
  recipientId: string,
  message: string,
  rfqId: string (optional)
}

### Get Conversation
GET /api/sellers/messages/:conversationId
Headers: Authorization: Bearer {token}
