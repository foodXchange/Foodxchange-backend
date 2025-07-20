# Mobile Push Notifications System

A comprehensive mobile push notification system supporting iOS, Android, and Web platforms with event-driven notifications, scheduling, and analytics integration for the Foodxchange B2B marketplace.

## Features

### 🔔 Multi-Platform Support
- **iOS**: Apple Push Notification Service (APNs)
- **Android**: Firebase Cloud Messaging (FCM)
- **Web**: Web Push API for Progressive Web Apps
- **Azure Notification Hubs**: Enterprise-grade scalability

### 📱 Notification Types
- **Transactional**: Order updates, payment confirmations
- **Marketing**: Promotions, price alerts, recommendations
- **Operational**: Inventory alerts, delivery notifications
- **System**: Maintenance notices, security alerts

### ⚡ Event-Driven Notifications
- **Real-time Triggers**: Automatic notifications on business events
- **Smart Targeting**: User segmentation and preference-based delivery
- **Template System**: Reusable notification templates
- **Rule Engine**: Configurable notification rules and conditions

### ⏰ Scheduled Notifications
- **Cron-based Scheduling**: Automated recurring notifications
- **Payment Reminders**: Due date and overdue alerts
- **Re-engagement**: Inactive user campaigns
- **Weekly Summaries**: Activity reports and insights

### 📊 Analytics & Monitoring
- **Delivery Tracking**: Success rates and failure analysis
- **User Engagement**: Open rates and interaction metrics
- **Performance Monitoring**: System health and reliability
- **A/B Testing**: Template and timing optimization

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Client Applications                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │
│  │ iOS App     │ │ Android App │ │ Web App (PWA)   │   │
│  │ (APNs)      │ │ (FCM)       │ │ (Web Push)      │   │
│  └─────────────┘ └─────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│               Push Notification Gateway                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │
│  │ APNs        │ │ Firebase    │ │ Web Push        │   │
│  │ Provider    │ │ Admin SDK   │ │ Service         │   │
│  └─────────────┘ └─────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│            Mobile Push Notification Service             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │
│  │ Device      │ │ Template    │ │ Delivery        │   │
│  │ Management  │ │ Engine      │ │ Queue           │   │
│  └─────────────┘ └─────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│                Event & Schedule Layer                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │
│  │ Event       │ │ Scheduler   │ │ Integration     │   │
│  │ Handler     │ │ Service     │ │ Service         │   │
│  └─────────────┘ └─────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│                   Data & Analytics                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │
│  │ MongoDB     │ │ Redis       │ │ Analytics       │   │
│  │ Database    │ │ Cache       │ │ Service         │   │
│  └─────────────┘ └─────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Installation

### Dependencies

```bash
npm install firebase-admin node-apn @azure/notification-hubs web-push node-cron
```

### Configuration

#### Environment Variables

```bash
# Firebase Configuration (Android & iOS via FCM)
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/firebase-service-account.json

# Apple Push Notification Service (iOS)
APN_KEY_PATH=/path/to/AuthKey_XXXXXXXXXX.p8
APN_KEY_ID=XXXXXXXXXX
APN_TEAM_ID=XXXXXXXXXX
APN_BUNDLE_ID=com.foodxchange.app

# Web Push (PWA)
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:notifications@foodxchange.com

# Azure Notification Hubs (Optional)
AZURE_NOTIFICATION_HUB_CONNECTION_STRING=your-connection-string
AZURE_NOTIFICATION_HUB_NAME=your-hub-name

# Redis for caching and scaling
REDIS_URL=redis://localhost:6379

# Timezone for scheduled notifications
TZ=UTC
```

#### Firebase Setup

1. **Create Firebase Project**
   ```bash
   # Go to Firebase Console
   # Create new project or use existing
   # Enable Cloud Messaging
   ```

2. **Generate Service Account Key**
   ```bash
   # In Firebase Console:
   # Project Settings > Service Accounts
   # Generate new private key
   # Download JSON file
   ```

3. **Configure iOS App** (if using FCM for iOS)
   ```bash
   # Add iOS app to Firebase project
   # Download GoogleService-Info.plist
   # Configure APNs certificates in Firebase
   ```

#### APNs Setup (iOS)

1. **Create APNs Key**
   ```bash
   # Apple Developer Console
   # Certificates, Identifiers & Profiles
   # Keys > Create new key
   # Enable Apple Push Notifications service
   # Download .p8 file
   ```

2. **Configure App Bundle**
   ```bash
   # Ensure bundle ID matches app configuration
   # Enable Push Notifications capability
   ```

#### Web Push Setup

1. **Generate VAPID Keys**
   ```bash
   npx web-push generate-vapid-keys
   ```

2. **Configure Service Worker**
   ```javascript
   // In your web app's service worker
   self.addEventListener('push', function(event) {
     const options = {
       body: event.data.text(),
       icon: '/icon-192x192.png',
       badge: '/badge-72x72.png'
     };
     
     event.waitUntil(
       self.registration.showNotification('Foodxchange', options)
     );
   });
   ```

## API Endpoints

### Device Management

#### Register Device Token
```http
POST /api/notifications/devices/register
Authorization: Bearer <token>
Content-Type: application/json

{
  "platform": "ios|android|web",
  "token": "device-token-string",
  "appVersion": "1.0.0",
  "deviceModel": "iPhone 14",
  "osVersion": "17.0"
}
```

#### Unregister Device Token
```http
DELETE /api/notifications/devices/unregister
Authorization: Bearer <token>
Content-Type: application/json

{
  "token": "device-token-string"
}
```

### Notification Management

#### Send Single Notification (Admin)
```http
POST /api/notifications/send
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "userId": "user-id",
  "title": "Notification Title",
  "body": "Notification message body",
  "priority": "high",
  "category": "order",
  "data": {
    "orderId": "12345",
    "action": "view"
  },
  "scheduledAt": "2024-02-15T10:00:00Z"
}
```

#### Send Bulk Notification (Admin)
```http
POST /api/notifications/bulk-send
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "userIds": ["user1", "user2", "user3"],
  "templateId": "order_shipped",
  "variables": {
    "orderId": "12345",
    "trackingNumber": "TRK123456"
  }
}
```

#### Send Test Notification
```http
POST /api/notifications/test
Authorization: Bearer <token>
```

### User Preferences

#### Get Notification Preferences
```http
GET /api/notifications/preferences
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "categories": {
      "order": true,
      "rfq": true,
      "promotion": false,
      "inventory": true,
      "payment": true
    },
    "quietHours": {
      "start": "22:00",
      "end": "08:00"
    },
    "timezone": "America/New_York"
  }
}
```

#### Update Notification Preferences
```http
PUT /api/notifications/preferences
Authorization: Bearer <token>
Content-Type: application/json

{
  "enabled": true,
  "categories": {
    "order": true,
    "promotion": false
  },
  "quietHours": {
    "start": "23:00",
    "end": "07:00"
  }
}
```

### Analytics & Monitoring

#### Get Notification Statistics (Admin)
```http
GET /api/notifications/stats?days=30
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sent": 15420,
    "delivered": 14883,
    "opened": 8945,
    "failed": 537,
    "platform": {
      "ios": 6234,
      "android": 7845,
      "web": 1341
    },
    "categories": {
      "order": 8934,
      "rfq": 3456,
      "promotion": 2123
    },
    "scheduler": {
      "totalJobs": 10,
      "enabledJobs": 8
    }
  }
}
```

## Service Integration

### Initialize Notification System

```javascript
import { notificationIntegrationService } from './services/notifications/NotificationIntegrationService';

// Initialize with configuration
const notificationConfig = {
  enablePushNotifications: true,
  enableScheduledNotifications: true,
  enableEventDrivenNotifications: true,
  platforms: {
    ios: true,
    android: true,
    web: true
  }
};

await notificationIntegrationService.initialize();
```

### Register Business Event Listeners

```javascript
// Order events
app.post('/api/orders', async (req, res) => {
  const order = await createOrder(req.body);
  
  // Trigger notification
  await notificationIntegrationService.triggerOrderEvent('created', order);
  
  res.json({ success: true, data: order });
});

// RFQ events
app.post('/api/rfqs', async (req, res) => {
  const rfq = await createRFQ(req.body);
  
  // Trigger notification to relevant suppliers
  await notificationIntegrationService.triggerRFQEvent('created', rfq);
  
  res.json({ success: true, data: rfq });
});
```

### Send Custom Notifications

```javascript
// Send notification using template
await notificationIntegrationService.sendNotification(
  'user-id',
  'order_shipped',
  {
    orderId: 'ORD-123',
    trackingNumber: 'TRK-456',
    estimatedDelivery: '2024-02-15'
  },
  {
    priority: 'high',
    category: 'order'
  }
);

// Send bulk notification
await notificationIntegrationService.sendBulkNotification(
  ['user1', 'user2', 'user3'],
  'price_alert',
  {
    productName: 'Organic Tomatoes',
    oldPrice: 15.99,
    newPrice: 12.99,
    discount: 19
  }
);
```

## Notification Templates

### Default Templates

The system includes pre-configured templates for common scenarios:

#### Order Templates
- `order_created` - Order confirmation
- `order_shipped` - Shipping notification
- `order_delivered` - Delivery confirmation
- `order_cancelled` - Cancellation notice

#### RFQ Templates
- `rfq_response` - New proposal received
- `rfq_expiring_soon` - RFQ expiration reminder
- `proposal_accepted` - Proposal acceptance
- `proposal_rejected` - Proposal rejection

#### Payment Templates
- `payment_reminder` - Payment due reminder
- `payment_overdue` - Overdue payment alert
- `payment_received` - Payment confirmation

#### System Templates
- `welcome` - Welcome new users
- `inventory_low` - Low stock alert
- `price_alert` - Price change notification

### Custom Templates

Create custom notification templates:

```javascript
const customTemplate = {
  id: 'custom_promotion',
  name: 'Custom Promotion Alert',
  title: 'Special Offer: {discountPercent}% Off!',
  body: 'Get {discountPercent}% off on {productName}. Valid until {expiryDate}.',
  category: 'promotion',
  priority: 'normal',
  data: {
    type: 'promotion',
    action: 'view_product'
  }
};

// Register template
mobilePushNotificationService.addTemplate(customTemplate);
```

## Scheduled Notifications

### Default Scheduled Jobs

The system includes several automated notification jobs:

1. **Payment Reminders** - Daily at 9 AM
2. **Order Follow-ups** - Daily at 10 AM
3. **Inventory Alerts** - Mon/Wed/Fri at 8 AM
4. **RFQ Reminders** - Daily at 11 AM
5. **Inactive User Re-engagement** - Sundays at 2 PM
6. **Weekly Summaries** - Fridays at 5 PM

### Custom Scheduled Jobs

```javascript
const customJob = {
  id: 'daily_deals',
  name: 'Daily Deals Notification',
  schedule: '0 9 * * *', // Daily at 9 AM
  enabled: true,
  task: async () => {
    const deals = await getDailyDeals();
    const activeUsers = await getActiveUsers();
    
    await notificationIntegrationService.sendBulkNotification(
      activeUsers,
      'daily_deals',
      { deals: deals.length, topDeal: deals[0] }
    );
  }
};

notificationSchedulerService.addJob(customJob);
```

### Job Management

```javascript
// Enable/disable jobs
notificationSchedulerService.enableJob('payment_reminders');
notificationSchedulerService.disableJob('weekly_summary');

// Run job manually
await notificationSchedulerService.runJobNow('inventory_alerts');

// Get job status
const jobs = notificationSchedulerService.getJobStatus();
console.log('Active jobs:', jobs.filter(j => j.enabled));
```

## Event-Driven Notifications

### Business Event Integration

The system automatically listens for business events and triggers appropriate notifications:

```javascript
// Order status changes
order.status = 'SHIPPED';
await order.save();

// This automatically triggers the 'order_shipped' notification
// No additional code needed!
```

### Custom Event Rules

Define custom notification rules:

```javascript
const customRule = {
  eventType: 'product.price_drop',
  templateId: 'price_alert',
  condition: (event) => event.data.discountPercentage >= 15,
  userSelector: async (event) => {
    // Find users who have this product in their wishlist
    return await findUsersWithWishlistProduct(event.data.productId);
  },
  delay: 5000, // 5 second delay
  enabled: true
};

notificationEventHandler.addNotificationRule('product.price_drop', customRule);
```

## Client Integration

### iOS (Swift)

```swift
import UserNotifications
import FirebaseMessaging

// Request notification permissions
UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
    if granted {
        DispatchQueue.main.async {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }
}

// Handle device token
func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
    
    // Register with backend
    registerDeviceToken(token: token, platform: "ios")
}

// Handle notification received
func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
    let userInfo = response.notification.request.content.userInfo
    
    // Handle notification action
    if let action = userInfo["action"] as? String {
        handleNotificationAction(action, data: userInfo)
    }
    
    completionHandler()
}
```

### Android (Kotlin)

```kotlin
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class MyFirebaseMessagingService : FirebaseMessagingService() {
    
    override fun onNewToken(token: String) {
        // Register token with backend
        registerDeviceToken(token, "android")
    }
    
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        // Handle data payload
        val data = remoteMessage.data
        val title = remoteMessage.notification?.title
        val body = remoteMessage.notification?.body
        
        // Show notification
        showNotification(title, body, data)
    }
    
    private fun showNotification(title: String?, body: String?, data: Map<String, String>) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(R.drawable.ic_notification)
            .setAutoCancel(true)
            .build()
            
        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }
}
```

### Web (JavaScript)

```javascript
// Register service worker
if ('serviceWorker' in navigator && 'PushManager' in window) {
  navigator.serviceWorker.register('/sw.js')
    .then(registration => {
      return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    })
    .then(subscription => {
      // Register with backend
      registerDeviceToken(JSON.stringify(subscription), 'web');
    });
}

// Handle notification clicks
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  const data = event.notification.data;
  if (data.url) {
    clients.openWindow(data.url);
  }
});

// Request permission
Notification.requestPermission().then(permission => {
  if (permission === 'granted') {
    console.log('Notification permission granted');
  }
});
```

## Analytics & Monitoring

### Delivery Tracking

```javascript
// Track notification delivery
notificationIntegrationService.on('notification_sent', (result) => {
  console.log('Notification sent:', {
    id: result.notificationId,
    success: result.success,
    platform: result.platform,
    userId: result.userId
  });
});

// Track notification opens
app.post('/api/notifications/track/open', (req, res) => {
  const { notificationId, userId, platform } = req.body;
  
  notificationIntegrationService.emit('notification_opened', {
    notificationId,
    userId,
    platform,
    openedAt: new Date()
  });
  
  res.json({ success: true });
});
```

### Performance Metrics

```javascript
// Get comprehensive stats
const stats = await notificationIntegrationService.getNotificationStats(30);

console.log('Notification Performance:', {
  deliveryRate: (stats.delivered / stats.sent * 100).toFixed(1) + '%',
  openRate: (stats.opened / stats.delivered * 100).toFixed(1) + '%',
  failureRate: (stats.failed / stats.sent * 100).toFixed(1) + '%'
});

// Platform breakdown
Object.entries(stats.platform).forEach(([platform, count]) => {
  console.log(`${platform}: ${count} notifications`);
});
```

### Health Monitoring

```javascript
// System health check
const health = await notificationIntegrationService.getSystemHealth();

console.log('System Status:', health.status);
console.log('Service Status:', health.services);

// Set up health monitoring endpoint
app.get('/health/notifications', async (req, res) => {
  const health = await notificationIntegrationService.getSystemHealth();
  
  res.status(health.status === 'healthy' ? 200 : 503).json({
    status: health.status,
    services: health.services,
    timestamp: health.lastChecked
  });
});
```

## Testing

### Unit Tests

```javascript
describe('MobilePushNotificationService', () => {
  test('should register device token', async () => {
    await mobilePushNotificationService.registerDeviceToken(
      'user123',
      'ios',
      'mock-device-token'
    );
    
    // Verify token is stored
    const tokens = mobilePushNotificationService.getDeviceTokens('user123');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].platform).toBe('ios');
  });
  
  test('should send notification', async () => {
    const notification = {
      id: 'test-123',
      userId: 'user123',
      title: 'Test Notification',
      body: 'This is a test',
      priority: 'normal'
    };
    
    const result = await mobilePushNotificationService.sendNotification(notification);
    expect(result.success).toBe(true);
  });
});

describe('NotificationEventHandler', () => {
  test('should trigger order notification', async () => {
    const mockOrder = {
      _id: 'order123',
      buyer: 'user123',
      total: 150.00
    };
    
    notificationEventHandler.emit('order:created', mockOrder);
    
    // Verify notification was triggered
    // This would require mocking the notification service
  });
});
```

### Integration Tests

```javascript
describe('Notification Integration', () => {
  test('should handle end-to-end notification flow', async () => {
    // Register device
    await request(app)
      .post('/api/notifications/devices/register')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        platform: 'ios',
        token: 'test-device-token'
      })
      .expect(200);
    
    // Trigger business event
    const order = await createTestOrder();
    await notificationIntegrationService.triggerOrderEvent('created', order);
    
    // Verify notification was sent
    // This would require checking the notification queue or delivery logs
  });
});
```

### Load Testing

```javascript
describe('Notification Load Tests', () => {
  test('should handle bulk notifications', async () => {
    const userIds = Array.from({ length: 1000 }, (_, i) => `user${i}`);
    
    const startTime = Date.now();
    const result = await mobilePushNotificationService.sendBulkNotification(
      userIds,
      'test_template',
      { message: 'Load test' }
    );
    const endTime = Date.now();
    
    expect(result.success).toBe(true);
    expect(result.totalSent).toBeGreaterThan(900); // 90% success rate
    expect(endTime - startTime).toBeLessThan(30000); // Under 30 seconds
  });
});
```

## Security

### Token Security

```javascript
// Validate device tokens
const validateDeviceToken = (token, platform) => {
  switch (platform) {
    case 'ios':
      return /^[a-f0-9]{64}$/.test(token);
    case 'android':
      return token.length > 100 && token.includes(':');
    case 'web':
      try {
        const subscription = JSON.parse(token);
        return subscription.endpoint && subscription.keys;
      } catch {
        return false;
      }
    default:
      return false;
  }
};

// Rate limiting for device registration
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 registrations per hour per user
  keyGenerator: (req) => req.user.id
});
```

### Data Privacy

```javascript
// Sanitize notification data
const sanitizeNotificationData = (data, userRole) => {
  const sanitized = { ...data };
  
  // Remove sensitive information based on user role
  if (userRole !== 'ADMIN') {
    delete sanitized.internalNotes;
    delete sanitized.debugInfo;
  }
  
  // Ensure no PII in notification data
  Object.keys(sanitized).forEach(key => {
    if (key.includes('password') || key.includes('secret')) {
      delete sanitized[key];
    }
  });
  
  return sanitized;
};
```

### Access Control

```javascript
// Role-based notification access
const notificationPermissions = {
  'ADMIN': ['send', 'bulk_send', 'view_stats', 'manage_templates'],
  'MANAGER': ['send', 'view_stats'],
  'USER': ['register_device', 'update_preferences'],
  'SYSTEM': ['send', 'bulk_send']
};

const checkNotificationPermission = (userRole, action) => {
  const permissions = notificationPermissions[userRole] || [];
  return permissions.includes(action);
};
```

## Troubleshooting

### Common Issues

1. **Notifications Not Delivered**
   ```javascript
   // Check device token validity
   const tokens = await mobilePushNotificationService.getDeviceTokens(userId);
   console.log('Device tokens:', tokens);
   
   // Verify service configuration
   const config = notificationIntegrationService.getConfig();
   console.log('Service config:', config);
   
   // Check network connectivity
   const health = await notificationIntegrationService.getSystemHealth();
   console.log('System health:', health);
   ```

2. **iOS Notifications Failing**
   ```bash
   # Verify APNs configuration
   echo "Check APN_KEY_PATH, APN_KEY_ID, APN_TEAM_ID environment variables"
   
   # Test APNs connection
   openssl s_client -connect gateway.push.apple.com:443 -cert your_cert.pem -key your_key.pem
   ```

3. **Android Notifications Failing**
   ```javascript
   // Verify Firebase configuration
   if (!admin.apps.length) {
     console.error('Firebase not initialized - check FIREBASE_SERVICE_ACCOUNT_PATH');
   }
   
   // Test FCM token
   const message = {
     token: 'test-token',
     notification: { title: 'Test', body: 'Test message' }
   };
   
   try {
     const response = await admin.messaging().send(message);
     console.log('FCM test successful:', response);
   } catch (error) {
     console.error('FCM test failed:', error);
   }
   ```

4. **Web Push Failing**
   ```javascript
   // Verify VAPID configuration
   console.log('VAPID_PUBLIC_KEY:', process.env.VAPID_PUBLIC_KEY);
   console.log('VAPID_PRIVATE_KEY:', process.env.VAPID_PRIVATE_KEY ? 'Set' : 'Not set');
   
   // Test web push
   const testSubscription = {
     endpoint: 'test-endpoint',
     keys: { p256dh: 'test-key', auth: 'test-auth' }
   };
   
   try {
     await webpush.sendNotification(testSubscription, 'Test message');
     console.log('Web push test successful');
   } catch (error) {
     console.error('Web push test failed:', error);
   }
   ```

### Debug Mode

```javascript
// Enable debug logging
process.env.DEBUG = 'notifications:*';

// Add detailed logging
const originalSend = mobilePushNotificationService.sendNotification;
mobilePushNotificationService.sendNotification = function(notification) {
  console.log('Sending notification:', {
    id: notification.id,
    userId: notification.userId,
    platform: 'all',
    timestamp: new Date()
  });
  
  return originalSend.call(this, notification);
};
```

### Performance Monitoring

```javascript
// Monitor notification queue
setInterval(async () => {
  const stats = await mobilePushNotificationService.getNotificationStats(1);
  
  if (stats.failed > stats.sent * 0.1) { // >10% failure rate
    console.warn('High notification failure rate:', stats);
    // Alert administrators
  }
}, 60000); // Check every minute

// Monitor memory usage
setInterval(() => {
  const memUsage = process.memoryUsage();
  console.log('Memory usage:', {
    rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`
  });
}, 300000); // Check every 5 minutes
```

This comprehensive mobile push notification system provides enterprise-grade functionality for the Foodxchange platform, ensuring reliable delivery of important business communications across all platforms while maintaining security and performance.