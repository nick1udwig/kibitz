#!/bin/bash

# ============================================================================
# Development Run Script for Kibitz
# ============================================================================

set -euo pipefail

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[DEV RUN]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[DEV SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[DEV WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[DEV ERROR]${NC} $1"
}

# Default configuration
CONTAINER_NAME="kibitz-development"
IMAGE_TAG="kibitz:dev"
KIBITZ_PORT=3000
WS_MCP_PORT=10125
DEBUG_PORT=9229
DETACHED=""
REMOVE=""

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$DOCKER_DIR")"

# Default directories
PROJECTS_DIR="$PROJECT_ROOT/user/gitrepo/projects"
WS_MCP_DIR=""

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
        --debug-port)
            DEBUG_PORT="$2"
            shift 2
            ;;
        --projects-dir)
            PROJECTS_DIR="$2"
            shift 2
            ;;
        --ws-mcp-dir)
            WS_MCP_DIR="$2"
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
            echo "  --debug-port PORT       Node.js debug port (default: 9229)"
            echo "  --projects-dir PATH     Projects directory path"
            echo "  --ws-mcp-dir PATH       ws-mcp source directory (optional)"
            echo "  --detached, -d          Run in detached mode"
            echo "  --rm                    Remove container when it exits"
            echo "  --name NAME             Container name (default: kibitz-development)"
            echo "  --help, -h              Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

log_info "Starting Kibitz development container..."

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

# Check if the development image exists
if ! docker images --format "table {{.Repository}}:{{.Tag}}" | grep -q "^$IMAGE_TAG$"; then
    log_warning "Development image $IMAGE_TAG not found. Building it now..."
    "$SCRIPT_DIR/build.sh" --dev
fi

log_info "Development Configuration:"
log_info "  Container name: $CONTAINER_NAME"
log_info "  Image: $IMAGE_TAG"
log_info "  Kibitz port: $KIBITZ_PORT"
log_info "  WebSocket port: $WS_MCP_PORT"
log_info "  Debug port: $DEBUG_PORT"
log_info "  Projects directory: $PROJECTS_DIR"
if [[ -n "$WS_MCP_DIR" ]]; then
    log_info "  ws-mcp directory: $WS_MCP_DIR"
else
    log_warning "  ws-mcp directory: Not mounted (ws-mcp disabled)"
fi

# Prepare volume mounts
VOLUME_MOUNTS=(
    # Source code for live reloading
    "-v" "$PROJECT_ROOT/src:/app/kibitz/src"
    "-v" "$PROJECT_ROOT/public:/app/kibitz/public"
    "-v" "$PROJECT_ROOT/package.json:/app/kibitz/package.json:ro"
    "-v" "$PROJECT_ROOT/package-lock.json:/app/kibitz/package-lock.json:ro"
    "-v" "$PROJECT_ROOT/tsconfig.json:/app/kibitz/tsconfig.json:ro"
    "-v" "$PROJECT_ROOT/next.config.ts:/app/kibitz/next.config.ts:ro"
    "-v" "$PROJECT_ROOT/tailwind.config.ts:/app/kibitz/tailwind.config.ts:ro"
    "-v" "$PROJECT_ROOT/postcss.config.mjs:/app/kibitz/postcss.config.mjs:ro"
    
    # Data and logs
    "-v" "$PROJECT_ROOT/data:/app/kibitz/data"
    "-v" "$DOCKER_DIR/volumes/logs:/app/logs"
    
    # Projects directory
    "-v" "$PROJECTS_DIR:/app/projects"
    
    # Node modules cache
    "-v" "kibitz-dev-node-modules:/app/kibitz/node_modules"
)

# Add ws-mcp volume if directory is provided
if [[ -n "$WS_MCP_DIR" ]] && [[ -d "$WS_MCP_DIR" ]]; then
    VOLUME_MOUNTS+=("-v" "$WS_MCP_DIR:/app/ws-mcp")
    log_success "ws-mcp development directory mounted"
fi

# Run the development container
log_info "Starting development container with live reloading..."

docker run \
    $DETACHED \
    $REMOVE \
    --name "$CONTAINER_NAME" \
    --init \
    -p "$KIBITZ_PORT:3000" \
    -p "$WS_MCP_PORT:10125" \
    -p "$DEBUG_PORT:9229" \
    "${VOLUME_MOUNTS[@]}" \
    -e "NODE_ENV=development" \
    -e "PYTHONUNBUFFERED=1" \
    -e "NEXT_TELEMETRY_DISABLED=1" \
    -e "PORT=3000" \
    -e "WS_MCP_PORT=10125" \
    -e "PROJECT_WORKSPACE_PATH=/app/projects" \
    -e "CHOKIDAR_USEPOLLING=true" \
    -e "WATCHPACK_POLLING=true" \
    -e "DEBUG=*" \
    -e "NODE_OPTIONS=--inspect=0.0.0.0:9229" \
    --security-opt no-new-privileges:true \
    "$IMAGE_TAG"

if [[ -z "$DETACHED" ]]; then
    log_info "Development container started in foreground mode (Ctrl+C to stop)"
else
    log_success "Development container started successfully!"
    echo ""
    log_info "========================================="
    log_info "  Kibitz Development Environment"
    log_info "========================================="
    log_info "🌐 Kibitz Frontend: http://localhost:$KIBITZ_PORT"
    log_info "🐛 Node.js Debugger: chrome://inspect (localhost:$DEBUG_PORT)"
    if [[ -n "$WS_MCP_DIR" ]]; then
        log_info "🔌 WebSocket MCP (dev): ws://localhost:$WS_MCP_PORT"
    fi
    log_info "📁 Projects Directory: $PROJECTS_DIR"
    log_info "📋 Container Name: $CONTAINER_NAME"
    log_info "🔄 Hot Reloading: Enabled"
    log_info "⚡ File Watching: Enabled"
    echo ""
    log_info "Development Features:"
    log_info "  - Source code changes trigger rebuilds"
    log_info "  - Node.js debugging enabled"
    log_info "  - Detailed logging enabled"
    echo ""
    log_info "📊 View logs: docker logs -f $CONTAINER_NAME"
    log_info "🛑 Stop container: docker stop $CONTAINER_NAME"
    log_info "🔍 Container status: docker ps"
    echo ""
    log_info "🚀 Ready for development!"
fi 