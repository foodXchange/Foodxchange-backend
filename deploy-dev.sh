#!/bin/bash

# Development Server Deployment Script
# This script deploys the FoodXchange backend to a development server

set -e  # Exit on any error

# Configuration
DEV_HOST="${DEV_HOST:-your-dev-server.com}"
DEV_USER="${DEV_USER:-deploy}"
DEV_PORT="${DEV_PORT:-22}"
DEV_PATH="${DEV_PATH:-/var/www/foodxchange-backend}"
BRANCH="${BRANCH:-develop}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Check if environment variables are set
check_env() {
    log "Checking environment configuration..."
    
    if [[ "$DEV_HOST" == "your-dev-server.com" ]]; then
        error "Please set DEV_HOST environment variable to your development server address"
    fi
    
    if [[ -z "$DEV_USER" ]]; then
        error "Please set DEV_USER environment variable"
    fi
    
    log "Development server: $DEV_USER@$DEV_HOST:$DEV_PORT"
    log "Deployment path: $DEV_PATH"
}

# Build the application locally
build_application() {
    log "Building application..."
    
    # Install dependencies
    npm ci
    
    # Run linting
    npm run lint || warn "Linting warnings detected"
    
    # Run type checking
    npm run type-check || error "TypeScript errors found"
    
    # Build the application
    npm run build
    
    log "Build completed successfully"
}

# Create deployment package
create_package() {
    log "Creating deployment package..."
    
    # Create temp directory
    TEMP_DIR=$(mktemp -d)
    PACKAGE_NAME="foodxchange-backend-$(date +%Y%m%d-%H%M%S).tar.gz"
    
    # Copy necessary files
    cp -r dist package*.json tsconfig.json "$TEMP_DIR/"
    cp -r src/locales "$TEMP_DIR/dist/" 2>/dev/null || warn "No locales directory found"
    
    # Create .env template if not exists
    if [[ ! -f .env.development ]]; then
        cat > "$TEMP_DIR/.env.example" << EOF
# Development Environment Configuration
NODE_ENV=development
PORT=5001

# Database
MONGODB_URI=mongodb://localhost:27017/foodxchange_dev
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-dev-jwt-secret
JWT_REFRESH_SECRET=your-dev-refresh-secret

# Add other configuration as needed
EOF
    else
        cp .env.development "$TEMP_DIR/.env.example"
    fi
    
    # Create tarball
    tar -czf "$PACKAGE_NAME" -C "$TEMP_DIR" .
    
    # Cleanup
    rm -rf "$TEMP_DIR"
    
    log "Package created: $PACKAGE_NAME"
    echo "$PACKAGE_NAME"
}

# Upload to development server
upload_package() {
    local package_file=$1
    
    log "Uploading package to development server..."
    
    # Upload file
    scp -P "$DEV_PORT" "$package_file" "$DEV_USER@$DEV_HOST:/tmp/" || error "Failed to upload package"
    
    log "Package uploaded successfully"
}

# Deploy on remote server
deploy_remote() {
    local package_file=$1
    
    log "Deploying on remote server..."
    
    ssh -p "$DEV_PORT" "$DEV_USER@$DEV_HOST" << EOF
        set -e
        
        echo "Creating deployment directory..."
        sudo mkdir -p $DEV_PATH
        sudo chown $DEV_USER:$DEV_USER $DEV_PATH
        
        echo "Extracting package..."
        cd $DEV_PATH
        tar -xzf /tmp/$package_file
        
        echo "Installing dependencies..."
        npm ci --only=production
        
        echo "Setting up environment..."
        if [[ ! -f .env ]]; then
            cp .env.example .env
            echo "Please configure .env file on the server"
        fi
        
        echo "Installing PM2 if not installed..."
        which pm2 || sudo npm install -g pm2
        
        echo "Starting application with PM2..."
        pm2 delete foodxchange-backend || true
        pm2 start dist/server.js --name foodxchange-backend --env development
        pm2 save
        
        echo "Cleaning up..."
        rm /tmp/$package_file
        
        echo "Deployment completed!"
EOF
    
    log "Remote deployment completed"
}

# Run deployment
main() {
    log "Starting development server deployment..."
    
    # Check environment
    check_env
    
    # Build application
    build_application
    
    # Create deployment package
    PACKAGE=$(create_package)
    
    # Upload package
    upload_package "$PACKAGE"
    
    # Deploy on remote
    deploy_remote "$PACKAGE"
    
    # Cleanup local package
    rm "$PACKAGE"
    
    log "Deployment completed successfully!"
    log "Application should be running at http://$DEV_HOST:5001"
    
    # Show PM2 status
    log "Checking application status..."
    ssh -p "$DEV_PORT" "$DEV_USER@$DEV_HOST" "pm2 status"
}

# Show usage
usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Environment variables:"
    echo "  DEV_HOST    - Development server hostname (required)"
    echo "  DEV_USER    - SSH user for deployment (default: deploy)"
    echo "  DEV_PORT    - SSH port (default: 22)"
    echo "  DEV_PATH    - Deployment path on server (default: /var/www/foodxchange-backend)"
    echo "  BRANCH      - Git branch to deploy (default: develop)"
    echo ""
    echo "Example:"
    echo "  DEV_HOST=dev.example.com DEV_USER=deploy ./deploy-dev.sh"
}

# Handle arguments
case "$1" in
    -h|--help|help)
        usage
        exit 0
        ;;
    *)
        main
        ;;
esac