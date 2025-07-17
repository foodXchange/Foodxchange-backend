# FoodXchange Backend Deployment Guide

This guide provides step-by-step instructions for deploying the FoodXchange backend to Azure.

## Prerequisites

- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) installed
- Azure subscription with appropriate permissions
- Node.js and npm installed
- PowerShell (for deployment scripts)

## Quick Start

### 1. Authentication

```bash
# Login to Azure (use device code for MFA)
az login --use-device-code

# Verify login
az account show
```

### 2. Deploy Infrastructure

```powershell
# Run the deployment script
.\deploy-infrastructure.ps1 -Environment dev
```

### 3. Configure Secrets

```powershell
# Populate Key Vault with secrets
.\scripts\populate-keyvault.ps1 -Environment dev -GenerateSecrets
```

### 4. Deploy Application

```bash
# Build the application
npm run build

# Start the application
npm start
```

## Detailed Deployment Steps

### Step 1: Infrastructure Deployment

The infrastructure deployment creates all necessary Azure resources:

- **Resource Group**: Container for all resources
- **App Service Plan**: Hosting plan for the web application
- **App Service**: Web application hosting
- **Key Vault**: Secure secret storage
- **Cosmos DB**: NoSQL database for application data
- **Redis Cache**: Caching layer for performance
- **Application Insights**: Monitoring and telemetry
- **API Management**: API gateway and management
- **Storage Account**: File and blob storage
- **Service Bus**: Message queuing

#### Deploy Development Environment

```powershell
.\deploy-infrastructure.ps1 -Environment dev -Location eastus
```

#### Deploy Production Environment

```powershell
.\deploy-infrastructure.ps1 -Environment prod -Location eastus
```

### Step 2: Secret Management

The Key Vault stores all sensitive configuration:

#### Auto-Generate Secrets

```powershell
.\scripts\populate-keyvault.ps1 -Environment dev -GenerateSecrets
```

#### Manual Secret Configuration

```powershell
.\scripts\populate-keyvault.ps1 -Environment dev
```

### Step 3: Application Configuration

Update the environment file with your specific values:

```env
# .env.dev
NODE_ENV=dev
USE_KEY_VAULT=true
KEY_VAULT_NAME=foodxchange-dev-kv
AZURE_SUBSCRIPTION_ID=your-subscription-id
AZURE_RESOURCE_GROUP=foodxchange-dev-rg
```

### Step 4: Database Setup

The application uses MongoDB for transactional data and Redis for caching:

#### MongoDB Configuration

1. Set up MongoDB Atlas or local MongoDB
2. Update the connection string in Key Vault
3. Run database migrations (if any)

#### Redis Configuration

Redis is automatically configured through the Azure deployment.

### Step 5: Azure AI Services Setup

Configure Azure AI services for advanced features:

1. **Azure OpenAI**: For AI-powered features
2. **Text Analytics**: For sentiment analysis
3. **Form Recognizer**: For document processing
4. **Cognitive Search**: For advanced search capabilities

Add the keys to Key Vault using the populate script.

## Environment-Specific Configurations

### Development Environment

- Single region deployment
- Basic tier resources
- Minimal monitoring
- Development-friendly settings

### Production Environment

- Multi-region deployment
- Premium tier resources
- Comprehensive monitoring
- Production-hardened security

## Monitoring and Observability

### Application Insights

Monitor application performance and errors:

```bash
# View application logs
az monitor app-insights events show --app your-app-name --type requests
```

### Azure Monitor

Set up alerts and dashboards:

1. CPU usage alerts
2. Memory usage alerts
3. Error rate monitoring
4. Response time tracking

## Security Considerations

### Key Vault Access

Ensure proper access policies:

```bash
# Grant access to Key Vault
az keyvault set-policy --name your-keyvault --upn user@domain.com --secret-permissions get list
```

### Network Security

Configure network restrictions:

1. VNet integration
2. Private endpoints
3. Web Application Firewall
4. IP whitelisting

### SSL/TLS Configuration

1. Custom domain setup
2. SSL certificate installation
3. HTTPS enforcement
4. Security headers

## Troubleshooting

### Common Issues

#### 1. Authentication Failures

```bash
# Clear cached credentials
az account clear

# Re-authenticate
az login --use-device-code
```

#### 2. Key Vault Access Denied

```bash
# Check access policies
az keyvault show --name your-keyvault --query properties.accessPolicies

# Grant required permissions
az keyvault set-policy --name your-keyvault --spn your-app-id --secret-permissions get list
```

#### 3. Database Connection Issues

1. Check connection strings in Key Vault
2. Verify network connectivity
3. Check firewall settings
4. Validate credentials

#### 4. Application Startup Errors

1. Check Application Insights logs
2. Review environment variables
3. Verify all required secrets are in Key Vault
4. Check application dependencies

### Log Analysis

#### Application Logs

```bash
# View application logs
az webapp log tail --name your-app-name --resource-group your-rg

# Download logs
az webapp log download --name your-app-name --resource-group your-rg
```

#### Azure Monitor Logs

```kusto
// Application Insights query
requests
| where timestamp > ago(1h)
| where success == false
| project timestamp, name, resultCode, duration
| order by timestamp desc
```

## Scaling and Performance

### Auto-scaling Configuration

```bash
# Configure auto-scaling
az monitor autoscale create \
    --resource-group your-rg \
    --resource your-app-service \
    --resource-type Microsoft.Web/sites \
    --name autoscale-settings \
    --min-count 2 \
    --max-count 10 \
    --count 2
```

### Performance Optimization

1. **Caching Strategy**: Redis for session and data caching
2. **CDN Integration**: Azure CDN for static assets
3. **Database Optimization**: Proper indexing and query optimization
4. **Connection Pooling**: Efficient database connections

## Backup and Disaster Recovery

### Database Backups

1. **Automated Backups**: Cosmos DB automatic backups
2. **Point-in-time Recovery**: Available for last 30 days
3. **Geo-redundancy**: Cross-region replication

### Application Backups

1. **Code Repository**: GitHub source control
2. **Configuration**: Key Vault backup
3. **Infrastructure**: ARM templates for recreation

## Cost Management

### Cost Optimization

1. **Resource Sizing**: Right-size resources for actual usage
2. **Auto-scaling**: Scale down during low usage
3. **Reserved Instances**: For predictable workloads
4. **Monitoring**: Regular cost analysis

### Cost Monitoring

```bash
# View cost analysis
az consumption usage list --start-date 2024-01-01 --end-date 2024-01-31
```

## Support and Documentation

### Additional Resources

- [Azure App Service Documentation](https://docs.microsoft.com/en-us/azure/app-service/)
- [Azure Key Vault Documentation](https://docs.microsoft.com/en-us/azure/key-vault/)
- [Azure Cosmos DB Documentation](https://docs.microsoft.com/en-us/azure/cosmos-db/)
- [Application Insights Documentation](https://docs.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview)

### Getting Help

1. **Azure Support**: For infrastructure issues
2. **GitHub Issues**: For application-specific problems
3. **Stack Overflow**: For general development questions
4. **Azure Community**: For best practices and tips

## Next Steps

After successful deployment:

1. **Performance Testing**: Load test the application
2. **Security Audit**: Conduct security review
3. **Monitoring Setup**: Configure comprehensive monitoring
4. **Documentation**: Update API documentation
5. **Team Training**: Train team on deployment procedures

## Conclusion

This deployment guide provides a comprehensive approach to deploying the FoodXchange backend to Azure. Follow the steps in order and refer to the troubleshooting section if you encounter any issues.

For production deployments, ensure all security best practices are followed and proper monitoring is in place.