# Authentication

## Overview

The FoodXchange API uses JWT (JSON Web Tokens) for authentication. All API requests must include a valid JWT token in the Authorization header.

## Authentication Flow

### 1. User Registration

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe",
  "company": "Acme Food Corp",
  "role": "buyer"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user123",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "buyer",
      "company": {
        "id": "comp123",
        "name": "Acme Food Corp"
      }
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": 3600
    }
  },
  "message": "User registered successfully"
}
```

### 2. User Login

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user123",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "buyer",
      "company": {
        "id": "comp123",
        "name": "Acme Food Corp"
      }
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": 3600
    }
  },
  "message": "Login successful"
}
```

### 3. Using Access Tokens

Include the access token in the Authorization header for all API requests:

```http
GET /api/v1/products
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. Token Refresh

When your access token expires, use the refresh token to get a new one:

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600
  },
  "message": "Token refreshed successfully"
}
```

## Two-Factor Authentication (2FA)

### Enable 2FA

```http
POST /api/v1/auth/2fa/enable
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "method": "totp"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "backupCodes": [
      "12345678",
      "87654321",
      "11111111"
    ]
  },
  "message": "2FA setup initiated"
}
```

### Verify 2FA Setup

```http
POST /api/v1/auth/2fa/verify
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "token": "123456"
}
```

### Login with 2FA

After entering email/password, if 2FA is enabled:

```http
POST /api/v1/auth/2fa/authenticate
Content-Type: application/json

{
  "sessionId": "temp-session-id",
  "token": "123456"
}
```

## Password Reset

### Request Password Reset

```http
POST /api/v1/auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset email sent"
}
```

### Reset Password

```http
POST /api/v1/auth/reset-password
Content-Type: application/json

{
  "token": "reset-token-from-email",
  "password": "newSecurePassword123",
  "confirmPassword": "newSecurePassword123"
}
```

## Session Management

### Get Current Session

```http
GET /api/v1/auth/session
Authorization: Bearer <access-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user123",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "buyer",
      "company": {
        "id": "comp123",
        "name": "Acme Food Corp"
      }
    },
    "session": {
      "id": "session123",
      "createdAt": "2023-12-01T10:00:00Z",
      "expiresAt": "2023-12-01T11:00:00Z",
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0..."
    }
  }
}
```

### Logout

```http
POST /api/v1/auth/logout
Authorization: Bearer <access-token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

### Logout All Sessions

```http
POST /api/v1/auth/logout-all
Authorization: Bearer <access-token>
```

## Security Best Practices

### Token Storage

**Do:**
- Store tokens securely (e.g., secure HTTP-only cookies for web apps)
- Use secure storage mechanisms on mobile devices
- Implement token refresh logic

**Don't:**
- Store tokens in localStorage (web)
- Log tokens in application logs
- Transmit tokens over insecure connections

### Token Validation

- Always validate tokens on the server side
- Check token expiration
- Verify token signature
- Validate user permissions

### Rate Limiting

Authentication endpoints have strict rate limits:
- Login: 5 attempts per 15 minutes per IP
- Registration: 3 attempts per hour per IP
- Password reset: 3 attempts per hour per email

## Error Handling

### Common Authentication Errors

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```

```json
{
  "success": false,
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "Access token has expired"
  }
}
```

```json
{
  "success": false,
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Account has been locked due to too many failed attempts"
  }
}
```

```json
{
  "success": false,
  "error": {
    "code": "2FA_REQUIRED",
    "message": "Two-factor authentication is required",
    "data": {
      "sessionId": "temp-session-id"
    }
  }
}
```

## JWT Token Structure

### Access Token Claims

```json
{
  "sub": "user123",
  "email": "user@example.com",
  "role": "buyer",
  "tenantId": "tenant123",
  "companyId": "comp123",
  "iat": 1701428400,
  "exp": 1701432000,
  "type": "access"
}
```

### Refresh Token Claims

```json
{
  "sub": "user123",
  "sessionId": "session123",
  "iat": 1701428400,
  "exp": 1701514800,
  "type": "refresh"
}
```

## API Key Authentication

For server-to-server integrations, API keys can be used:

### Generate API Key

```http
POST /api/v1/auth/api-keys
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "name": "Integration API Key",
  "permissions": ["read:products", "write:orders"],
  "expiresAt": "2024-12-01T00:00:00Z"
}
```

### Use API Key

```http
GET /api/v1/products
Authorization: ApiKey <api-key>
```

## Multi-Tenant Considerations

- Each company operates in its own tenant
- Tokens are scoped to a specific tenant
- Cross-tenant access is not permitted
- Tenant isolation is enforced at the API level

## Testing Authentication

### Sandbox Credentials

For testing, use these sandbox credentials:

```
Email: test@foodxchange.com
Password: TestPassword123
```

### Test Tokens

Generate test tokens for development:

```http
POST /api/v1/auth/test-token
Content-Type: application/json

{
  "userId": "test-user",
  "role": "buyer",
  "tenantId": "test-tenant"
}
```

## Integration Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

class FoodXchangeAuth {
  constructor(baseURL) {
    this.baseURL = baseURL;
    this.accessToken = null;
    this.refreshToken = null;
  }

  async login(email, password) {
    const response = await axios.post(`${this.baseURL}/auth/login`, {
      email,
      password
    });

    this.accessToken = response.data.data.tokens.accessToken;
    this.refreshToken = response.data.data.tokens.refreshToken;
    
    return response.data.data.user;
  }

  async refreshAccessToken() {
    const response = await axios.post(`${this.baseURL}/auth/refresh`, {
      refreshToken: this.refreshToken
    });

    this.accessToken = response.data.data.accessToken;
    return this.accessToken;
  }

  getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.accessToken}`
    };
  }
}
```

### Python

```python
import requests
from datetime import datetime, timedelta

class FoodXchangeAuth:
    def __init__(self, base_url):
        self.base_url = base_url
        self.access_token = None
        self.refresh_token = None
        self.token_expires_at = None

    def login(self, email, password):
        response = requests.post(f"{self.base_url}/auth/login", json={
            "email": email,
            "password": password
        })
        
        data = response.json()["data"]
        self.access_token = data["tokens"]["accessToken"]
        self.refresh_token = data["tokens"]["refreshToken"]
        self.token_expires_at = datetime.now() + timedelta(seconds=data["tokens"]["expiresIn"])
        
        return data["user"]

    def refresh_access_token(self):
        response = requests.post(f"{self.base_url}/auth/refresh", json={
            "refreshToken": self.refresh_token
        })
        
        data = response.json()["data"]
        self.access_token = data["accessToken"]
        self.token_expires_at = datetime.now() + timedelta(seconds=data["expiresIn"])
        
        return self.access_token

    def get_auth_headers(self):
        if self.token_expires_at and datetime.now() >= self.token_expires_at:
            self.refresh_access_token()
        
        return {
            "Authorization": f"Bearer {self.access_token}"
        }
```