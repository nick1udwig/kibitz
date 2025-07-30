#!/bin/bash

# ============================================================================
# Production Run Script for Kibitz
# ============================================================================

set -euo pipefail

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[RUN]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[RUN SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[RUN WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[RUN ERROR]${NC} $1"
}

# Default configuration
CONTAINER_NAME="kibitz-production"
IMAGE_TAG="kibitz:latest"
KIBITZ_PORT=3000
WS_MCP_PORT=10125
DETACHED=""
REMOVE=""

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$DOCKER_DIR")"

# Default projects directory
PROJECTS_DIR="$PROJECT_ROOT/user/gitrepo/projects"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --port|-p)
            KIBITZ_PORT="$2"
            shift 2
            ;;
        --ws-port)
            WS_MCP_PORT="$2"
            shift 2
            ;;
        --projects-dir)
            PROJECTS_DIR="$2"
            shift 2
            ;;
        --detached|-d)
            DETACHED="-d"
            shift
            ;;
        --rm)
            REMOVE="--rm"
            shift
            ;;
        --name)
            CONTAINER_NAME="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --port, -p PORT         Kibitz frontend port (default: 3000)"
            echo "  --ws-port PORT          WebSocket MCP port (default: 10125)"
            echo "  --projects-dir PATH     Projects directory path"
            echo "  --detached, -d          Run in detached mode"
            echo "  --rm                    Remove container when it exits"
            echo "  --name NAME             Container name (default: kibitz-production)"
            echo "  --help, -h              Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

log_info "Starting Kibitz production container..."

# Create projects directory if it doesn't exist
if [[ ! -d "$PROJECTS_DIR" ]]; then
    log_info "Creating projects directory: $PROJECTS_DIR"
    mkdir -p "$PROJECTS_DIR"
fi

# Create volume directories
mkdir -p "$DOCKER_DIR/volumes/"{data,logs}

# Stop and remove existing container if it exists
if docker ps -a --format "table {{.Names}}" | grep -q "^$CONTAINER_NAME$"; then
    log_info "Stopping and removing existing container: $CONTAINER_NAME"
    docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

# Check if the image exists
if ! docker images --format "table {{.Repository}}:{{.Tag}}" | grep -q "^$IMAGE_TAG$"; then
    log_warning "Image $IMAGE_TAG not found. Building it now..."
    "$SCRIPT_DIR/build.sh" --prod
fi

log_info "Configuration:"
log_info "  Container name: $CONTAINER_NAME"
log_info "  Image: $IMAGE_TAG"
log_info "  Kibitz port: $KIBITZ_PORT"
log_info "  WebSocket port: $WS_MCP_PORT"
log_info "  Projects directory: $PROJECTS_DIR"

# Run the container
log_info "Starting container..."

docker run \
    $DETACHED \
    $REMOVE \
    --name "$CONTAINER_NAME" \
    --init \
    -p "$KIBITZ_PORT:3000" \
    -p "$WS_MCP_PORT:10125" \
    -v "$PROJECTS_DIR:/app/projects" \
    -v "$DOCKER_DIR/volumes/data:/app/kibitz/data" \
    -v "$DOCKER_DIR/volumes/logs:/app/logs" \
    -v "$DOCKER_DIR/config/ws-mcp-config.json:/app/config/ws-mcp-config.json:ro" \
    -e "NODE_ENV=production" \
    -e "PYTHONUNBUFFERED=1" \
    -e "NEXT_TELEMETRY_DISABLED=1" \
    -e "PORT=3000" \
    -e "WS_MCP_PORT=10125" \
    -e "PROJECT_WORKSPACE_PATH=/app/projects" \
    --restart unless-stopped \
    --security-opt no-new-privileges:true \
    --cap-drop ALL \
    --cap-add CHOWN \
    --cap-add SETUID \
    --cap-add SETGID \
    --cap-add DAC_OVERRIDE \
    --cap-add NET_BIND_SERVICE \
    "$IMAGE_TAG"

if [[ -z "$DETACHED" ]]; then
    log_info "Container started in foreground mode (Ctrl+C to stop)"
else
    log_success "Container started successfully in detached mode!"
    echo ""
    log_info "========================================="
    log_info "  Kibitz Production Environment"
    log_info "========================================="
    log_info "🌐 Kibitz Frontend: http://localhost:$KIBITZ_PORT"
    log_info "🔌 WebSocket MCP: ws://localhost:$WS_MCP_PORT"
    log_info "📁 Projects Directory: $PROJECTS_DIR"
    log_info "📋 Container Name: $CONTAINER_NAME"
    echo ""
    log_info "📊 View logs: docker logs -f $CONTAINER_NAME"
    log_info "🛑 Stop container: docker stop $CONTAINER_NAME"
    log_info "🔍 Container status: docker ps"
fi 