# Enhanced Automated Testing Suite

## Overview

This enhanced testing suite provides comprehensive test coverage for the Foodxchange backend application, including unit tests, integration tests, end-to-end tests, and performance tests for all major components including notifications, blockchain services, and analytics.

## Test Structure

```
src/tests/
├── config/
│   └── testSetup.ts          # Test environment configuration
├── unit/
│   ├── services/
│   │   ├── notifications/    # Notification service tests
│   │   │   ├── MobilePushNotificationService.test.ts
│   │   │   └── NotificationEventHandler.test.ts
│   │   └── blockchain/       # Blockchain service tests
│   │       └── BlockchainService.test.ts
│   └── simple.test.ts        # Basic validation tests
├── integration/
│   └── notifications.integration.test.ts  # Integration tests
├── e2e/
│   └── notifications.e2e.test.ts         # End-to-end tests
├── performance/
│   └── notifications.performance.test.ts  # Performance tests
├── utils/
│   └── testHelpers.ts        # Test utilities and helpers
├── setup.ts                  # Global test setup
└── README.md                 # This file
```

## Features

### 🧪 Comprehensive Test Coverage

- **Unit Tests**: Test individual components in isolation
- **Integration Tests**: Test component interactions and API endpoints
- **End-to-End Tests**: Test complete user workflows
- **Performance Tests**: Validate system performance under load

### 🔧 Test Utilities

- **TestDataFactory**: Create test data for users, companies, products, orders
- **TestAssertions**: Validate complex data structures
- **TestPerformance**: Benchmark and monitor performance
- **TestValidation**: Validate data formats and types

### 🚀 Advanced Features

- **Mock Services**: External service mocking for isolated testing
- **Database Setup**: In-memory MongoDB for fast, isolated tests
- **Performance Monitoring**: Memory usage and execution time tracking
- **Parallel Execution**: Optimized test execution with Jest

## Running Tests

### All Tests
```bash
npm test
```

### Specific Test Categories
```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# End-to-end tests only
npm run test:e2e

# Performance tests
npm run test:performance

# With coverage
npm run test:coverage
```

### Specific Test Files
```bash
# Run notification tests
npm test -- --testPathPattern="notifications"

# Run blockchain tests
npm test -- --testPathPattern="blockchain"

# Run a specific test file
npm test -- src/tests/unit/services/notifications/MobilePushNotificationService.test.ts
```

### Watch Mode
```bash
npm run test:watch
```

## Test Configuration

### Jest Configuration (`jest.config.js`)
- TypeScript support with ts-jest
- MongoDB Memory Server for database tests
- Custom module name mapping
- Coverage reporting with thresholds
- Parallel execution with worker limits

### Environment Variables
```bash
NODE_ENV=test
JWT_SECRET=test-jwt-secret-key
MONGODB_URI=mongodb://localhost:27017/test-db
```

## Writing Tests

### Unit Test Example
```typescript
import { MobilePushNotificationService } from '../../../services/notifications/MobilePushNotificationService';

describe('MobilePushNotificationService', () => {
  let service: MobilePushNotificationService;

  beforeEach(() => {
    service = new MobilePushNotificationService();
  });

  test('should register device token', async () => {
    await service.registerDeviceToken('user123', 'ios', 'token123');
    const tokens = service.getDeviceTokens('user123');
    expect(tokens).toHaveLength(1);
  });
});
```

### Integration Test Example
```typescript
import request from 'supertest';
import app from '../../server';

describe('Notification API Integration', () => {
  test('should register device token via API', async () => {
    const response = await request(app)
      .post('/api/notifications/devices/register')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        platform: 'ios',
        token: 'test-token'
      })
      .expect(200);

    expect(response.body.success).toBe(true);
  });
});
```

### Using Test Helpers
```typescript
import { TestDataFactory, TestAssertions } from '../utils/testHelpers';

test('should create complete test scenario', async () => {
  const scenario = await TestDataFactory.createCompleteTestScenario();
  
  expect(scenario.users.buyer.role).toBe('BUYER');
  expect(scenario.users.seller.role).toBe('SELLER');
  
  TestAssertions.expectValidNotification(notification);
});
```

## Performance Testing

### Benchmark Example
```typescript
import { TestPerformance } from '../utils/testHelpers';

test('should handle bulk operations efficiently', async () => {
  const result = await TestPerformance.runBenchmark(
    async () => {
      return await service.sendBulkNotification(userIds, template, data);
    },
    100, // iterations
    'Bulk Notification Performance'
  );

  expect(result.averageDuration).toBeLessThan(1000); // < 1 second
});
```

### Memory Monitoring
```typescript
test('should maintain stable memory usage', async () => {
  const result = await TestPerformance.monitorMemoryUsage(
    async () => {
      // Perform memory-intensive operations
    },
    'Memory Usage Test'
  );

  expect(result.memoryIncrease).toBeLessThan(100); // < 100MB increase
});
```

## Mocking External Services

### Notification Services
```typescript
// Firebase Admin SDK
jest.mock('firebase-admin', () => ({
  messaging: jest.fn(() => ({
    send: jest.fn().mockResolvedValue('message-id')
  }))
}));

// Apple Push Notification Service
jest.mock('node-apn', () => ({
  Provider: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ sent: [], failed: [] })
  }))
}));
```

### Database Operations
```typescript
// MongoDB Memory Server automatically handles database mocking
// No additional configuration needed
```

## Coverage Requirements

- **Branches**: 60% minimum
- **Functions**: 60% minimum  
- **Lines**: 60% minimum
- **Statements**: 60% minimum

## Continuous Integration

### GitHub Actions Integration
```yaml
- name: Run Tests
  run: |
    npm test
    npm run test:coverage
```

### Coverage Reporting
- HTML reports generated in `coverage/` directory
- LCOV format for CI integration
- Console output for quick feedback

## Troubleshooting

### Common Issues

1. **Test Timeouts**
   ```bash
   # Increase timeout for specific tests
   test('long running test', async () => {
     // test code
   }, 10000); // 10 second timeout
   ```

2. **Memory Issues**
   ```bash
   # Run with increased memory
   node --max-old-space-size=4096 node_modules/.bin/jest
   ```

3. **Database Connection Issues**
   ```bash
   # Ensure MongoDB Memory Server is properly configured
   # Check test setup in src/tests/config/testSetup.ts
   ```

### Debug Mode
```bash
# Run tests with debug output
DEBUG=* npm test

# Run specific test with verbose output
npm test -- --verbose --testPathPattern="specific-test"
```

## Best Practices

### Test Organization
- Group related tests in describe blocks
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

### Performance
- Use beforeEach/afterEach for setup/cleanup
- Mock external dependencies
- Clear database between tests

### Maintainability
- Use test helpers for common operations
- Keep tests focused and independent
- Document complex test scenarios

## Contributing

1. Write tests for new features
2. Maintain test coverage above thresholds
3. Update documentation for new test patterns
4. Run full test suite before submitting PRs

## Dependencies

### Core Testing
- Jest: Test framework
- ts-jest: TypeScript support
- @types/jest: TypeScript definitions

### Database Testing
- mongodb-memory-server: In-memory MongoDB
- mongoose: ODM for database operations

### API Testing
- supertest: HTTP assertion library
- express: Web framework for testing

### Utilities
- jsonwebtoken: JWT token generation for auth tests