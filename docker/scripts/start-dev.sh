#!/bin/bash

# ============================================================================
# Development Startup Script for Kibitz + ws-mcp
# ============================================================================

set -euo pipefail

# Color codes for logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[DEV]${NC} $1"
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

# Configuration
KIBITZ_PORT=${PORT:-3000}
WS_MCP_PORT=${WS_MCP_PORT:-10125}
PROJECT_WORKSPACE_PATH=${PROJECT_WORKSPACE_PATH:-${USER_PROJECTS_PATH:-/Users/test/gitrepo/projects}}
LOGS_PATH=${LOGS_PATH:-/app/logs}

# Create necessary directories
mkdir -p "$LOGS_PATH"
mkdir -p "$PROJECT_WORKSPACE_PATH"

log_info "Starting Kibitz development environment..."

# Function to cleanup processes on exit
cleanup() {
    log_info "Shutting down development services..."
    if [[ -n "${KIBITZ_PID:-}" ]]; then
        kill $KIBITZ_PID 2>/dev/null || true
    fi
    if [[ -n "${WS_MCP_PID:-}" ]]; then
        kill $WS_MCP_PID 2>/dev/null || true
    fi
    log_info "Development cleanup complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Check if source code is mounted
if [[ ! -d "/app/kibitz/src" ]]; then
    log_error "Source code not found! Make sure to mount the source directory."
    log_error "Expected: /app/kibitz/src"
    exit 1
fi

log_success "Source code mounted successfully"

# Check if projects directory is accessible
if [[ ! -d "$PROJECT_WORKSPACE_PATH" ]]; then
    log_warning "Projects directory not found at $PROJECT_WORKSPACE_PATH, creating..."
    mkdir -p "$PROJECT_WORKSPACE_PATH"
fi

log_success "Projects directory available at: $PROJECT_WORKSPACE_PATH"

# Function to start ws-mcp in development mode
start_ws_mcp_dev() {
    if [[ -d "/app/ws-mcp" ]] && [[ -f "/app/ws-mcp/pyproject.toml" ]]; then
        log_info "Starting ws-mcp in development mode on port $WS_MCP_PORT..."
        
        cd /app/ws-mcp
        
        # Try to start ws-mcp with uv in development mode
        if command -v uv >/dev/null 2>&1; then
            uv run --dev ws-mcp --port $WS_MCP_PORT > "$LOGS_PATH/ws-mcp-dev.log" 2>&1 &
            WS_MCP_PID=$!
            
            sleep 3
            if kill -0 $WS_MCP_PID 2>/dev/null; then
                log_success "ws-mcp development server started (PID: $WS_MCP_PID)"
            else
                log_warning "ws-mcp failed to start in dev mode, continuing without it"
                unset WS_MCP_PID
            fi
        else
            log_warning "uv not available, ws-mcp will not be started"
        fi
        
        cd /app/kibitz
    else
        log_warning "ws-mcp source not mounted or pyproject.toml not found"
        log_info "To enable ws-mcp development, mount ws-mcp source to /app/ws-mcp"
    fi
}

# Install/update dependencies if package.json changed
if [[ -f "package.json" ]]; then
    if [[ ! -f "node_modules/.dev-install-marker" ]] || [[ "package.json" -nt "node_modules/.dev-install-marker" ]]; then
        log_info "Installing/updating dependencies..."
        npm ci --no-audit --no-fund
        touch node_modules/.dev-install-marker
        log_success "Dependencies updated"
    else
        log_info "Dependencies up to date"
    fi
fi

# Start services
log_info "Starting development services..."

# Start ws-mcp development server (if available)
start_ws_mcp_dev

# Start Kibitz in development mode with hot reloading
log_info "Starting Kibitz development server on port $KIBITZ_PORT..."
log_info "Development server will have hot reloading enabled"
log_info "Debugging available on port 9229"

# Set development environment variables
export NODE_ENV=development
export NEXT_TELEMETRY_DISABLED=1
export CHOKIDAR_USEPOLLING=true
export WATCHPACK_POLLING=true

# Start the development server on a fixed port and host
npx next dev -p "$KIBITZ_PORT" -H 0.0.0.0 > "$LOGS_PATH/kibitz-dev.log" 2>&1 &
KIBITZ_PID=$!

log_success "Kibitz development server started (PID: $KIBITZ_PID)"

# Display development information
echo ""
log_info "========================================="
log_info "  Kibitz Development Environment"
log_info "========================================="
log_info "🌐 Kibitz Frontend: http://localhost:$KIBITZ_PORT"
log_info "🐛 Node.js Debugger: chrome://inspect (port 9229)"
if [[ -n "${WS_MCP_PID:-}" ]]; then
    log_info "🔌 WebSocket MCP (dev): ws://localhost:$WS_MCP_PORT"
fi
log_info "📁 Project Workspace: $PROJECT_WORKSPACE_PATH"
log_info "📋 Logs Directory: $LOGS_PATH"
log_info "🔄 Hot Reloading: Enabled"
log_info "⚡ File Watching: Enabled (polling mode for Docker)"
echo ""

# Wait for the development server to be ready
log_info "Waiting for development server to be ready..."
max_attempts=30
attempt=1

while [[ $attempt -le $max_attempts ]]; do
    if curl -sf http://localhost:$KIBITZ_PORT >/dev/null 2>&1; then
        log_success "Development server is ready!"
        break
    fi
    
    if [[ $attempt -eq $max_attempts ]]; then
        log_error "Development server failed to start within expected time"
        log_error "Check logs at: $LOGS_PATH/kibitz-dev.log"
        cleanup
        exit 1
    fi
    
    sleep 2
    ((attempt++))
done

# Monitor services and provide helpful information
log_info "Development environment ready! (Ctrl+C to stop)"
log_info "Logs are being written to: $LOGS_PATH/"
log_info "Source code changes will trigger automatic rebuilds"

# Simple monitoring loop for development
while true; do
    # Check if main process is still running
    if ! kill -0 $KIBITZ_PID 2>/dev/null; then
        log_error "Kibitz development server died unexpectedly"
        log_error "Check logs at: $LOGS_PATH/kibitz-dev.log"
        cleanup
        exit 1
    fi
    
    # Check ws-mcp if it was started
    if [[ -n "${WS_MCP_PID:-}" ]] && ! kill -0 $WS_MCP_PID 2>/dev/null; then
        log_warning "ws-mcp development server died, attempting restart..."
        start_ws_mcp_dev
    fi
    
    sleep 30
done 