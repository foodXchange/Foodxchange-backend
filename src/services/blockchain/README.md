# Blockchain Supply Chain Integration

This module provides comprehensive blockchain integration for supply chain transparency and traceability in the Foodxchange platform.

## Features

### 🔗 Core Blockchain Integration
- **Smart Contract Integration**: Ethereum-compatible supply chain contract
- **Multi-Network Support**: Ethereum, Polygon mainnet and testnets
- **Event Listening**: Real-time blockchain event processing
- **Data Integrity**: Cryptographic hashing and verification

### 📦 Supply Chain Management
- **Product Batch Tracking**: Complete lifecycle tracking from farm to consumer
- **Event Recording**: Immutable record of supply chain events
- **Quality Metrics**: Track freshness, certifications, and compliance
- **Geographic Tracking**: Location-based event recording

### 📊 Analytics & Insights
- **Supply Chain Metrics**: Performance and compliance analytics
- **Anomaly Detection**: AI-powered pattern recognition
- **Risk Assessment**: Quality and compliance risk scoring
- **Traceability Reports**: Comprehensive batch history

### 🛡️ Compliance & Security
- **Regulatory Compliance**: FDA, USDA, HACCP, Organic standards
- **Data Verification**: Blockchain-based integrity checks
- **Access Control**: Role-based permissions and authorization
- **Audit Trails**: Immutable compliance records

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   REST APIs     │    │   GraphQL       │    │   WebSocket     │
│                 │    │   Subscriptions │    │   Events        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌─────────────────────────────────────────────────┐
         │           Blockchain Service Layer              │
         ├─────────────────────────────────────────────────┤
         │  BlockchainService │ AnalyticsService │ Events  │
         └─────────────────────────────────────────────────┘
                                 │
         ┌─────────────────────────────────────────────────┐
         │              Smart Contracts                    │
         ├─────────────────────────────────────────────────┤
         │  SupplyChain.sol │ Access Control │ Events      │
         └─────────────────────────────────────────────────┘
                                 │
         ┌─────────────────────────────────────────────────┐
         │           Blockchain Networks                   │
         ├─────────────────────────────────────────────────┤
         │  Ethereum │ Polygon │ Testnets │ Local Dev      │
         └─────────────────────────────────────────────────┘
```

## Configuration

### Environment Variables

```bash
# Blockchain Configuration
BLOCKCHAIN_PROVIDER_URL=https://mainnet.infura.io/v3/your-project-id
BLOCKCHAIN_PRIVATE_KEY=your-private-key
SUPPLY_CHAIN_CONTRACT_ADDRESS=0x...

# Network Configuration
INFURA_PROJECT_ID=your-infura-project-id
ETHERSCAN_API_KEY=your-etherscan-api-key
POLYGONSCAN_API_KEY=your-polygonscan-api-key

# WebSocket for Events (optional)
BLOCKCHAIN_WS_URL=wss://mainnet.infura.io/ws/v3/your-project-id
```

### Smart Contract Deployment

1. **Install Truffle** (if not already installed):
   ```bash
   npm install -g truffle
   ```

2. **Deploy Contract**:
   ```bash
   cd src/services/blockchain/contracts
   truffle migrate --network sepolia  # or your preferred network
   ```

3. **Verify Contract** (optional):
   ```bash
   truffle run verify SupplyChain --network sepolia
   ```

## API Endpoints

### Supply Chain Management

#### Create Product Batch
```http
POST /api/supply-chain/batches
Authorization: Bearer <token>
Content-Type: application/json

{
  "productId": "PROD-001",
  "batchNumber": "BATCH-2024-001",
  "manufacturingDate": "2024-01-15T08:00:00Z",
  "expiryDate": "2024-02-15T08:00:00Z",
  "origin": {
    "farm": "Green Valley Farm",
    "location": "California, USA",
    "certifications": ["USDA Organic", "Fair Trade"]
  },
  "qualityMetrics": {
    "grade": "A+",
    "freshness": 98,
    "organic": true,
    "tests": {
      "pesticides": "PASS",
      "contamination": "PASS"
    }
  },
  "currentLocation": "Green Valley Farm",
  "currentOwner": "COMP-001"
}
```

#### Add Supply Chain Event
```http
POST /api/supply-chain/batches/{batchId}/events
Authorization: Bearer <token>
Content-Type: application/json

{
  "eventType": "SHIPPED",
  "location": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "address": "San Francisco Distribution Center"
  },
  "actor": {
    "id": "USER-001",
    "name": "John Smith",
    "role": "LOGISTICS_MANAGER"
  },
  "metadata": {
    "temperature": 4.5,
    "humidity": 65,
    "vehicle": "TRUCK-001",
    "estimatedArrival": "2024-01-16T14:00:00Z"
  }
}
```

#### Get Batch Details
```http
GET /api/supply-chain/batches/{batchId}
Authorization: Bearer <token>
```

#### Verify Batch Integrity
```http
POST /api/supply-chain/batches/{batchId}/verify
Authorization: Bearer <token>
```

### Analytics & Reporting

#### Supply Chain Metrics
```http
GET /api/supply-chain/analytics/metrics?startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer <token>
```

#### Company Insights
```http
GET /api/supply-chain/analytics/insights?timeframe=MONTH
Authorization: Bearer <token>
```

#### Traceability Report
```http
GET /api/supply-chain/analytics/traceability/{batchId}
Authorization: Bearer <token>
```

#### Quality Risk Prediction
```http
POST /api/supply-chain/analytics/quality-prediction
Authorization: Bearer <token>
Content-Type: application/json

{
  "productId": "PROD-001",
  "temperature": 25.5,
  "humidity": 75,
  "transitTime": 48,
  "handlingCount": 3
}
```

## GraphQL Integration

### Subscriptions

```graphql
subscription {
  # New batch created
  batchCreated {
    batchId
    productId
    timestamp
  }
  
  # Supply chain event added
  supplyChainEventAdded {
    batchId
    eventType
    timestamp
  }
  
  # Quality alerts
  qualityAlert {
    batchId
    alertType
    severity
    message
  }
}
```

### Queries

```graphql
query GetSupplyChainAnalytics($companyId: ID!, $timeframe: Timeframe!) {
  supplyChainMetrics(companyId: $companyId, timeframe: $timeframe) {
    totalBatches
    verifiedBatches
    averageTransitTime
    qualityScores {
      average
      distribution
    }
    complianceRate
  }
  
  supplyChainInsights(companyId: $companyId, timeframe: $timeframe) {
    riskAssessment {
      level
      score
      factors
    }
    recommendations
    alerts {
      type
      severity
      message
    }
  }
}
```

## Event System

### Internal Events

The blockchain service emits several internal events that can be subscribed to:

```typescript
import { blockchainEventService } from './BlockchainEventService';

// Subscribe to batch creation events
blockchainEventService.on('batchCreated', (event) => {
  console.log('New batch created:', event.batchId);
});

// Subscribe to supply chain events
blockchainEventService.on('supplyChainEventAdded', (event) => {
  console.log('Supply chain event:', event.eventType, event.batchId);
});
```

### Webhook Integration

For external system integration, you can set up webhooks:

```typescript
// Custom webhook handler
blockchainEventService.subscribeToCustomEvent(
  'batchCreated',
  { productId: 'PROD-001' },
  async (event) => {
    // Send webhook to external system
    await sendWebhook('https://partner.api.com/webhook', event);
  }
);
```

## Security Considerations

### Access Control
- **Role-based permissions**: Only authorized actors can create/modify supply chain data
- **Smart contract authorization**: On-chain permission management
- **API authentication**: Bearer token validation for all endpoints

### Data Integrity
- **Cryptographic hashing**: All data is hashed before blockchain storage
- **Immutable records**: Blockchain ensures data cannot be tampered with
- **Verification**: Built-in integrity checking and verification

### Privacy
- **Data minimization**: Only essential data stored on-chain
- **Off-chain storage**: Sensitive data stored securely off-chain
- **Access controls**: Fine-grained permissions for data access

## Monitoring & Alerts

### Health Checks
```http
GET /api/supply-chain/network/status
Authorization: Bearer <admin-token>
```

### Metrics
- Transaction success rate
- Event processing latency
- Network connectivity status
- Smart contract gas usage

### Alerts
- Failed transactions
- Network disconnections
- Anomalous supply chain events
- Compliance violations

## Testing

### Unit Tests
```bash
npm run test:blockchain
```

### Integration Tests
```bash
npm run test:integration:blockchain
```

### Smart Contract Tests
```bash
cd src/services/blockchain/contracts
truffle test
```

## Deployment

### Production Checklist
- [ ] Smart contracts deployed and verified
- [ ] Environment variables configured
- [ ] Network connectivity tested
- [ ] Event listeners active
- [ ] Monitoring configured
- [ ] Backup procedures in place

### Network Recommendations
- **Production**: Ethereum Mainnet or Polygon Mainnet
- **Staging**: Sepolia Testnet or Mumbai Testnet
- **Development**: Local Ganache or Hardhat Network

## Troubleshooting

### Common Issues

1. **Contract Not Found**
   - Verify `SUPPLY_CHAIN_CONTRACT_ADDRESS` is correct
   - Check contract deployment on network

2. **Event Listening Fails**
   - Ensure WebSocket provider URL is correct
   - Check network connectivity
   - Verify contract ABI matches deployed contract

3. **Transaction Failures**
   - Check gas price and limits
   - Verify account has sufficient balance
   - Ensure proper authorization

### Debugging

Enable debug logging:
```bash
DEBUG=blockchain:* npm start
```

Check blockchain service status:
```typescript
const status = await blockchainService.getNetworkStatus();
console.log('Network status:', status);
```

## Future Enhancements

- **IPFS Integration**: Decentralized file storage for documents
- **Oracle Integration**: External data feeds for weather, prices, etc.
- **Cross-chain Support**: Multi-blockchain compatibility
- **Zero-knowledge Proofs**: Privacy-preserving verification
- **IoT Integration**: Sensor data integration
- **Machine Learning**: Predictive analytics and automation