#!/bin/bash

# ============================================================================
# Kibitz Docker Quick Start
# One-command setup for new users
# ============================================================================

set -euo pipefail

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[QUICK START]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Default mode
MODE="production"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dev|--development)
            MODE="development"
            shift
            ;;
        --prod|--production)
            MODE="production"
            shift
            ;;
        --help|-h)
            echo "Kibitz Docker Quick Start"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dev, --development    Setup development environment"
            echo "  --prod, --production    Setup production environment (default)"
            echo "  --help, -h              Show this help message"
            echo ""
            echo "This script will:"
            echo "  1. Create necessary directories"
            echo "  2. Build Docker images"
            echo "  3. Start the containers"
            echo "  4. Display access information"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo ""
log_info "========================================="
log_info "  Kibitz Docker Quick Start"
log_info "  Mode: $MODE"
log_info "========================================="
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Step 1: Check Docker
log_info "Step 1/5: Checking Docker installation..."
if ! command -v docker >/dev/null 2>&1; then
    log_error "Docker is not installed or not in PATH"
    log_error "Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    log_error "Docker daemon is not running"
    log_error "Please start Docker and try again"
    exit 1
fi

log_success "Docker is available"

# Step 2: Create directories
log_info "Step 2/5: Creating necessary directories..."
mkdir -p user/gitrepo/projects
mkdir -p docker/volumes/{data,logs}
log_success "Directories created"

# Step 3: Build image
log_info "Step 3/5: Building Docker image..."
if [[ "$MODE" == "development" ]]; then
    "$SCRIPT_DIR/scripts/build.sh" --dev
else
    "$SCRIPT_DIR/scripts/build.sh" --prod
fi

# Step 4: Start container
log_info "Step 4/5: Starting container..."
if [[ "$MODE" == "development" ]]; then
    "$SCRIPT_DIR/scripts/run-dev.sh" --detached
    CONTAINER_NAME="kibitz-development"
    EXTRA_INFO="🐛 Node.js Debugger: chrome://inspect (port 9229)"
else
    "$SCRIPT_DIR/scripts/run-prod.sh" --detached
    CONTAINER_NAME="kibitz-production"
    EXTRA_INFO=""
fi

# Step 5: Display information
log_info "Step 5/5: Verifying startup..."

# Wait for container to be ready
sleep 5

if docker ps --format "table {{.Names}}" | grep -q "^$CONTAINER_NAME$"; then
    log_success "Container is running!"
else
    log_error "Container failed to start. Check logs with:"
    log_error "docker logs $CONTAINER_NAME"
    exit 1
fi

echo ""
log_success "========================================="
log_success "  Kibitz is ready!"
log_success "========================================="
echo ""
log_info "🌐 Frontend: http://localhost:3000"
log_info "🔌 WebSocket MCP: ws://localhost:10125"
log_info "📁 Projects: $(pwd)/user/gitrepo/projects"
if [[ -n "$EXTRA_INFO" ]]; then
    log_info "$EXTRA_INFO"
fi
echo ""
log_info "📋 Container: $CONTAINER_NAME"
log_info "📊 View logs: docker logs -f $CONTAINER_NAME"
log_info "🛑 Stop: docker stop $CONTAINER_NAME"
echo ""

if [[ "$MODE" == "development" ]]; then
    log_info "Development Features:"
    log_info "  - Hot reloading enabled"
    log_info "  - Source code mounted for live editing"
    log_info "  - Debugging tools available"
    echo ""
fi

log_success "Setup complete! Open http://localhost:3000 to start using Kibitz."

# Display next steps
echo ""
log_info "Next steps:"
log_info "1. Place your code projects in: user/gitrepo/projects/"
log_info "2. Configure ws-mcp in: docker/config/ws-mcp-config.json"
log_info "3. Check the documentation: docker/README.md" 