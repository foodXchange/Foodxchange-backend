# FoodXchange Infrastructure

This directory contains the complete Azure infrastructure as code (IaC) for the FoodXchange platform using Azure Bicep templates.

## 🏗️ Architecture Overview

The infrastructure is designed with production-grade features including:

- **Multi-region deployment** with Traffic Manager and Azure Front Door
- **Microservices architecture** with API Management
- **High performance** with Redis caching and optimized Cosmos DB
- **Enterprise security** with customer-managed encryption keys
- **Comprehensive monitoring** with Application Insights and custom dashboards
- **Auto-scaling** with intelligent workload-based scaling

## 📁 Structure

```
infrastructure/
├── main.bicep                      # Main entry point for deployment
├── deploy.ps1                      # Enhanced deployment script
├── validate.ps1                    # Validation script
├── README.md                       # This documentation
└── modules/                        # Modular Bicep templates
    ├── backend.bicep               # Core backend services
    ├── redis.bicep                 # Redis caching layer
    ├── apimanagement.bicep         # API Management and governance
    ├── cosmosdb-optimization.bicep # Optimized database collections
    ├── multiregion.bicep           # Multi-region deployment
    ├── monitoring.bicep            # Comprehensive monitoring
    └── encryption.bicep            # Customer-managed encryption
```

## 🚀 Quick Start

### Prerequisites

1. **Azure CLI** - [Install Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
2. **PowerShell 7+** - [Install PowerShell](https://docs.microsoft.com/en-us/powershell/scripting/install/installing-powershell)
3. **Azure subscription** with appropriate permissions
4. **Bicep CLI** - Installed automatically by the deployment script

### Environment Setup

1. **Login to Azure**:
   ```bash
   az login
   az account set --subscription "your-subscription-id"
   ```

2. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/foodxchange-backend.git
   cd foodxchange-backend/infrastructure
   ```

### Deployment

#### Option 1: Quick Deployment (Recommended)
```powershell
# Deploy to development environment
.\deploy.ps1 -Environment dev -Location eastus

# Deploy to production environment with validation
.\deploy.ps1 -Environment prod -Location eastus -Validate
```

#### Option 2: Manual Deployment
```bash
# Validate the templates
az deployment sub validate --location eastus --template-file main.bicep --parameters environment=dev

# Deploy to Azure
az deployment sub create --location eastus --template-file main.bicep --parameters environment=dev
```

## 🔧 Configuration

### Environment-Specific Settings

| Environment | App Service SKU | Redis SKU | API Management SKU | Features |
|-------------|-----------------|-----------|-------------------|----------|
| **dev**     | F1 (Free)       | Basic     | Consumption       | Basic monitoring |
| **staging** | B1 (Basic)      | Standard  | Developer         | Enhanced monitoring |
| **prod**    | P1v3 (Premium)  | Premium   | Standard          | Full feature set |

### Parameters

| Parameter | Description | Default | Environment Override |
|-----------|-------------|---------|---------------------|
| `environment` | Target environment | `dev` | Required |
| `location` | Azure region | `eastus` | Optional |
| `baseName` | Base name for resources | `foodxchange` | Optional |

## 🏢 Infrastructure Components

### Core Services

#### 1. **App Service**
- **SKU**: Environment-specific (F1/B1/P1v3)
- **Runtime**: Node.js 18 LTS
- **Features**: Auto-scaling, health checks, slot swapping
- **Security**: HTTPS-only, TLS 1.2, managed identity

#### 2. **Cosmos DB**
- **API**: MongoDB 4.2
- **Configuration**: Serverless with session consistency
- **Backup**: Continuous backup (7-30 days)
- **Optimization**: Custom indexing for 9 collections

#### 3. **Redis Cache**
- **SKU**: Environment-specific (Basic/Standard/Premium)
- **Configuration**: SSL-only, LRU eviction
- **Features**: Clustering (prod), persistence (prod)

#### 4. **API Management**
- **SKU**: Environment-specific (Consumption/Developer/Standard)
- **Features**: Rate limiting, CORS, JWT validation
- **Products**: Free/Basic/Premium tiers

#### 5. **Storage Account**
- **Type**: StorageV2 with Hot tier
- **Replication**: LRS (dev/staging), GRS (prod)
- **Security**: HTTPS-only, TLS 1.2, private endpoints

### Advanced Features

#### 1. **Multi-Region Deployment** (Production)
- **Traffic Manager**: Performance-based routing
- **Azure Front Door**: Global load balancing with WAF
- **Regions**: East US (primary), West US 2 (secondary), West Europe (tertiary)

#### 2. **Security**
- **Key Vault**: Centralized secrets management
- **Customer-Managed Keys**: Encryption at rest
- **Managed Identity**: Passwordless authentication
- **WAF**: Web Application Firewall protection

#### 3. **Monitoring**
- **Application Insights**: APM and diagnostics
- **Log Analytics**: Centralized logging
- **Custom Dashboards**: Real-time metrics
- **Alerts**: Proactive monitoring with email notifications

#### 4. **Auto-Scaling**
- **Default Profile**: CPU/Memory-based scaling
- **Business Hours**: Enhanced capacity (6 AM - 8 PM)
- **Harvest Season**: Peak capacity (September - November)

## 📊 Monitoring & Observability

### Key Metrics

- **Application Performance**: Response time, throughput, error rates
- **Infrastructure**: CPU, memory, disk usage
- **Database**: RU consumption, latency, connection count
- **Cache**: Hit ratio, memory usage, connection count
- **API Management**: Request rate, latency, error rate

### Dashboards

1. **Application Overview**: High-level application health
2. **Infrastructure Health**: Resource utilization and performance
3. **Security**: Authentication, authorization, and threat detection
4. **Business Metrics**: User activity, transaction volume

### Alerts

- **High Priority**: Service outages, security breaches
- **Medium Priority**: Performance degradation, capacity issues
- **Low Priority**: Maintenance reminders, optimization opportunities

## 🔐 Security

### Security Features

1. **Identity & Access**
   - Azure Active Directory integration
   - Managed identities for Azure resources
   - Role-based access control (RBAC)

2. **Data Protection**
   - Customer-managed encryption keys
   - TLS 1.2 for all communications
   - Data masking for sensitive information

3. **Network Security**
   - Virtual network integration
   - Private endpoints for data services
   - Web Application Firewall (WAF)

4. **Compliance**
   - Data residency controls
   - Audit logging
   - Backup and disaster recovery

## 🛠️ Deployment Options

### Development Deployment
```powershell
# Quick development deployment
.\deploy.ps1 -Environment dev -Location eastus -Force

# With validation
.\deploy.ps1 -Environment dev -Location eastus -Validate
```

### Staging Deployment
```powershell
# Staging deployment with what-if analysis
.\deploy.ps1 -Environment staging -Location eastus -WhatIf

# Deploy to staging
.\deploy.ps1 -Environment staging -Location eastus
```

### Production Deployment
```powershell
# Production deployment with full validation
.\deploy.ps1 -Environment prod -Location eastus -Validate

# Deploy to production (interactive confirmation)
.\deploy.ps1 -Environment prod -Location eastus

# Deploy to production (non-interactive)
.\deploy.ps1 -Environment prod -Location eastus -Force
```

## 🔍 Validation & Testing

### Pre-Deployment Validation
```powershell
# Validate all templates
.\validate.ps1 -Environment prod -Location eastus

# What-if analysis
.\deploy.ps1 -Environment prod -Location eastus -WhatIf
```

### Post-Deployment Testing
```powershell
# Health check
Invoke-WebRequest -Uri "https://your-app-service.azurewebsites.net/api/health"

# API Management health
Invoke-WebRequest -Uri "https://your-apim.azure-api.net/api/health"
```

## 📈 Performance Optimization

### Database Optimization
- **Indexing**: Custom indexes for query patterns
- **Partitioning**: Optimal partition keys for collections
- **Caching**: Redis cache for frequently accessed data

### Application Optimization
- **CDN**: Content delivery network for static assets
- **Compression**: Gzip compression for API responses
- **Connection Pooling**: Optimized database connections

### Scaling Strategy
- **Horizontal Scaling**: Auto-scaling based on demand
- **Vertical Scaling**: SKU upgrades for peak seasons
- **Geographic Scaling**: Multi-region deployment

## 🔄 CI/CD Integration

### GitHub Actions
The deployment can be integrated with GitHub Actions for automated deployments:

```yaml
# .github/workflows/deploy-infrastructure.yml
name: Deploy Infrastructure
on:
  push:
    branches: [main]
    paths: [infrastructure/**]

jobs:
  deploy:
    runs-on: windows-latest
    steps:
    - uses: actions/checkout@v4
    - name: Deploy to Azure
      run: |
        .\infrastructure\deploy.ps1 -Environment prod -Location eastus -Force
```

### Azure DevOps
For Azure DevOps pipelines, use the provided PowerShell scripts in your pipeline definition.

## 🚨 Troubleshooting

### Common Issues

1. **Deployment Failures**
   - Check Azure CLI authentication
   - Verify subscription permissions
   - Review parameter values

2. **Resource Conflicts**
   - Ensure resource names are unique
   - Check for existing resources
   - Verify resource group permissions

3. **Performance Issues**
   - Monitor Application Insights metrics
   - Check auto-scaling configuration
   - Review database query performance

### Support Resources

- **Azure Documentation**: [Azure Bicep Documentation](https://docs.microsoft.com/en-us/azure/azure-resource-manager/bicep/)
- **Issue Tracking**: Create GitHub issues for bugs and feature requests
- **Community**: Join our Slack channel for support

## 📚 Additional Resources

- [Azure Well-Architected Framework](https://docs.microsoft.com/en-us/azure/architecture/framework/)
- [Azure Security Best Practices](https://docs.microsoft.com/en-us/azure/security/fundamentals/)
- [Bicep Best Practices](https://docs.microsoft.com/en-us/azure/azure-resource-manager/bicep/best-practices)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

---

**🚀 Ready to deploy? Run `.\deploy.ps1 -Environment dev -Location eastus` to get started!**