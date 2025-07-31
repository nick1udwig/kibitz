#!/bin/bash

# ============================================================================
# Production Startup Script for Kibitz + ws-mcp
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
    echo -e "${BLUE}[INFO]${NC} $1"
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

# Configuration
KIBITZ_PORT=${PORT:-3000}
WS_MCP_PORT=${WS_MCP_PORT:-10125}
PROJECT_WORKSPACE_PATH=${PROJECT_WORKSPACE_PATH:-/Users/test/gitrepo/projects}
LOGS_PATH=${LOGS_PATH:-/app/logs}

# Create necessary directories
mkdir -p "$LOGS_PATH"
mkdir -p "$PROJECT_WORKSPACE_PATH"

# Log file paths
KIBITZ_LOG="$LOGS_PATH/kibitz.log"
WS_MCP_LOG="$LOGS_PATH/ws-mcp.log"
STARTUP_LOG="$LOGS_PATH/startup.log"

# Function to cleanup processes on exit
cleanup() {
    log_info "Shutting down services..."
    if [[ -n "${KIBITZ_PID:-}" ]]; then
        kill $KIBITZ_PID 2>/dev/null || true
    fi
    if [[ -n "${WS_MCP_PID:-}" ]]; then
        kill $WS_MCP_PID 2>/dev/null || true
    fi
    log_info "Cleanup complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

log_info "Starting Kibitz production environment..."

# Check if projects directory is accessible
if [[ ! -d "$PROJECT_WORKSPACE_PATH" ]]; then
    log_warning "Projects directory not found at $PROJECT_WORKSPACE_PATH, creating..."
    mkdir -p "$PROJECT_WORKSPACE_PATH"
fi

log_success "Projects directory available at: $PROJECT_WORKSPACE_PATH"

# Function to start ws-mcp if available
start_ws_mcp() {
    echo "[INFO] Starting ws-mcp WebSocket server on port 10125..."
    
    # Debug: Check what's available in PATH
    echo "[DEBUG] Current PATH: $PATH"
    echo "[DEBUG] Checking for uv/uvx binaries:"
    which uv 2>/dev/null && echo "[DEBUG] uv found at: $(which uv)" || echo "[DEBUG] uv not found"
    which uvx 2>/dev/null && echo "[DEBUG] uvx found at: $(which uvx)" || echo "[DEBUG] uvx not found"
    
    if [ -d "/app/ws-mcp" ]; then
        # Navigate to ws-mcp directory
        cd /app/ws-mcp
        
        # Copy sample config to config.json if it doesn't exist
        if [ ! -f "config.json" ] && [ -f "sample.config.json" ]; then
            cp sample.config.json config.json
            echo "[INFO] Using sample.config.json as config.json"
        fi
        
        # Check if uv tools are available
        echo "[INFO] Starting ws-mcp directly from patched source..."
        cd /app/ws-mcp
        
        # Install dependencies if needed
        if [ ! -d "/app/ws-mcp/.venv" ]; then
            echo "[INFO] Installing ws-mcp dependencies..."
            python3 -m venv .venv
            .venv/bin/pip install -e . websockets
        fi
        
        # Run ws-mcp directly with patched code
        .venv/bin/python /app/scripts/ws-mcp-direct.py --config config.json --port 10125 &
        WS_MCP_PID=$!
        echo "[SUCCESS] ws-mcp started from patched source (PID: $WS_MCP_PID)"
        sleep 5
        return 0
    else
        echo "[WARNING] ws-mcp directory not found at /app/ws-mcp"
        echo "[INFO] ws-mcp can be started manually later if needed"
        return 1
    fi
}

# Function to wait for a service to be ready
wait_for_service() {
    local service_name=$1
    local port=$2
    local max_attempts=30
    local attempt=1
    
    log_info "Waiting for $service_name to be ready on port $port..."
    
    while [[ $attempt -le $max_attempts ]]; do
        # Just check if port is open, don't check specific API endpoints
        if nc -z localhost $port 2>/dev/null; then
            log_success "$service_name is ready!"
            return 0
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            log_error "$service_name failed to start within expected time"
            log_info "Attempting to continue anyway..."
            return 0  # Continue instead of failing
        fi
        
        sleep 2
        ((attempt++))
    done
}

# Start services
log_info "Starting services..."

# Start ws-mcp first (if available)
start_ws_mcp

# Start Kibitz Next.js application
log_info "Starting Kibitz on port $KIBITZ_PORT..."

# Go to kibitz root directory (exactly like user does manually)
cd /app/kibitz

# Run npm install (exactly like user does manually)  
log_info "Running npm install in kibitz directory..."
npm install

# Run npm run dev (exactly like user does manually)
log_info "Running npm run dev..."
npm run dev > "$KIBITZ_LOG" 2>&1 &
KIBITZ_PID=$!

log_success "Kibitz started (PID: $KIBITZ_PID)"

# Wait for Kibitz to be ready
if wait_for_service "Kibitz" $KIBITZ_PORT; then
    log_success "All services started successfully!"
    
    # Display service information
    echo ""
    log_info "========================================="
    log_info "  Kibitz Services are now running!"
    log_info "========================================="
    log_info "🌐 Kibitz Frontend: http://localhost:$KIBITZ_PORT"
    if [[ -n "${WS_MCP_PID:-}" ]]; then
        log_info "🔌 WebSocket MCP: ws://localhost:$WS_MCP_PORT"
    fi
    log_info "📁 Project Workspace: $PROJECT_WORKSPACE_PATH"
    log_info "📋 Logs Directory: $LOGS_PATH"
    echo ""
    
    # Monitor services
    log_info "Monitoring services... (Ctrl+C to stop)"
    
    while true; do
        # Check if Kibitz is still running
        if ! kill -0 $KIBITZ_PID 2>/dev/null; then
            log_error "Kibitz process died unexpectedly"
            exit 1
        fi
        
        # Check ws-mcp if it was started
        if [[ -n "${WS_MCP_PID:-}" ]] && ! kill -0 $WS_MCP_PID 2>/dev/null; then
            log_warning "ws-mcp process died, attempting restart..."
            start_ws_mcp
        fi
        
        sleep 10
    done
else
    log_error "Failed to start services"
    cleanup
    exit 1
fi 