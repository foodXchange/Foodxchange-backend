# Advanced Analytics Dashboard

A comprehensive analytics platform providing real-time insights, predictive forecasting, and intelligent reporting for the Foodxchange B2B marketplace.

## Features

### 📊 Dashboard Analytics
- **Real-time Metrics**: Live updates on orders, revenue, and performance
- **Executive Summary**: High-level insights for decision makers
- **Custom KPIs**: Configurable key performance indicators
- **Interactive Visualizations**: Charts, graphs, and data tables

### 🔮 Predictive Analytics
- **Demand Forecasting**: ML-powered demand prediction for products
- **Price Optimization**: AI-driven pricing recommendations
- **Customer Segmentation**: Behavioral analysis and customer grouping
- **Risk Assessment**: Supply chain and business risk evaluation

### 📈 Data Visualization
- **Dynamic Charts**: Interactive charts with Chart.js
- **Report Generation**: PDF, Excel, and CSV exports
- **Custom Templates**: Branded report templates
- **Mobile-Responsive**: Optimized for all device sizes

### 🔄 Real-time Updates
- **WebSocket Integration**: Live data streaming with Socket.IO
- **Event-Driven**: Automatic updates on business events
- **Push Notifications**: Real-time alerts and notifications
- **Multi-user Support**: Concurrent user sessions

### 🎯 Advanced Features
- **Cohort Analysis**: Customer retention and behavior tracking
- **A/B Testing**: Performance comparison and optimization
- **Market Trends**: Industry insights and competitive analysis
- **Supply Chain Analytics**: Blockchain-integrated transparency

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend Layer                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │
│  │ Dashboard   │ │ Reports     │ │ Real-time       │   │
│  │ Components  │ │ Generator   │ │ Widgets         │   │
│  └─────────────┘ └─────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│                    API Layer                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │
│  │ REST APIs   │ │ GraphQL     │ │ WebSocket       │   │
│  │             │ │ Queries     │ │ Subscriptions   │   │
│  └─────────────┘ └─────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│                 Analytics Services                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │
│  │ Advanced    │ │ Predictive  │ │ Real-time       │   │
│  │ Analytics   │ │ Analytics   │ │ Analytics       │   │
│  └─────────────┘ └─────────────┘ └─────────────────┘   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │
│  │ Data        │ │ Integration │ │ Visualization   │   │
│  │ Processing  │ │ Service     │ │ Service         │   │
│  └─────────────┘ └─────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│                   Data Sources                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │
│  │ MongoDB     │ │ Redis       │ │ Blockchain      │   │
│  │ Database    │ │ Cache       │ │ Supply Chain    │   │
│  └─────────────┘ └─────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Installation

### Dependencies

```bash
npm install socket.io @socket.io/redis-adapter chart.js canvas pdfkit exceljs
```

### Configuration

Add to your environment variables:

```bash
# Analytics Configuration
ANALYTICS_ENABLE_REALTIME=true
ANALYTICS_ENABLE_PREDICTIVE=true
ANALYTICS_CACHE_TTL=3600
ANALYTICS_MAX_CONNECTIONS=1000

# Redis for Real-time (optional)
REDIS_URL=redis://localhost:6379

# Chart.js Configuration
CHART_DEFAULT_WIDTH=800
CHART_DEFAULT_HEIGHT=600
```

## API Endpoints

### Dashboard Analytics

#### Get Comprehensive Dashboard
```http
GET /api/advanced-analytics/dashboard
Authorization: Bearer <token>
Query Parameters:
  - period: 7d|30d|90d|1y
  - includeForecasts: boolean
  - includeRealtime: boolean
```

**Response:**
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalRevenue": 125000.50,
      "totalOrders": 450,
      "growthRate": 12.5,
      "conversionRate": 3.8
    },
    "sales": {
      "dailySales": [...],
      "topProducts": [...],
      "topCategories": [...]
    },
    "customers": {
      "segments": [...],
      "retention": {...}
    },
    "forecasts": [...],
    "realtime": {...}
  }
}
```

#### Executive Summary
```http
GET /api/advanced-analytics/executive-summary
Authorization: Bearer <token>
Query Parameters:
  - timeframe: WEEK|MONTH|QUARTER|YEAR
```

#### Generate Report
```http
POST /api/advanced-analytics/generate-report
Authorization: Bearer <token>
Content-Type: application/json

{
  "reportType": "COMPREHENSIVE",
  "format": "PDF",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "includeCharts": true
}
```

### Predictive Analytics

#### Get Predictive Insights
```http
GET /api/advanced-analytics/predictive-insights
Authorization: Bearer <token>
Query Parameters:
  - productIds: comma-separated product IDs
  - timeframe: WEEK|MONTH|QUARTER
```

#### Performance Benchmarks
```http
GET /api/advanced-analytics/benchmarks
Authorization: Bearer <token>
Query Parameters:
  - category: optional category filter
  - timeframe: WEEK|MONTH|QUARTER|YEAR
```

## Real-time Integration

### WebSocket Connection

```javascript
import io from 'socket.io-client';

const socket = io('/analytics', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Authenticate
socket.emit('authenticate', 'your-jwt-token');

// Subscribe to dashboard updates
socket.emit('subscribe_dashboard', {
  metrics: ['revenue', 'orders', 'realtime'],
  realtime: true
});

// Listen for updates
socket.on('metrics_update', (data) => {
  console.log('New metrics:', data);
});

socket.on('live_event', (event) => {
  console.log('Live event:', event);
});

socket.on('metric_alert', (alert) => {
  console.log('Alert:', alert);
});
```

### Event Tracking

```javascript
// Track business events for analytics
analyticsIntegrationService.trackOrderEvent('created', {
  orderId: 'ORD-123',
  amount: 250.00,
  customerId: 'CUST-456',
  companyId: 'COMP-789'
});

analyticsIntegrationService.trackRFQEvent('created', {
  rfqId: 'RFQ-123',
  category: 'vegetables',
  buyerId: 'BUYER-456',
  companyId: 'COMP-789'
});
```

## Service Integration

### Initialize Analytics Services

```javascript
import { analyticsIntegrationService } from './services/analytics/AnalyticsIntegrationService';
import { realTimeAnalyticsService } from './services/analytics/RealTimeAnalyticsService';

// Initialize with HTTP server for WebSocket support
const server = createServer(app);
await analyticsIntegrationService.initialize(server);

// Start server
server.listen(4000, () => {
  console.log('Server with analytics running on port 4000');
});
```

### Custom Analytics Configuration

```javascript
const analyticsConfig = {
  enableRealtime: true,
  enablePredictive: true,
  enableBlockchainAnalytics: true,
  cacheSettings: {
    ttl: 3600,
    maxSize: 1000
  },
  alertThresholds: {
    performanceDrops: 20,
    anomalies: 0.8,
    riskLevels: ['HIGH', 'CRITICAL']
  }
};

const analyticsService = new AnalyticsIntegrationService(analyticsConfig);
```

## Chart Generation

### Basic Chart Creation

```javascript
import { dataVisualizationService } from './services/analytics/DataVisualizationService';

const chartConfig = {
  type: 'line',
  title: 'Sales Trend',
  data: {
    labels: ['Jan', 'Feb', 'Mar', 'Apr'],
    datasets: [{
      label: 'Revenue',
      data: [1200, 1350, 1180, 1450],
      borderColor: '#3B82F6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)'
    }]
  },
  options: {
    responsive: true,
    scales: {
      y: { beginAtZero: true }
    }
  }
};

const chartBuffer = await dataVisualizationService.generateChart(chartConfig);
```

### Dashboard Report Generation

```javascript
const reportBuffer = await dataVisualizationService.generateDashboardReport(
  dashboardMetrics,
  'PDF',
  'Company Name'
);

// Save or send the report
fs.writeFileSync('dashboard-report.pdf', reportBuffer);
```

## Predictive Analytics

### Demand Forecasting

```javascript
import { predictiveAnalyticsService } from './services/analytics/PredictiveAnalyticsService';

const forecast = await predictiveAnalyticsService.generateDemandForecast(
  'PROD-123',
  'MONTH',
  6 // 6 months ahead
);

console.log(`Predicted demand: ${forecast.predictedDemand}`);
console.log(`Confidence: ${(forecast.confidence * 100).toFixed(1)}%`);
console.log(`Trend: ${forecast.trend}`);
```

### Price Optimization

```javascript
const priceOptimization = await predictiveAnalyticsService.optimizePrice('PROD-123');

console.log(`Current price: $${priceOptimization.currentPrice}`);
console.log(`Optimized price: $${priceOptimization.optimizedPrice}`);
console.log(`Expected revenue change: ${priceOptimization.expectedRevenueChange.toFixed(1)}%`);
console.log(`Recommendation: ${priceOptimization.recommendation.action}`);
```

### Customer Segmentation

```javascript
const segments = await predictiveAnalyticsService.segmentCustomers('COMP-123');

segments.forEach(segment => {
  console.log(`${segment.name}: ${segment.size} customers`);
  console.log(`Avg Order Value: $${segment.behavior.avgOrderValue}`);
  console.log(`Lifetime Value: $${segment.predictedValue.lifetime}`);
  console.log(`Churn Risk: ${(segment.predictedValue.churnRisk * 100).toFixed(1)}%`);
});
```

## Data Export

### PDF Reports

```javascript
const pdfBuffer = await dataVisualizationService.generatePDFReport({
  title: 'Monthly Analytics Report',
  subtitle: 'January 2024',
  sections: [
    {
      title: 'Overview',
      type: 'metrics',
      content: [
        { label: 'Revenue', value: '$125,000', change: 12.5 },
        { label: 'Orders', value: '450', change: 8.2 }
      ]
    },
    {
      title: 'Sales Chart',
      type: 'chart',
      content: { chartId: 'salesChart' }
    }
  ]
}, { salesChart: chartBuffer });
```

### Excel Reports

```javascript
const excelBuffer = await dataVisualizationService.generateExcelReport({
  sheets: [
    {
      name: 'Overview',
      headers: ['Metric', 'Value', 'Change'],
      data: [
        ['Revenue', 125000, 12.5],
        ['Orders', 450, 8.2]
      ]
    },
    {
      name: 'Products',
      headers: ['Product', 'Sales', 'Units'],
      data: topProducts.map(p => [p.name, p.revenue, p.units])
    }
  ]
});
```

## Performance Optimization

### Caching Strategy

```javascript
// Analytics data is cached at multiple levels:
// 1. Service-level caching (Redis)
// 2. Query-result caching
// 3. Chart image caching
// 4. Report template caching

// Cache configuration
const cacheConfig = {
  dashboardMetrics: { ttl: 1800 }, // 30 minutes
  realtimeMetrics: { ttl: 60 },    // 1 minute
  reports: { ttl: 3600 },          // 1 hour
  charts: { ttl: 7200 }            // 2 hours
};
```

### Database Optimization

```javascript
// Optimized aggregation pipelines for analytics queries
const salesPipeline = [
  { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
  { $group: { _id: '$category', revenue: { $sum: '$total' } } },
  { $sort: { revenue: -1 } },
  { $limit: 10 }
];

// Index optimization for analytics queries
// Ensure these indexes exist:
// - { createdAt: 1, status: 1 }
// - { supplier: 1, createdAt: -1 }
// - { buyer: 1, createdAt: -1 }
```

## Error Handling

### Graceful Degradation

```javascript
// Analytics services are designed to degrade gracefully
try {
  const realtimeMetrics = await advancedAnalyticsService.getRealtimeMetrics(companyId, role);
} catch (error) {
  logger.error('Real-time metrics failed, using cached data', error);
  const cachedMetrics = await getCachedRealtimeMetrics(companyId);
  return cachedMetrics || getDefaultMetrics();
}
```

### Error Monitoring

```javascript
// Comprehensive error tracking
logger.error('Analytics operation failed', {
  operation: 'generateDashboard',
  companyId,
  error: error.message,
  stack: error.stack,
  timestamp: new Date()
});
```

## Security

### Access Control

```javascript
// Role-based access to analytics features
const analyticsPermissions = {
  'ADMIN': ['all'],
  'MANAGER': ['dashboard', 'reports', 'insights'],
  'SELLER': ['dashboard', 'sales', 'products'],
  'BUYER': ['dashboard', 'orders', 'suppliers'],
  'USER': ['basic_dashboard']
};
```

### Data Privacy

```javascript
// Ensure sensitive data is properly filtered
const sanitizeAnalyticsData = (data, userRole) => {
  if (userRole !== 'ADMIN') {
    // Remove sensitive fields
    delete data.detailedCustomerInfo;
    delete data.competitorPricing;
  }
  return data;
};
```

## Testing

### Unit Tests

```javascript
describe('AdvancedAnalyticsService', () => {
  test('should generate dashboard metrics', async () => {
    const metrics = await advancedAnalyticsService.generateDashboardMetrics(
      'COMP-123',
      { start: new Date('2024-01-01'), end: new Date('2024-01-31') },
      'SELLER'
    );
    
    expect(metrics.overview).toBeDefined();
    expect(metrics.sales).toBeDefined();
    expect(metrics.overview.totalRevenue).toBeGreaterThanOrEqual(0);
  });
});
```

### Integration Tests

```javascript
describe('Real-time Analytics', () => {
  test('should emit live events', async () => {
    const socket = await connectToAnalytics();
    
    const eventPromise = new Promise(resolve => {
      socket.on('live_event', resolve);
    });
    
    await analyticsIntegrationService.trackOrderEvent('created', mockOrderData);
    
    const event = await eventPromise;
    expect(event.type).toBe('ORDER_CREATED');
  });
});
```

## Monitoring

### Health Checks

```javascript
// Analytics service health endpoint
app.get('/health/analytics', async (req, res) => {
  const health = {
    status: 'healthy',
    services: {
      realtime: realTimeAnalyticsService.isConnected(),
      cache: await cacheService.ping(),
      database: await databaseService.ping()
    },
    metrics: {
      connectedClients: realTimeAnalyticsService.getConnectedClients().total,
      cacheHitRate: await getCacheHitRate(),
      avgResponseTime: await getAvgResponseTime()
    }
  };
  
  res.json(health);
});
```

### Performance Metrics

```javascript
// Track analytics performance
const analyticsMetrics = {
  dashboardGenerationTime: histogram('analytics_dashboard_generation_seconds'),
  realtimeConnections: gauge('analytics_realtime_connections'),
  cacheHitRate: gauge('analytics_cache_hit_rate'),
  errorRate: counter('analytics_errors_total')
};
```

## Troubleshooting

### Common Issues

1. **WebSocket Connection Fails**
   - Check CORS configuration
   - Verify authentication token
   - Ensure Redis is running (if using Redis adapter)

2. **Chart Generation Errors**
   - Verify canvas dependencies are installed
   - Check data format and types
   - Ensure sufficient memory for image generation

3. **Performance Issues**
   - Check database indexes
   - Verify cache configuration
   - Monitor memory usage during report generation

4. **Report Export Failures**
   - Check file system permissions
   - Verify PDF/Excel libraries are installed
   - Ensure sufficient disk space

### Debug Mode

```javascript
// Enable debug logging
process.env.DEBUG = 'analytics:*';

// Or programmatically
logger.setLevel('debug');
```

This advanced analytics dashboard provides comprehensive insights and real-time monitoring capabilities for the Foodxchange platform, enabling data-driven decision making and business optimization.