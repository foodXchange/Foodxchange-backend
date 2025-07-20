#!/bin/bash

# Upload FoodXchange Backend to Development Server
# This script packages and uploads the application to a dev server

set -e  # Exit on error

# Configuration
REMOTE_HOST="${DEV_HOST:-}"
REMOTE_USER="${DEV_USER:-deploy}"
REMOTE_PORT="${DEV_PORT:-22}"
REMOTE_PATH="${DEV_PATH:-/home/$REMOTE_USER/foodxchange-backend}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Functions
log() { echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING: $1${NC}"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] ERROR: $1${NC}"; exit 1; }

# Check requirements
check_requirements() {
    log "Checking requirements..."
    
    if [[ -z "$REMOTE_HOST" ]]; then
        error "DEV_HOST environment variable is required. Example: DEV_HOST=192.168.1.100 ./upload-to-dev.sh"
    fi
    
    # Test SSH connection
    if ! ssh -p "$REMOTE_PORT" -o ConnectTimeout=5 "$REMOTE_USER@$REMOTE_HOST" "echo 'SSH connection successful'" > /dev/null 2>&1; then
        error "Cannot connect to $REMOTE_USER@$REMOTE_HOST:$REMOTE_PORT"
    fi
    
    log "Requirements check passed"
}

# Create deployment package
create_package() {
    log "Creating deployment package..."
    
    PACKAGE_DIR="foodxchange-backend-$(date +%Y%m%d-%H%M%S)"
    PACKAGE_FILE="${PACKAGE_DIR}.tar.gz"
    
    # Create temporary directory
    mkdir -p "/tmp/$PACKAGE_DIR"
    
    # Copy files (excluding unnecessary ones)
    rsync -av \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='dist' \
        --exclude='logs/*' \
        --exclude='uploads/*' \
        --exclude='*.log' \
        --exclude='.env' \
        --exclude='.env.local' \
        --exclude='.DS_Store' \
        --exclude='coverage' \
        --exclude='.nyc_output' \
        ./ "/tmp/$PACKAGE_DIR/"
    
    # Create tarball
    cd /tmp
    tar -czf "$PACKAGE_FILE" "$PACKAGE_DIR"
    rm -rf "$PACKAGE_DIR"
    
    log "Package created: /tmp/$PACKAGE_FILE"
    echo "/tmp/$PACKAGE_FILE"
}

# Upload package
upload_package() {
    local package_file=$1
    
    log "Uploading package to $REMOTE_HOST..."
    
    # Upload file
    scp -P "$REMOTE_PORT" "$package_file" "$REMOTE_USER@$REMOTE_HOST:/tmp/" || error "Failed to upload package"
    
    # Extract on remote
    ssh -p "$REMOTE_PORT" "$REMOTE_USER@$REMOTE_HOST" << EOF
        set -e
        
        # Create directory if not exists
        mkdir -p "$REMOTE_PATH"
        
        # Backup existing deployment
        if [ -d "$REMOTE_PATH/src" ]; then
            echo "Creating backup..."
            tar -czf "$REMOTE_PATH/backup-\$(date +%Y%m%d-%H%M%S).tar.gz" \
                --exclude='node_modules' \
                --exclude='logs' \
                --exclude='uploads' \
                "$REMOTE_PATH"
        fi
        
        # Extract new deployment
        cd "$REMOTE_PATH"
        tar -xzf "/tmp/$(basename $package_file)"
        mv "$(basename $package_file .tar.gz)"/* . 2>/dev/null || true
        rmdir "$(basename $package_file .tar.gz)" 2>/dev/null || true
        
        # Clean up
        rm "/tmp/$(basename $package_file)"
        
        echo "Package extracted successfully"
EOF
    
    log "Upload completed"
}

# Setup remote environment
setup_remote() {
    log "Setting up remote environment..."
    
    ssh -p "$REMOTE_PORT" "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
        set -e
        cd "$REMOTE_PATH"
        
        # Copy environment file if not exists
        if [ ! -f .env ]; then
            if [ -f .env.development ]; then
                cp .env.development .env
                echo "Created .env from .env.development"
            else
                echo "WARNING: No .env file found. Please create one."
            fi
        fi
        
        # Install dependencies
        echo "Installing dependencies..."
        npm ci
        
        # Build application
        echo "Building application..."
        npm run build
        
        # Create necessary directories
        mkdir -p logs uploads dist/locales
        
        # Copy locales if they exist
        if [ -d "src/locales" ]; then
            cp -r src/locales/* dist/locales/ 2>/dev/null || true
        fi
        
        echo "Setup completed"
EOF
    
    log "Remote setup completed"
}

# Start application
start_application() {
    log "Starting application..."
    
    ssh -p "$REMOTE_PORT" "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
        set -e
        cd "$REMOTE_PATH"
        
        # Check if PM2 is installed
        if ! command -v pm2 &> /dev/null; then
            echo "Installing PM2..."
            npm install -g pm2
        fi
        
        # Stop existing process if running
        pm2 stop foodxchange-backend 2>/dev/null || true
        pm2 delete foodxchange-backend 2>/dev/null || true
        
        # Start application
        if [ -f ecosystem.config.js ]; then
            pm2 start ecosystem.config.js --env development
        else
            pm2 start dist/server.js --name foodxchange-backend \
                --node-args="--max-old-space-size=1024" \
                --instances 2 \
                --exec-mode cluster
        fi
        
        # Save PM2 configuration
        pm2 save
        
        # Show status
        pm2 status
        
        echo "Application started successfully"
EOF
    
    log "Application is running"
}

# Main execution
main() {
    log "Starting deployment to development server"
    log "Target: $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH"
    
    # Check requirements
    check_requirements
    
    # Create and upload package
    PACKAGE=$(create_package)
    upload_package "$PACKAGE"
    
    # Setup and start
    setup_remote
    start_application
    
    # Cleanup local package
    rm -f "$PACKAGE"
    
    log "Deployment completed successfully!"
    log ""
    log "Next steps:"
    log "1. SSH to server: ssh -p $REMOTE_PORT $REMOTE_USER@$REMOTE_HOST"
    log "2. Check logs: pm2 logs foodxchange-backend"
    log "3. Monitor: pm2 monit"
    log "4. Test API: curl http://$REMOTE_HOST:5001/health"
}

# Show usage
if [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
    echo "Usage: DEV_HOST=<host> [DEV_USER=<user>] [DEV_PORT=<port>] ./upload-to-dev.sh"
    echo ""
    echo "Environment variables:"
    echo "  DEV_HOST  - Remote host IP or domain (required)"
    echo "  DEV_USER  - SSH user (default: deploy)"
    echo "  DEV_PORT  - SSH port (default: 22)"
    echo "  DEV_PATH  - Remote path (default: /home/\$DEV_USER/foodxchange-backend)"
    echo ""
    echo "Example:"
    echo "  DEV_HOST=192.168.1.100 ./upload-to-dev.sh"
    echo "  DEV_HOST=dev.example.com DEV_USER=ubuntu DEV_PORT=2222 ./upload-to-dev.sh"
    exit 0
fi

# Run main function
main