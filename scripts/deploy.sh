#!/bin/bash

# FoodXchange Deployment Script
# Automated deployment script for production environments

set -e  # Exit on any error

# Configuration
PROJECT_NAME="foodxchange"
COMPOSE_FILE="docker-compose.production.yml"
BACKUP_DIR="/backups"
LOG_FILE="/var/log/foodxchange-deploy.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}" | tee -a "$LOG_FILE"
    exit 1
}

# Check if running as root or with sudo
check_permissions() {
    if [[ $EUID -eq 0 ]]; then
        warn "Running as root. Consider using a dedicated deployment user."
    fi
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed"
    fi
    
    # Check if Docker service is running
    if ! docker info &> /dev/null; then
        error "Docker service is not running"
    fi
    
    # Check environment file
    if [[ ! -f ".env.production" ]]; then
        error "Production environment file (.env.production) not found"
    fi
    
    log "Prerequisites check passed"
}

# Create backup before deployment
create_backup() {
    log "Creating backup before deployment..."
    
    # Create backup directory if it doesn't exist
    mkdir -p "$BACKUP_DIR"
    
    # Backup timestamp
    BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/backup_${BACKUP_TIMESTAMP}.tar.gz"
    
    # Create backup
    if docker-compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
        # Backup MongoDB
        docker-compose -f "$COMPOSE_FILE" exec -T mongodb mongodump --archive --gzip > "$BACKUP_DIR/mongo_${BACKUP_TIMESTAMP}.gz"
        
        # Backup Redis
        docker-compose -f "$COMPOSE_FILE" exec -T redis redis-cli --rdb /data/dump_${BACKUP_TIMESTAMP}.rdb
        
        # Backup PostgreSQL
        docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_dumpall -U postgres > "$BACKUP_DIR/postgres_${BACKUP_TIMESTAMP}.sql"
        
        # Backup application data
        tar -czf "$BACKUP_FILE" \
            --exclude='node_modules' \
            --exclude='.git' \
            --exclude='logs/*.log' \
            .
        
        log "Backup created: $BACKUP_FILE"
    else
        warn "Services not running, skipping database backup"
    fi
}

# Health check function
health_check() {
    local service_url="$1"
    local max_attempts="$2"
    local attempt=1
    
    log "Running health check for $service_url..."
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f -s "$service_url" > /dev/null; then
            log "Health check passed for $service_url"
            return 0
        fi
        
        warn "Health check attempt $attempt/$max_attempts failed for $service_url"
        sleep 10
        ((attempt++))
    done
    
    error "Health check failed for $service_url after $max_attempts attempts"
}

# Rolling deployment
rolling_deploy() {
    log "Starting rolling deployment..."
    
    # Pull latest images
    log "Pulling latest Docker images..."
    docker-compose -f "$COMPOSE_FILE" pull
    
    # Deploy services one by one
    SERVICES=("mongodb" "redis" "elasticsearch" "kafka" "api" "nginx")
    
    for service in "${SERVICES[@]}"; do
        log "Deploying $service..."
        
        # Update service
        docker-compose -f "$COMPOSE_FILE" up -d --no-deps "$service"
        
        # Wait for service to be healthy
        sleep 15
        
        # Check if service is running
        if ! docker-compose -f "$COMPOSE_FILE" ps "$service" | grep -q "Up"; then
            error "Service $service failed to start"
        fi
        
        log "Service $service deployed successfully"
    done
}

# Zero-downtime deployment
zero_downtime_deploy() {
    log "Starting zero-downtime deployment..."
    
    # Scale up API instances
    log "Scaling up API instances..."
    docker-compose -f "$COMPOSE_FILE" up -d --scale api=2
    
    # Wait for new instances to be healthy
    sleep 30
    health_check "http://localhost:5000/api/health" 5
    
    # Update all services
    log "Updating all services..."
    docker-compose -f "$COMPOSE_FILE" pull
    docker-compose -f "$COMPOSE_FILE" up -d
    
    # Wait for all services to be healthy
    sleep 60
    health_check "http://localhost:5000/api/health" 10
    
    log "Zero-downtime deployment completed"
}

# Cleanup old Docker resources
cleanup() {
    log "Cleaning up old Docker resources..."
    
    # Remove unused images
    docker image prune -f
    
    # Remove unused volumes (be careful with this)
    # docker volume prune -f
    
    # Remove unused networks
    docker network prune -f
    
    log "Cleanup completed"
}

# Rollback to previous version
rollback() {
    local backup_file="$1"
    
    log "Starting rollback process..."
    
    if [[ -z "$backup_file" ]]; then
        # Find latest backup
        backup_file=$(ls -t "$BACKUP_DIR"/backup_*.tar.gz | head -n1)
    fi
    
    if [[ ! -f "$backup_file" ]]; then
        error "Backup file not found: $backup_file"
    fi
    
    log "Rolling back to: $backup_file"
    
    # Stop current services
    docker-compose -f "$COMPOSE_FILE" down
    
    # Restore backup
    tar -xzf "$backup_file" -C .
    
    # Start services
    docker-compose -f "$COMPOSE_FILE" up -d
    
    # Health check
    sleep 60
    health_check "http://localhost:5000/api/health" 10
    
    log "Rollback completed successfully"
}

# Monitoring and alerting
send_notification() {
    local status="$1"
    local message="$2"
    
    # Slack notification (if webhook URL is configured)
    if [[ -n "$SLACK_WEBHOOK_URL" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚀 FoodXchange Deployment $status: $message\"}" \
            "$SLACK_WEBHOOK_URL"
    fi
    
    # Email notification (if configured)
    if [[ -n "$NOTIFICATION_EMAIL" ]]; then
        echo "$message" | mail -s "FoodXchange Deployment $status" "$NOTIFICATION_EMAIL"
    fi
}

# Main deployment function
main() {
    local deployment_type="${1:-rolling}"
    
    log "Starting FoodXchange deployment (type: $deployment_type)"
    
    # Check prerequisites
    check_permissions
    check_prerequisites
    
    # Create backup
    create_backup
    
    # Deploy based on type
    case "$deployment_type" in
        "rolling")
            rolling_deploy
            ;;
        "zero-downtime")
            zero_downtime_deploy
            ;;
        "rollback")
            rollback "$2"
            return
            ;;
        *)
            error "Unknown deployment type: $deployment_type"
            ;;
    esac
    
    # Post-deployment tasks
    log "Running post-deployment tasks..."
    
    # Health checks
    health_check "http://localhost:5000/api/health" 5
    health_check "http://localhost:5000/api/payments/health" 3
    health_check "http://localhost:5000/api/search/health" 3
    
    # Cleanup
    cleanup
    
    # Send success notification
    send_notification "SUCCESS" "Deployment completed successfully at $(date)"
    
    log "Deployment completed successfully!"
}

# Script usage
usage() {
    echo "Usage: $0 [deployment_type] [backup_file]"
    echo ""
    echo "Deployment types:"
    echo "  rolling       - Rolling deployment (default)"
    echo "  zero-downtime - Zero-downtime deployment"
    echo "  rollback      - Rollback to previous version"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Rolling deployment"
    echo "  $0 zero-downtime                     # Zero-downtime deployment"
    echo "  $0 rollback                          # Rollback to latest backup"
    echo "  $0 rollback /backups/backup_xyz.tar.gz # Rollback to specific backup"
}

# Handle script arguments
case "$1" in
    "-h"|"--help"|"help")
        usage
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac