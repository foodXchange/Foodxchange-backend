# Authentication API

## Overview
The FoodXchange authentication system uses JWT (JSON Web Tokens) with refresh token support, role-based access control, and session management via Redis. The system supports multiple user roles and includes security features like rate limiting and account lockout.

## Authentication Flow

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant Database
    participant Redis
    
    Client->>API: POST /api/auth/login
    API->>Database: Validate credentials
    Database-->>API: User data
    API->>Redis: Store session
    API-->>Client: Access + Refresh tokens
    
    Note over Client: Use access token for API calls
    
    Client->>API: API request with token
    API->>Redis: Validate session
    API-->>Client: Protected resource
    
    Note over Client: When access token expires
    
    Client->>API: POST /api/auth/refresh
    API->>Redis: Validate refresh token
    API-->>Client: New access token
```

## Endpoints

### POST /api/auth/register
Register a new user account.

**Request:**
```json
{
  "email": "user@company.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "role": "buyer",
  "company": "Acme Food Corp",
  "phone": "+1234567890",
  "companyAddress": {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA"
  }
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "userId": "64f5a8b9c123456789abcdef",
    "email": "user@company.com",
    "role": "buyer",
    "accountStatus": "active",
    "verificationRequired": true
  }
}
```

**Validation Rules:**
- Email must be unique and valid format
- Password: minimum 8 characters, uppercase, lowercase, number, special character
- Role must be one of: `buyer`, `seller`, `admin`, `contractor`, `agent`
- Company name required for business roles

### POST /api/auth/login
Authenticate user and receive access tokens.

**Request:**
```json
{
  "email": "user@company.com",
  "password": "SecurePass123!",
  "deviceId": "web-browser-12345",
  "rememberMe": true
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": 604800,
    "user": {
      "id": "64f5a8b9c123456789abcdef",
      "email": "user@company.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "buyer",
      "permissions": [
        "read:products",
        "write:rfq",
        "read:orders",
        "write:orders"
      ],
      "company": {
        "id": "64f5a8b9c123456789abcde0",
        "name": "Acme Food Corp",
        "verified": true
      },
      "profileCompletionPercentage": 85,
      "lastLogin": "2024-01-15T10:30:00Z"
    }
  }
}
```

**Error Responses:**
```json
// Invalid credentials (401)
{
  "success": false,
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Invalid email or password",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}

// Account locked (423)
{
  "success": false,
  "error": {
    "code": "AUTH_ACCOUNT_LOCKED",
    "message": "Account locked due to multiple failed login attempts",
    "retryAfter": 1800,
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### POST /api/auth/refresh
Refresh an expired access token using a valid refresh token.

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": 604800
  }
}
```

### POST /api/auth/logout
Invalidate current session and tokens.

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Request:**
```json
{
  "deviceId": "web-browser-12345",
  "logoutAllDevices": false
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### POST /api/auth/forgot-password
Initiate password reset process.

**Request:**
```json
{
  "email": "user@company.com"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Password reset instructions sent to email"
}
```

### POST /api/auth/reset-password
Reset password using reset token.

**Request:**
```json
{
  "resetToken": "abc123def456",
  "newPassword": "NewSecurePass123!",
  "confirmPassword": "NewSecurePass123!"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

### GET /api/auth/profile
Get current user profile information.

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "64f5a8b9c123456789abcdef",
    "email": "user@company.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "buyer",
    "company": {
      "id": "64f5a8b9c123456789abcde0",
      "name": "Acme Food Corp",
      "verified": true,
      "address": {
        "street": "123 Main St",
        "city": "New York",
        "state": "NY",
        "zipCode": "10001",
        "country": "USA"
      }
    },
    "preferences": {
      "notifications": {
        "email": true,
        "sms": false,
        "push": true
      },
      "language": "en",
      "timezone": "America/New_York"
    },
    "accountStatus": "active",
    "profileCompletionPercentage": 85,
    "lastLogin": "2024-01-15T10:30:00Z",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

## Authentication Middleware

### Usage in Routes
```typescript
import { authenticate, requireRole, requirePermissions } from '../middleware/auth.middleware';

// Basic authentication required
router.get('/protected', authenticate, controller.method);

// Role-based access
router.post('/admin-only', authenticate, requireRole('admin'), controller.method);

// Permission-based access
router.put('/products', authenticate, requirePermissions('write:products'), controller.method);

// Multiple roles
router.get('/seller-buyer', authenticate, requireRole('seller', 'buyer'), controller.method);
```

### Middleware Implementation
```typescript
// Authentication middleware
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: { code: 'AUTH_NO_TOKEN', message: 'No token provided' }
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if token is blacklisted
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_TOKEN_REVOKED', message: 'Token has been revoked' }
      });
    }

    // Attach user to request
    req.user = await User.findById(decoded.userId).select('-password');
    req.userId = decoded.userId;
    
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_INVALID_TOKEN', message: 'Invalid token' }
    });
  }
};
```

## User Roles and Permissions

### Role Hierarchy
```typescript
enum UserRole {
  ADMIN = 'admin',          // Full system access
  SELLER = 'seller',        // Can create products, respond to RFQs
  BUYER = 'buyer',          // Can create RFQs, place orders
  CONTRACTOR = 'contractor', // Limited access to specific projects
  AGENT = 'agent'           // Commission-based intermediary
}
```

### Permission Matrix
| Resource | Admin | Seller | Buyer | Contractor | Agent |
|----------|-------|--------|-------|------------|-------|
| Products | CRUD  | CRUD*  | R     | R          | R     |
| RFQs     | CRUD  | R      | CRUD* | R          | CRUD* |
| Orders   | CRUD  | RU*    | CRUD* | R          | R     |
| Users    | CRUD  | R*     | R*    | R*         | R*    |
| Reports  | R     | R*     | R*    | R*         | R*    |

*Limited to own resources or assigned resources

### Permission Examples
```typescript
// Product permissions
const productPermissions = {
  'read:products': ['admin', 'seller', 'buyer', 'contractor', 'agent'],
  'write:products': ['admin', 'seller'],
  'delete:products': ['admin', 'seller']
};

// RFQ permissions
const rfqPermissions = {
  'read:rfq': ['admin', 'seller', 'buyer', 'contractor', 'agent'],
  'write:rfq': ['admin', 'buyer', 'agent'],
  'respond:rfq': ['admin', 'seller']
};
```

## Security Features

### Rate Limiting
```typescript
// Login attempts: 5 per 15 minutes per IP
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts, please try again later'
    }
  }
});

// API calls: 100 per 15 minutes per user
const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.user?.id || req.ip
});
```

### Account Security
- **Password Policy**: Minimum 8 characters, complexity requirements
- **Account Lockout**: 5 failed attempts locks account for 30 minutes
- **Session Management**: Redis-based session storage with TTL
- **Token Blacklisting**: Revoked tokens stored in Redis
- **Device Tracking**: Optional device fingerprinting

### Security Headers
```typescript
// Applied via helmet middleware
const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block'
};
```

## Token Structure

### Access Token Payload
```typescript
interface AccessTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  permissions: string[];
  sessionId: string;
  iat: number;
  exp: number;
}
```

### Refresh Token Payload
```typescript
interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
  deviceId?: string;
  iat: number;
  exp: number;
}
```

## Error Codes Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_NO_TOKEN` | 401 | No authorization token provided |
| `AUTH_INVALID_TOKEN` | 401 | Invalid or malformed token |
| `AUTH_TOKEN_EXPIRED` | 401 | Token has expired |
| `AUTH_TOKEN_REVOKED` | 401 | Token has been revoked |
| `AUTH_INVALID_CREDENTIALS` | 401 | Invalid email or password |
| `AUTH_ACCOUNT_LOCKED` | 423 | Account locked due to failed attempts |
| `AUTH_ACCOUNT_DISABLED` | 403 | Account has been disabled |
| `AUTH_INSUFFICIENT_PERMISSIONS` | 403 | User lacks required permissions |
| `AUTH_EMAIL_NOT_VERIFIED` | 403 | Email verification required |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |

## Best Practices

### Client-Side Implementation
1. Store tokens securely (httpOnly cookies or secure storage)
2. Implement token refresh logic
3. Handle token expiration gracefully
4. Clear tokens on logout
5. Validate tokens before making requests

### Server-Side Security
1. Use strong JWT secrets (256-bit minimum)
2. Implement proper token validation
3. Use refresh token rotation
4. Monitor for suspicious activity
5. Regular security audits

### Development Tips
1. Use environment-specific JWT secrets
2. Implement comprehensive logging
3. Test authentication flows thoroughly
4. Monitor authentication metrics
5. Keep dependencies updated

## Testing Authentication

### Example Test Cases
```typescript
describe('Authentication API', () => {
  it('should register a new user', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'Test123!',
        firstName: 'Test',
        lastName: 'User',
        role: 'buyer'
      });
    
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it('should login with valid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'Test123!'
      });
    
    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeDefined();
  });
});
```