#!/bin/bash
# ============================================================================
# Docker Build & Deploy Script for Neon Vault
# ============================================================================
# 
# Usage:
#   ./docker-deploy.sh                  # Build and start services
#   ./docker-deploy.sh --logs           # Show logs after deployment
#   ./docker-deploy.sh --restart        # Restart existing services
#   ./docker-deploy.sh --stop           # Stop all services
#   ./docker-deploy.sh --clean          # Stop and remove all containers
#   ./docker-deploy.sh --rebuild        # Force rebuild images
#
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.deploy.yml"
PROJECT_NAME="neon-vault"

# Functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    log_success "Docker is installed"
}

check_env_files() {
    if [ ! -f ".env.production" ]; then
        log_warning ".env.production not found. Using defaults."
        log_info "Copy .env.production template and update with your values:"
        log_info "  cp .env.production .env.production"
        log_info "  nano .env.production"
    else
        log_success ".env.production found"
    fi
    
    if [ ! -f "game-server/.env.production" ]; then
        log_warning "game-server/.env.production not found. Using defaults."
        log_info "Copy game-server/.env.production template and update:"
        log_info "  cp game-server/.env.production game-server/.env.production"
        log_info "  nano game-server/.env.production"
    else
        log_success "game-server/.env.production found"
    fi
}

build_images() {
    log_info "Building Docker images..."
    
    docker-compose -f "$COMPOSE_FILE" build \
        --build-arg NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-/api}" \
        --build-arg NEXT_PUBLIC_SOCKET_URL="${NEXT_PUBLIC_SOCKET_URL:-http://localhost:5000}"
    
    log_success "Docker images built successfully"
}

start_services() {
    log_info "Starting services..."
    docker-compose -f "$COMPOSE_FILE" up -d
    log_success "Services started"
}

show_status() {
    log_info "Service status:"
    docker-compose -f "$COMPOSE_FILE" ps
}

show_logs() {
    log_info "Showing logs (Ctrl+C to stop)..."
    sleep 2
    docker-compose -f "$COMPOSE_FILE" logs -f --tail=100
}

wait_for_health() {
    log_info "Waiting for services to be healthy..."
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -sf http://localhost:3000/api/public/health &>/dev/null; then
            log_success "Next.js app is healthy"
            break
        fi
        
        attempt=$((attempt + 1))
        if [ $attempt -eq $max_attempts ]; then
            log_warning "Next.js app health check timeout after 30 seconds"
            log_info "Services may still be starting. Check logs: docker-compose -f $COMPOSE_FILE logs"
            break
        fi
        
        sleep 1
    done
    
    if curl -sf http://localhost:5000/health &>/dev/null; then
        log_success "Game server is healthy"
    else
        log_warning "Game server health check failed"
    fi
}

test_services() {
    log_info "Testing services..."
    
    log_info "Testing Next.js app..."
    if curl -sf http://localhost:3000 > /dev/null; then
        log_success "Next.js app responding"
    else
        log_error "Next.js app not responding"
    fi
    
    log_info "Testing API endpoint..."
    if curl -sf http://localhost:3000/api/public/health > /dev/null; then
        log_success "API endpoint responding"
    else
        log_error "API endpoint not responding"
    fi
    
    log_info "Testing game server..."
    if curl -sf http://localhost:5000/health > /dev/null; then
        log_success "Game server responding"
    else
        log_error "Game server not responding"
    fi
}

restart_services() {
    log_info "Restarting services..."
    docker-compose -f "$COMPOSE_FILE" restart
    log_success "Services restarted"
}

stop_services() {
    log_info "Stopping services..."
    docker-compose -f "$COMPOSE_FILE" down
    log_success "Services stopped"
}

clean_everything() {
    log_warning "This will stop and remove all containers, but keep the database volume."
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose -f "$COMPOSE_FILE" down
        log_success "All containers removed (database volume preserved)"
    else
        log_info "Cancelled"
    fi
}

force_rebuild() {
    log_warning "This will rebuild all images from scratch."
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose -f "$COMPOSE_FILE" down
        docker-compose -f "$COMPOSE_FILE" build --no-cache
        log_success "Images rebuilt from scratch"
    else
        log_info "Cancelled"
    fi
}

show_help() {
    cat << EOF
${BLUE}Neon Vault Docker Deployment Script${NC}

Usage:
  $0 [COMMAND]

Commands:
  (default)       Build and start services
  --logs          Show logs after deployment
  --restart       Restart existing services
  --stop          Stop all services
  --clean         Stop and remove all containers (keeps database)
  --rebuild       Force rebuild images from scratch
  --help          Show this help message

Examples:
  $0                 # Build and deploy
  $0 --logs          # Deploy and show logs
  $0 --restart       # Restart services
  $0 --stop          # Stop all services
  $0 --clean         # Clean up containers

EOF
}

# Main script
main() {
    log_info "Starting Neon Vault deployment..."
    
    check_docker
    check_env_files
    
    case "${1:-}" in
        --logs)
            if ! docker-compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
                build_images
                start_services
                wait_for_health
            fi
            show_status
            show_logs
            ;;
        --restart)
            log_info "Restarting services..."
            restart_services
            wait_for_health
            show_status
            test_services
            ;;
        --stop)
            stop_services
            ;;
        --clean)
            clean_everything
            ;;
        --rebuild)
            force_rebuild
            start_services
            wait_for_health
            show_status
            test_services
            ;;
        --help)
            show_help
            ;;
        *)
            build_images
            start_services
            wait_for_health
            show_status
            test_services
            log_info ""
            log_success "Deployment complete!"
            log_info ""
            log_info "Next steps:"
            log_info "  - Frontend: http://localhost:3000"
            log_info "  - API: http://localhost:3000/api"
            log_info "  - Game Server: http://localhost:5000"
            log_info ""
            log_info "View logs: docker-compose -f $COMPOSE_FILE logs -f"
            log_info "Stop services: docker-compose -f $COMPOSE_FILE down"
            log_info "Check status: docker-compose -f $COMPOSE_FILE ps"
            ;;
    esac
}

# Run main script
main "$@"
