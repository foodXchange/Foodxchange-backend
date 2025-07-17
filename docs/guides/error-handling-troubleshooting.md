# Error Handling and Troubleshooting Guide

## Overview
This guide provides comprehensive error handling patterns, troubleshooting procedures, and debugging strategies for the FoodXchange platform. It covers common issues, their causes, and step-by-step resolution procedures.

## Error Categories

### 1. Authentication & Authorization Errors

#### **AUTH_TOKEN_INVALID**
**HTTP Status**: 401 Unauthorized
**Description**: JWT token is invalid, expired, or malformed

**Common Causes**:
- Token has expired (>24 hours old)
- Token signature verification failed
- Token format is incorrect
- Token was issued by different server

**Resolution Steps**:
1. **Check Token Format**:
   ```bash
   # Valid JWT format: header.payload.signature
   echo "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." | base64 -d
   ```

2. **Verify Token Expiration**:
   ```javascript
   const jwt = require('jsonwebtoken');
   const decoded = jwt.decode(token);
   console.log('Token expires at:', new Date(decoded.exp * 1000));
   ```

3. **Request New Token**:
   ```javascript
   const response = await fetch('/api/auth/refresh', {
     method: 'POST',
     headers: { 'Authorization': `Bearer ${refreshToken}` }
   });
   ```

#### **INSUFFICIENT_PERMISSIONS**
**HTTP Status**: 403 Forbidden
**Description**: User lacks required permissions for the requested action

**Resolution Steps**:
1. **Check User Role**:
   ```bash
   curl -H "Authorization: Bearer $TOKEN" https://api.foodxchange.com/api/auth/profile
   ```

2. **Verify Permission Requirements**:
   ```javascript
   // Check required permissions for endpoint
   const requiredPermissions = ['read:rfq', 'write:rfq'];
   const userPermissions = user.permissions;
   const hasPermission = requiredPermissions.every(p => userPermissions.includes(p));
   ```

3. **Request Permission Upgrade**:
   - Contact system administrator
   - Submit role change request
   - Verify business justification

### 2. Validation Errors

#### **VALIDATION_FAILED**
**HTTP Status**: 400 Bad Request
**Description**: Request data failed validation rules

**Common Validation Failures**:
- Missing required fields
- Invalid data types
- Value out of range
- Format validation failed

**Example Response**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "details": {
      "email": "Invalid email format",
      "password": "Password must be at least 8 characters",
      "budget.min": "Minimum budget must be greater than 0"
    }
  }
}
```

**Resolution Steps**:
1. **Review Validation Rules**:
   ```javascript
   // Check field requirements
   const schema = {
     email: { required: true, format: 'email' },
     password: { required: true, minLength: 8 },
     budget: {
       min: { required: true, minimum: 0 },
       max: { required: true, minimum: 'min' }
     }
   };
   ```

2. **Fix Data Format**:
   ```javascript
   // Correct common validation issues
   const fixedData = {
     email: email.toLowerCase().trim(),
     password: password.trim(),
     budget: {
       min: Math.max(0, parseInt(budgetMin)),
       max: Math.max(parseInt(budgetMin), parseInt(budgetMax))
     }
   };
   ```

### 3. Database Errors

#### **DATABASE_CONNECTION_FAILED**
**HTTP Status**: 503 Service Unavailable
**Description**: Cannot connect to database

**Troubleshooting Steps**:
1. **Check Database Status**:
   ```bash
   # MongoDB connection test
   mongosh --host mongodb://localhost:27017/foodxchange --eval "db.runCommand('ping')"
   
   # Redis connection test
   redis-cli -h localhost -p 6379 ping
   ```

2. **Verify Connection String**:
   ```javascript
   // Check MongoDB connection string
   const mongoose = require('mongoose');
   mongoose.connect(process.env.MONGODB_URI, {
     useNewUrlParser: true,
     useUnifiedTopology: true,
     serverSelectionTimeoutMS: 5000
   });
   ```

3. **Check Network Connectivity**:
   ```bash
   # Test database server connectivity
   telnet db.foodxchange.com 27017
   
   # Check DNS resolution
   nslookup db.foodxchange.com
   ```

#### **DUPLICATE_KEY_ERROR**
**HTTP Status**: 409 Conflict
**Description**: Attempting to insert duplicate unique value

**Resolution Steps**:
1. **Identify Conflicting Field**:
   ```javascript
   // Parse MongoDB duplicate key error
   const parseMongoError = (error) => {
     if (error.code === 11000) {
       const field = Object.keys(error.keyPattern)[0];
       return `${field} already exists`;
     }
   };
   ```

2. **Generate Unique Value**:
   ```javascript
   // Generate unique RFQ number
   const generateRFQNumber = async () => {
     let rfqNumber;
     let attempts = 0;
     
     do {
       rfqNumber = `RFQ-${Date.now().toString().slice(-6)}`;
       attempts++;
     } while (await RFQ.findOne({ rfqNumber }) && attempts < 10);
     
     return rfqNumber;
   };
   ```

### 4. External Service Errors

#### **PAYMENT_GATEWAY_ERROR**
**HTTP Status**: 502 Bad Gateway
**Description**: Payment processing service is unavailable

**Troubleshooting Steps**:
1. **Check Service Status**:
   ```bash
   # Check Stripe API status
   curl -I https://api.stripe.com/v1/charges
   
   # Check PayPal API status
   curl -I https://api.paypal.com/v2/checkout/orders
   ```

2. **Implement Retry Logic**:
   ```javascript
   const processPayment = async (paymentData, retries = 3) => {
     try {
       return await stripe.charges.create(paymentData);
     } catch (error) {
       if (retries > 0 && error.type === 'StripeConnectionError') {
         await new Promise(resolve => setTimeout(resolve, 1000));
         return processPayment(paymentData, retries - 1);
       }
       throw error;
     }
   };
   ```

#### **EMAIL_SERVICE_ERROR**
**HTTP Status**: 502 Bad Gateway
**Description**: Email service is unavailable

**Resolution Steps**:
1. **Check Email Service Status**:
   ```javascript
   // Test SMTP connection
   const nodemailer = require('nodemailer');
   const transporter = nodemailer.createTransporter({
     host: process.env.SMTP_HOST,
     port: process.env.SMTP_PORT,
     secure: true,
     auth: {
       user: process.env.SMTP_USER,
       pass: process.env.SMTP_PASS
     }
   });
   
   await transporter.verify();
   ```

2. **Implement Fallback Queue**:
   ```javascript
   // Queue failed emails for retry
   const queueFailedEmail = async (emailData) => {
     await redis.lpush('failed_emails', JSON.stringify({
       ...emailData,
       attempts: 0,
       nextRetry: Date.now() + 300000 // 5 minutes
     }));
   };
   ```

### 5. File Upload Errors

#### **FILE_TOO_LARGE**
**HTTP Status**: 413 Payload Too Large
**Description**: Uploaded file exceeds size limit

**Resolution Steps**:
1. **Check File Size Limits**:
   ```javascript
   // Current limits
   const limits = {
     images: 5 * 1024 * 1024, // 5MB
     documents: 10 * 1024 * 1024, // 10MB
     videos: 50 * 1024 * 1024 // 50MB
   };
   ```

2. **Implement Client-Side Validation**:
   ```javascript
   const validateFileSize = (file, maxSize) => {
     if (file.size > maxSize) {
       throw new Error(`File too large. Maximum size: ${maxSize / 1024 / 1024}MB`);
     }
   };
   ```

#### **INVALID_FILE_TYPE**
**HTTP Status**: 400 Bad Request
**Description**: File type not supported

**Resolution Steps**:
1. **Check Allowed File Types**:
   ```javascript
   const allowedTypes = {
     images: ['image/jpeg', 'image/png', 'image/gif'],
     documents: ['application/pdf', 'application/msword'],
     certificates: ['application/pdf']
   };
   ```

2. **Validate File MIME Type**:
   ```javascript
   const validateMimeType = (file, allowedTypes) => {
     if (!allowedTypes.includes(file.mimetype)) {
       throw new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`);
     }
   };
   ```

### 6. Rate Limiting Errors

#### **RATE_LIMIT_EXCEEDED**
**HTTP Status**: 429 Too Many Requests
**Description**: Request rate limit exceeded

**Resolution Steps**:
1. **Check Rate Limits**:
   ```bash
   # Check current rate limit status
   curl -I https://api.foodxchange.com/api/rfq
   # Look for: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
   ```

2. **Implement Backoff Strategy**:
   ```javascript
   const makeRequestWithBackoff = async (url, options, maxRetries = 3) => {
     for (let i = 0; i < maxRetries; i++) {
       try {
         const response = await fetch(url, options);
         if (response.status === 429) {
           const resetTime = response.headers.get('X-RateLimit-Reset');
           const waitTime = (resetTime * 1000) - Date.now();
           await new Promise(resolve => setTimeout(resolve, waitTime));
           continue;
         }
         return response;
       } catch (error) {
         if (i === maxRetries - 1) throw error;
         await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
       }
     }
   };
   ```

## Debugging Tools and Techniques

### 1. Logging and Monitoring

#### **Application Logs**
```javascript
// Structured logging with Winston
const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Usage in error handling
try {
  await processRFQ(rfqData);
} catch (error) {
  logger.error('RFQ processing failed', {
    error: error.message,
    stack: error.stack,
    rfqId: rfqData.id,
    userId: req.user.id
  });
}
```

#### **Request Tracing**
```javascript
// Add request ID for tracing
const { v4: uuidv4 } = require('uuid');

app.use((req, res, next) => {
  req.requestId = uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  logger.info('Request started', {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent')
  });
  next();
});
```

### 2. Database Debugging

#### **Query Performance Analysis**
```javascript
// MongoDB query profiling
db.setProfilingLevel(2);
db.system.profile.find().sort({ ts: -1 }).limit(5);

// Mongoose query debugging
mongoose.set('debug', true);

// Query execution time monitoring
const startTime = Date.now();
const result = await RFQ.find({ status: 'active' });
const executionTime = Date.now() - startTime;
logger.info(`Query executed in ${executionTime}ms`);
```

#### **Connection Pool Monitoring**
```javascript
// Monitor MongoDB connection pool
mongoose.connection.on('connected', () => {
  logger.info('MongoDB connected');
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error', { error: err.message });
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});
```

### 3. API Testing and Debugging

#### **API Health Check**
```javascript
// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: 'unknown',
      redis: 'unknown',
      email: 'unknown'
    }
  };
  
  try {
    await mongoose.connection.db.admin().ping();
    health.services.database = 'healthy';
  } catch (error) {
    health.services.database = 'unhealthy';
    health.status = 'unhealthy';
  }
  
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});
```

#### **API Testing Scripts**
```bash
#!/bin/bash
# API testing script

BASE_URL="https://api.foodxchange.com"
TOKEN="your-jwt-token-here"

# Test authentication
echo "Testing authentication..."
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/auth/profile"

# Test RFQ endpoints
echo "Testing RFQ creation..."
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"title":"Test RFQ","description":"Test description"}' \
     "$BASE_URL/api/rfq"

# Test file upload
echo "Testing file upload..."
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -F "file=@test-document.pdf" \
     "$BASE_URL/api/upload"
```

## Performance Troubleshooting

### 1. Slow API Response Times

#### **Diagnosis Steps**:
1. **Check Database Query Performance**:
   ```javascript
   // Add query timing
   const startTime = process.hrtime();
   const result = await Model.find(query);
   const [seconds, nanoseconds] = process.hrtime(startTime);
   const milliseconds = seconds * 1000 + nanoseconds / 1000000;
   
   if (milliseconds > 100) {
     logger.warn('Slow query detected', {
       query: JSON.stringify(query),
       executionTime: milliseconds,
       collection: Model.collection.name
     });
   }
   ```

2. **Memory Usage Monitoring**:
   ```javascript
   // Monitor memory usage
   const memoryUsage = process.memoryUsage();
   logger.info('Memory usage', {
     rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
     heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
     heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
   });
   ```

### 2. High CPU Usage

#### **Diagnosis Steps**:
1. **Identify CPU-Intensive Operations**:
   ```javascript
   // Profile CPU usage
   const profiler = require('v8-profiler-next');
   profiler.startProfiling('cpu-profile');
   
   // Your code here
   
   const profile = profiler.stopProfiling('cpu-profile');
   profile.export(fs.createWriteStream('cpu-profile.cpuprofile'));
   ```

2. **Optimize Heavy Operations**:
   ```javascript
   // Use worker threads for CPU-intensive tasks
   const { Worker, isMainThread, parentPort } = require('worker_threads');
   
   if (isMainThread) {
     const worker = new Worker(__filename);
     worker.postMessage({ data: largeDateSet });
     worker.on('message', (result) => {
       console.log('Processing complete:', result);
     });
   } else {
     parentPort.on('message', ({ data }) => {
       const result = processLargeDataSet(data);
       parentPort.postMessage(result);
     });
   }
   ```

## Emergency Procedures

### 1. Service Outage Response

#### **Immediate Actions**:
1. **Acknowledge the Issue**:
   ```javascript
   // Set maintenance mode
   app.use((req, res, next) => {
     if (process.env.MAINTENANCE_MODE === 'true') {
       return res.status(503).json({
         error: 'Service temporarily unavailable',
         message: 'System maintenance in progress'
       });
     }
     next();
   });
   ```

2. **Notify Stakeholders**:
   ```javascript
   // Send emergency notifications
   const notifyStakeholders = async (incident) => {
     const recipients = [
       'tech-team@foodxchange.com',
       'operations@foodxchange.com',
       'management@foodxchange.com'
     ];
     
     await Promise.all(recipients.map(email => 
       emailService.sendUrgent(email, {
         subject: `[URGENT] Service Outage - ${incident.title}`,
         body: `Incident: ${incident.description}\nStarted: ${incident.startTime}\nSeverity: ${incident.severity}`
       })
     ));
   };
   ```

### 2. Data Recovery Procedures

#### **Backup Verification**:
```bash
#!/bin/bash
# Verify backup integrity

# Check MongoDB backups
mongodump --host localhost:27017 --db foodxchange --out /tmp/test-restore
mongorestore --host localhost:27017 --db foodxchange_test /tmp/test-restore/foodxchange

# Verify data integrity
mongo foodxchange_test --eval "db.users.count()"
```

#### **Point-in-Time Recovery**:
```javascript
// Implement point-in-time recovery
const restoreDatabase = async (targetDate) => {
  const backupFile = findBackupByDate(targetDate);
  await mongoose.connection.db.dropDatabase();
  await restoreFromBackup(backupFile);
  
  // Verify restoration
  const count = await User.countDocuments();
  logger.info(`Database restored. User count: ${count}`);
};
```

## Prevention Strategies

### 1. Proactive Monitoring

#### **Health Checks**:
```javascript
// Comprehensive health monitoring
const healthChecks = {
  database: async () => {
    try {
      await mongoose.connection.db.admin().ping();
      return { status: 'healthy', latency: Date.now() - startTime };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  },
  
  redis: async () => {
    try {
      const start = Date.now();
      await redis.ping();
      return { status: 'healthy', latency: Date.now() - start };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  },
  
  externalServices: async () => {
    const checks = await Promise.all([
      checkStripeAPI(),
      checkEmailService(),
      checkStorageService()
    ]);
    return checks;
  }
};
```

### 2. Error Prevention

#### **Input Validation**:
```javascript
// Comprehensive input validation
const validateRFQData = (data) => {
  const errors = {};
  
  if (!data.title || data.title.length < 10) {
    errors.title = 'Title must be at least 10 characters';
  }
  
  if (!data.budget || data.budget.min <= 0) {
    errors.budget = 'Budget must be greater than 0';
  }
  
  if (data.deliveryDate && new Date(data.deliveryDate) < new Date()) {
    errors.deliveryDate = 'Delivery date must be in the future';
  }
  
  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid RFQ data', errors);
  }
};
```

This comprehensive error handling and troubleshooting guide ensures rapid issue resolution and maintains system reliability across the FoodXchange platform.