#!/bin/bash

# FoodXchange Backend Infrastructure Deployment Script
# This script simplifies the deployment of the FoodXchange backend infrastructure

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Default values
LOCATION="eastus"
WHATIF=false

# Functions
write_status() {
    echo -e "\n${GRAY}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} ${GREEN}$1${NC}"
}

write_error() {
    echo -e "\n${GRAY}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} ${RED}ERROR: $1${NC}"
}

write_warning() {
    echo -e "\n${GRAY}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} ${YELLOW}WARNING: $1${NC}"
}

show_usage() {
    echo "Usage: $0 -e <environment> [-l <location>] [-s <subscription-id>] [-w]"
    echo ""
    echo "Options:"
    echo "  -e  Environment (required): dev, staging, or prod"
    echo "  -l  Azure location (default: eastus)"
    echo "  -s  Azure subscription ID (optional)"
    echo "  -w  What-if mode (preview changes without deploying)"
    echo ""
    echo "Example: $0 -e dev"
    echo "Example: $0 -e prod -l westus2 -w"
    exit 1
}

# Parse command line arguments
while getopts "e:l:s:wh" opt; do
    case $opt in
        e)
            ENVIRONMENT=$OPTARG
            ;;
        l)
            LOCATION=$OPTARG
            ;;
        s)
            SUBSCRIPTION_ID=$OPTARG
            ;;
        w)
            WHATIF=true
            ;;
        h)
            show_usage
            ;;
        \?)
            echo "Invalid option: -$OPTARG" >&2
            show_usage
            ;;
    esac
done

# Validate environment parameter
if [ -z "$ENVIRONMENT" ]; then
    write_error "Environment parameter is required"
    show_usage
fi

if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    write_error "Invalid environment: $ENVIRONMENT"
    echo "Valid environments are: dev, staging, prod"
    exit 1
fi

write_status "Starting FoodXchange Backend Infrastructure Deployment"
echo -e "${CYAN}Environment: $ENVIRONMENT${NC}"
echo -e "${CYAN}Location: $LOCATION${NC}"

# Check if Azure CLI is installed
write_status "Checking Azure CLI installation..."
if ! command -v az &> /dev/null; then
    write_error "Azure CLI is not installed. Please install it first."
    echo "Visit: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi
AZ_VERSION=$(az version --query '"azure-cli"' -o tsv)
echo -e "${GRAY}Azure CLI version: $AZ_VERSION${NC}"

# Check if Bicep is installed
write_status "Checking Bicep installation..."
BICEP_VERSION=$(az bicep version 2>&1)
echo -e "${GRAY}Bicep version: $BICEP_VERSION${NC}"

# Login check
write_status "Checking Azure login status..."
if ! az account show &> /dev/null; then
    write_warning "Not logged in to Azure. Please login..."
    az login
fi

ACCOUNT_INFO=$(az account show --output json)
ACCOUNT_NAME=$(echo $ACCOUNT_INFO | jq -r '.name')
ACCOUNT_ID=$(echo $ACCOUNT_INFO | jq -r '.id')
USER_NAME=$(echo $ACCOUNT_INFO | jq -r '.user.name')

echo -e "${GRAY}Logged in as: $USER_NAME${NC}"
echo -e "${GRAY}Subscription: $ACCOUNT_NAME ($ACCOUNT_ID)${NC}"

# Set subscription if provided
if [ ! -z "$SUBSCRIPTION_ID" ]; then
    write_status "Setting subscription to: $SUBSCRIPTION_ID"
    az account set --subscription "$SUBSCRIPTION_ID"
fi

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Validate Bicep templates
write_status "Validating Bicep templates..."
MAIN_BICEP="$SCRIPT_DIR/main.bicep"
MODULE_BICEP="$SCRIPT_DIR/modules/backend.bicep"

if ! az bicep build --file "$MAIN_BICEP" &> /dev/null; then
    write_error "Main Bicep template validation failed"
    exit 1
fi

if ! az bicep build --file "$MODULE_BICEP" &> /dev/null; then
    write_error "Backend module Bicep template validation failed"
    exit 1
fi
echo -e "${GREEN}✓ Bicep templates are valid${NC}"

# Prepare deployment parameters
DEPLOYMENT_NAME="foodxchange-$ENVIRONMENT-$(date +%Y%m%d%H%M%S)"
PARAMETERS_FILE="$SCRIPT_DIR/parameters/$ENVIRONMENT.parameters.json"

if [ ! -f "$PARAMETERS_FILE" ]; then
    write_error "Parameters file not found: $PARAMETERS_FILE"
    exit 1
fi

# Show deployment preview if WhatIf
if [ "$WHATIF" = true ]; then
    write_status "Running What-If deployment preview..."
    az deployment sub what-if \
        --name "$DEPLOYMENT_NAME" \
        --location "$LOCATION" \
        --template-file "$MAIN_BICEP" \
        --parameters "$PARAMETERS_FILE" \
        --output table
    
    write_warning "This was a What-If preview. No resources were deployed."
    exit 0
fi

# Confirm deployment
write_warning "You are about to deploy to the '$ENVIRONMENT' environment."
read -p "Do you want to continue? (yes/no): " CONFIRMATION
if [ "$CONFIRMATION" != "yes" ]; then
    write_warning "Deployment cancelled by user"
    exit 0
fi

# Execute deployment
write_status "Starting deployment: $DEPLOYMENT_NAME"
DEPLOYMENT_OUTPUT=$(az deployment sub create \
    --name "$DEPLOYMENT_NAME" \
    --location "$LOCATION" \
    --template-file "$MAIN_BICEP" \
    --parameters "$PARAMETERS_FILE" \
    --output json)

if [ $? -ne 0 ]; then
    write_error "Deployment failed"
    exit 1
fi

# Extract outputs
RESOURCE_GROUP=$(echo $DEPLOYMENT_OUTPUT | jq -r '.properties.outputs.resourceGroupName.value')
APP_SERVICE_URL=$(echo $DEPLOYMENT_OUTPUT | jq -r '.properties.outputs.appServiceUrl.value')
APP_SERVICE_NAME=$(echo $DEPLOYMENT_OUTPUT | jq -r '.properties.outputs.appServiceName.value')
KEY_VAULT_URI=$(echo $DEPLOYMENT_OUTPUT | jq -r '.properties.outputs.keyVaultUri.value')
COSMOS_DB_ENDPOINT=$(echo $DEPLOYMENT_OUTPUT | jq -r '.properties.outputs.cosmosDbEndpoint.value')

# Display outputs
write_status "Deployment completed successfully!"
echo -e "\n${CYAN}Deployment Outputs:${NC}"
echo -e "${GRAY}Resource Group: $RESOURCE_GROUP${NC}"
echo -e "${GRAY}App Service URL: $APP_SERVICE_URL${NC}"
echo -e "${GRAY}App Service Name: $APP_SERVICE_NAME${NC}"
echo -e "${GRAY}Key Vault URI: $KEY_VAULT_URI${NC}"
echo -e "${GRAY}Cosmos DB Endpoint: $COSMOS_DB_ENDPOINT${NC}"

# Health check
write_status "Waiting for application to start..."
sleep 30

HEALTH_URL="$APP_SERVICE_URL/api/health"
write_status "Checking application health at: $HEALTH_URL"

if curl -s -f -o /dev/null "$HEALTH_URL"; then
    echo -e "${GREEN}✓ Application is healthy!${NC}"
else
    write_warning "Health check failed. The application might still be starting up."
    echo -e "${YELLOW}Please check: $HEALTH_URL${NC}"
fi

# Next steps
echo -e "\n${CYAN}Next Steps:${NC}"
echo -e "${GRAY}1. Configure environment variables in the Azure Portal${NC}"
echo -e "${GRAY}2. Set up custom domain (if needed)${NC}"
echo -e "${GRAY}3. Configure monitoring alerts${NC}"
echo -e "${GRAY}4. Review auto-scaling settings${NC}"

# Save deployment info
DEPLOYMENT_INFO_DIR="$SCRIPT_DIR/deployments"
mkdir -p "$DEPLOYMENT_INFO_DIR"
DEPLOYMENT_INFO_FILE="$DEPLOYMENT_INFO_DIR/$ENVIRONMENT-latest.json"

cat > "$DEPLOYMENT_INFO_FILE" <<EOF
{
  "deploymentName": "$DEPLOYMENT_NAME",
  "environment": "$ENVIRONMENT",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "resourceGroup": "$RESOURCE_GROUP",
  "appServiceUrl": "$APP_SERVICE_URL",
  "appServiceName": "$APP_SERVICE_NAME",
  "keyVaultUri": "$KEY_VAULT_URI"
}
EOF

echo -e "\n${GRAY}Deployment info saved to: $DEPLOYMENT_INFO_FILE${NC}"