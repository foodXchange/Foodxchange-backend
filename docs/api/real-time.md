# Real-time Events API (WebSocket)

## Overview
FoodXchange uses Socket.IO for real-time communication, enabling live updates for RFQ status changes, expert availability, order tracking, and messaging. This document covers all real-time events and their implementation.

## Connection Setup

### Client Connection
```javascript
import { io } from 'socket.io-client';

// Connect with authentication
const socket = io('ws://localhost:5001', {
  auth: {
    token: 'your-jwt-token-here'
  },
  transports: ['websocket', 'polling']
});

// Connection events
socket.on('connect', () => {
  console.log('Connected to FoodXchange real-time service');
  console.log('Socket ID:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.error('Connection failed:', error.message);
});
```

### Authentication
```javascript
// JWT token validation on connection
socket.on('authenticated', (data) => {
  console.log('Authentication successful:', data);
  // {
  //   userId: "64f5a8b9c123456789abcdef",
  //   role: "buyer",
  //   permissions: ["read:rfq", "write:rfq"]
  // }
});

socket.on('auth_error', (error) => {
  console.error('Authentication failed:', error);
  // Reconnect with new token or redirect to login
});
```

## Event Categories

### 1. RFQ Events

#### rfq:created
Emitted when a new RFQ is created.

**Event Data:**
```javascript
socket.on('rfq:created', (data) => {
  console.log('New RFQ created:', data);
});

// Event payload
{
  "eventType": "rfq:created",
  "rfqId": "64f5a8b9c123456789abcdef",
  "rfqNumber": "RFQ-240115",
  "title": "Premium Organic Apples - 1000kg",
  "category": "Fresh Produce",
  "buyer": {
    "id": "64f5a8b9c123456789abcde0",
    "companyName": "Pacific Juice Co."
  },
  "requirements": {
    "quantity": 1000,
    "unit": "kg",
    "deliveryDate": "2024-03-15T00:00:00Z"
  },
  "proposalDeadline": "2024-02-28T23:59:59Z",
  "expertiseRequired": true,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### rfq:status_changed
Emitted when RFQ status changes.

```javascript
socket.on('rfq:status_changed', (data) => {
  console.log('RFQ status updated:', data);
});

// Event payload
{
  "eventType": "rfq:status_changed",
  "rfqId": "64f5a8b9c123456789abcdef",
  "rfqNumber": "RFQ-240115",
  "previousStatus": "draft",
  "newStatus": "published",
  "changedBy": {
    "userId": "64f5a8b9c123456789abcde0",
    "role": "buyer"
  },
  "timestamp": "2024-01-15T11:00:00Z",
  "metadata": {
    "reason": "RFQ review completed",
    "autoPublish": false
  }
}
```

#### rfq:proposal_received
Emitted when a new proposal is submitted.

```javascript
socket.on('rfq:proposal_received', (data) => {
  console.log('New proposal received:', data);
});

// Event payload
{
  "eventType": "rfq:proposal_received",
  "rfqId": "64f5a8b9c123456789abcdef",
  "proposalId": "64f5a8b9c123456789abcde2",
  "supplier": {
    "id": "64f5a8b9c123456789abcde3",
    "companyName": "Yakima Valley Organics",
    "rating": 4.7
  },
  "pricing": {
    "unitPrice": 3.25,
    "totalPrice": 3250.00
  },
  "delivery": {
    "leadTime": 14,
    "earliestDelivery": "2024-03-01T00:00:00Z"
  },
  "timestamp": "2024-01-20T14:30:00Z",
  "proposalCount": 3
}
```

#### rfq:awarded
Emitted when an RFQ is awarded to a supplier.

```javascript
socket.on('rfq:awarded', (data) => {
  console.log('RFQ awarded:', data);
});

// Event payload
{
  "eventType": "rfq:awarded",
  "rfqId": "64f5a8b9c123456789abcdef",
  "awardedProposal": "64f5a8b9c123456789abcde2",
  "winningSupplier": {
    "id": "64f5a8b9c123456789abcde3",
    "companyName": "Yakima Valley Organics"
  },
  "finalPrice": 3200.00,
  "orderId": "64f5a8b9c123456789abcde4",
  "timestamp": "2024-01-25T16:45:00Z"
}
```

### 2. Expert Events

#### expert:availability_changed
Emitted when expert availability changes.

```javascript
socket.on('expert:availability_changed', (data) => {
  console.log('Expert availability updated:', data);
});

// Event payload
{
  "eventType": "expert:availability_changed",
  "expertId": "64f5a8b9c123456789abcde1",
  "expertName": "Dr. Sarah Wilson",
  "previousStatus": "busy",
  "newStatus": "available",
  "availableUntil": "2024-01-15T18:00:00Z",
  "expertise": ["Organic Certification", "Food Safety"],
  "hourlyRate": 150,
  "timestamp": "2024-01-15T12:00:00Z"
}
```

#### expert:matched_to_rfq
Emitted when an expert is matched to an RFQ.

```javascript
socket.on('expert:matched_to_rfq', (data) => {
  console.log('Expert matched to RFQ:', data);
});

// Event payload
{
  "eventType": "expert:matched_to_rfq",
  "matchId": "64f5a8b9c123456789abcde5",
  "expertId": "64f5a8b9c123456789abcde1",
  "rfqId": "64f5a8b9c123456789abcdef",
  "matchScore": 0.87,
  "expertise": ["Organic Certification"],
  "estimatedHours": 2,
  "recommendedEngagement": "compliance_review",
  "timestamp": "2024-01-15T10:35:00Z"
}
```

#### expert:consultation_requested
Emitted when a consultation is requested.

```javascript
socket.on('expert:consultation_requested', (data) => {
  console.log('Consultation requested:', data);
});

// Event payload
{
  "eventType": "expert:consultation_requested",
  "consultationId": "64f5a8b9c123456789abcde6",
  "expertId": "64f5a8b9c123456789abcde1",
  "clientId": "64f5a8b9c123456789abcde0",
  "rfqId": "64f5a8b9c123456789abcdef",
  "consultationType": "compliance_review",
  "urgency": "high",
  "questions": [
    "Can you verify the organic certification requirements?"
  ],
  "proposedRate": 150,
  "maxHours": 2,
  "timestamp": "2024-01-15T15:30:00Z"
}
```

### 3. Order Events

#### order:created
Emitted when a new order is created from an awarded RFQ.

```javascript
socket.on('order:created', (data) => {
  console.log('Order created:', data);
});

// Event payload
{
  "eventType": "order:created",
  "orderId": "64f5a8b9c123456789abcde4",
  "orderNumber": "ORD-240125",
  "rfqId": "64f5a8b9c123456789abcdef",
  "buyer": {
    "id": "64f5a8b9c123456789abcde0",
    "companyName": "Pacific Juice Co."
  },
  "supplier": {
    "id": "64f5a8b9c123456789abcde3",
    "companyName": "Yakima Valley Organics"
  },
  "totalAmount": 3200.00,
  "expectedDelivery": "2024-03-10T00:00:00Z",
  "timestamp": "2024-01-25T16:50:00Z"
}
```

#### order:status_updated
Emitted when order status changes.

```javascript
socket.on('order:status_updated', (data) => {
  console.log('Order status updated:', data);
});

// Event payload
{
  "eventType": "order:status_updated",
  "orderId": "64f5a8b9c123456789abcde4",
  "orderNumber": "ORD-240125",
  "previousStatus": "confirmed",
  "newStatus": "shipped",
  "updatedBy": {
    "userId": "64f5a8b9c123456789abcde3",
    "role": "supplier"
  },
  "tracking": {
    "carrier": "FedEx",
    "trackingNumber": "1234567890",
    "estimatedDelivery": "2024-03-08T00:00:00Z"
  },
  "timestamp": "2024-03-01T10:00:00Z"
}
```

### 4. Messaging Events

#### message:received
Emitted when a new message is received.

```javascript
socket.on('message:received', (data) => {
  console.log('New message:', data);
});

// Event payload
{
  "eventType": "message:received",
  "messageId": "64f5a8b9c123456789abcde7",
  "conversationId": "64f5a8b9c123456789abcde8",
  "from": {
    "userId": "64f5a8b9c123456789abcde0",
    "name": "John Smith",
    "role": "buyer"
  },
  "to": {
    "userId": "64f5a8b9c123456789abcde3",
    "name": "Mary Johnson",
    "role": "supplier"
  },
  "content": {
    "text": "Can you provide more details about the organic certification?",
    "type": "text"
  },
  "rfqContext": {
    "rfqId": "64f5a8b9c123456789abcdef",
    "rfqNumber": "RFQ-240115"
  },
  "timestamp": "2024-01-16T09:15:00Z"
}
```

#### typing:start / typing:stop
Emitted when users start/stop typing.

```javascript
socket.on('typing:start', (data) => {
  console.log('User started typing:', data);
});

socket.on('typing:stop', (data) => {
  console.log('User stopped typing:', data);
});

// Event payload for both
{
  "eventType": "typing:start", // or "typing:stop"
  "conversationId": "64f5a8b9c123456789abcde8",
  "userId": "64f5a8b9c123456789abcde0",
  "userName": "John Smith",
  "timestamp": "2024-01-16T09:15:00Z"
}
```

### 5. Notification Events

#### notification:new
Emitted for general notifications.

```javascript
socket.on('notification:new', (data) => {
  console.log('New notification:', data);
});

// Event payload
{
  "eventType": "notification:new",
  "notificationId": "64f5a8b9c123456789abcde9",
  "userId": "64f5a8b9c123456789abcde0",
  "type": "rfq_proposal_received",
  "priority": "high",
  "title": "New Proposal Received",
  "message": "Yakima Valley Organics submitted a proposal for RFQ-240115",
  "data": {
    "rfqId": "64f5a8b9c123456789abcdef",
    "proposalId": "64f5a8b9c123456789abcde2"
  },
  "actions": [
    {
      "label": "View Proposal",
      "action": "navigate",
      "url": "/rfq/64f5a8b9c123456789abcdef/proposals"
    }
  ],
  "timestamp": "2024-01-20T14:30:00Z",
  "expiresAt": "2024-01-27T14:30:00Z"
}
```

## Client-Side Event Emission

### Join Rooms
```javascript
// Join RFQ-specific room
socket.emit('join_rfq', {
  rfqId: '64f5a8b9c123456789abcdef'
});

// Join company room
socket.emit('join_company', {
  companyId: '64f5a8b9c123456789abcde0'
});

// Join expert room
socket.emit('join_expert', {
  expertId: '64f5a8b9c123456789abcde1'
});
```

### Send Messages
```javascript
// Send message in conversation
socket.emit('send_message', {
  conversationId: '64f5a8b9c123456789abcde8',
  content: {
    text: 'Thank you for the detailed proposal!',
    type: 'text'
  },
  rfqContext: {
    rfqId: '64f5a8b9c123456789abcdef'
  }
});

// Start/stop typing indicators
socket.emit('typing_start', {
  conversationId: '64f5a8b9c123456789abcde8'
});

socket.emit('typing_stop', {
  conversationId: '64f5a8b9c123456789abcde8'
});
```

### Update Status
```javascript
// Update expert availability
socket.emit('update_expert_status', {
  status: 'available',
  availableUntil: '2024-01-15T18:00:00Z'
});

// Update location for delivery tracking
socket.emit('update_delivery_location', {
  orderId: '64f5a8b9c123456789abcde4',
  coordinates: {
    lat: 45.5152,
    lng: -122.6784
  },
  timestamp: '2024-03-05T14:30:00Z'
});
```

## Room Management

### Automatic Room Joining
Users are automatically joined to relevant rooms based on their role and permissions:

```javascript
// Buyers join:
- company:{companyId}
- user:{userId}
- rfqs:buyer:{userId}

// Suppliers join:
- company:{companyId}
- user:{userId}
- rfqs:supplier:{userId}
- rfqs:category:{categoryIds}

// Experts join:
- expert:{expertId}
- rfqs:expert
- expertise:{expertiseAreas}

// Admins join:
- admin:global
- all relevant company/rfq rooms
```

### Manual Room Management
```javascript
// Join specific RFQ room
socket.emit('join_rfq', { rfqId: 'rfq-id' });

// Leave RFQ room
socket.emit('leave_rfq', { rfqId: 'rfq-id' });

// Get current rooms
socket.emit('get_rooms', (rooms) => {
  console.log('Currently in rooms:', rooms);
});
```

## Error Handling

### Connection Errors
```javascript
socket.on('connect_error', (error) => {
  if (error.message === 'Authentication error') {
    // Redirect to login or refresh token
    refreshTokenAndReconnect();
  } else {
    // Show user-friendly error message
    showConnectionError();
  }
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
  // Handle specific error types
  switch (error.type) {
    case 'RATE_LIMIT_EXCEEDED':
      showRateLimitMessage();
      break;
    case 'INVALID_ROOM':
      handleInvalidRoom(error.room);
      break;
    case 'PERMISSION_DENIED':
      handlePermissionDenied(error.action);
      break;
  }
});
```

### Event-Specific Errors
```javascript
socket.on('message_error', (error) => {
  console.error('Message failed to send:', error);
  // Show retry option to user
});

socket.on('join_room_error', (error) => {
  console.error('Failed to join room:', error);
  // Handle room access issues
});
```

## Security Features

### Rate Limiting
```javascript
// Rate limits per user per minute:
- Message sending: 60 messages
- Room joining: 10 joins
- Status updates: 30 updates
- File uploads: 5 uploads
```

### Permission Validation
```javascript
// All events are validated against user permissions
socket.on('permission_denied', (data) => {
  console.warn('Permission denied:', data);
  // {
  //   event: 'send_message',
  //   reason: 'User cannot access this conversation',
  //   requiredPermission: 'write:messages'
  // }
});
```

## Implementation Example

### Complete React Hook for RFQ Updates
```javascript
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export const useRFQRealtime = (rfqId, authToken) => {
  const [socket, setSocket] = useState(null);
  const [rfqStatus, setRFQStatus] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [expertMatches, setExpertMatches] = useState([]);

  useEffect(() => {
    const newSocket = io('ws://localhost:5001', {
      auth: { token: authToken }
    });

    newSocket.on('connect', () => {
      newSocket.emit('join_rfq', { rfqId });
    });

    newSocket.on('rfq:status_changed', (data) => {
      if (data.rfqId === rfqId) {
        setRFQStatus(data.newStatus);
      }
    });

    newSocket.on('rfq:proposal_received', (data) => {
      if (data.rfqId === rfqId) {
        setProposals(prev => [...prev, data]);
      }
    });

    newSocket.on('expert:matched_to_rfq', (data) => {
      if (data.rfqId === rfqId) {
        setExpertMatches(prev => [...prev, data]);
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [rfqId, authToken]);

  return {
    socket,
    rfqStatus,
    proposals,
    expertMatches
  };
};
```

## Testing Real-time Events

### Unit Tests
```javascript
describe('Real-time Events', () => {
  it('should emit rfq:created event when RFQ is created', (done) => {
    const client = io('http://localhost:5001', {
      auth: { token: validToken }
    });

    client.on('rfq:created', (data) => {
      expect(data.rfqId).toBeDefined();
      expect(data.title).toBe('Test RFQ');
      client.close();
      done();
    });

    // Trigger RFQ creation
    createTestRFQ();
  });
});
```

### Integration Tests
```javascript
describe('RFQ Workflow Real-time Integration', () => {
  it('should handle complete RFQ lifecycle events', async () => {
    const buyerSocket = createSocket(buyerToken);
    const supplierSocket = createSocket(supplierToken);

    // Test event sequence
    const events = [];
    
    buyerSocket.on('rfq:created', (data) => events.push(data));
    supplierSocket.on('rfq:created', (data) => events.push(data));
    
    // Create RFQ and verify events
    await createRFQ();
    await waitForEvents(2);
    
    expect(events).toHaveLength(2);
  });
});
```

## Performance Considerations

### Connection Optimization
- Use connection pooling for multiple users
- Implement reconnection logic with exponential backoff
- Compress large event payloads
- Use binary protocols for file transfers

### Scaling
- Redis adapter for multi-server Socket.IO scaling
- Event filtering to reduce unnecessary traffic
- Room-based message targeting
- Connection limits and rate limiting

The real-time events system provides comprehensive live updates for all major FoodXchange workflows, ensuring users stay informed about critical business activities.