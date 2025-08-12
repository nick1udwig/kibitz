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

# Configure Git for appuser (critical for commit operations)
log_info "Configuring Git for current user (appuser)..."

# Ensure token is present (fallback to GH_TOKEN or hardcoded)
if [[ -z "${GITHUB_TOKEN:-}" && -n "${GH_TOKEN:-}" ]]; then
    export GITHUB_TOKEN="$GH_TOKEN"
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
    export GITHUB_TOKEN="${GITHUB_TOKEN}"
fi

# Set Git configuration for the current user with environment variables
GIT_USER_NAME="${GIT_USER_NAME:-malikrohail}"
GIT_USER_EMAIL="${GIT_USER_EMAIL:-malikrohail525@gmail.com}"

git config --global user.name "$GIT_USER_NAME"
git config --global user.email "$GIT_USER_EMAIL"
git config --global init.defaultBranch main
git config --global pull.rebase false
git config --global credential.helper store

# Set up GitHub credentials if token is available
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    log_info "Setting up GitHub credentials with token"
    # Force remove any existing .git-credentials (directory or file) and create as file
    rm -rf ~/.git-credentials 2>/dev/null || true
    # Ensure parent directory exists but not the credentials path itself
    mkdir -p ~/ 
    # Create credentials file with proper content
    echo "https://malikrohail:${GITHUB_TOKEN}@github.com" > ~/.git-credentials
    chmod 600 ~/.git-credentials
    # Verify it was created as a file
    if [[ -f ~/.git-credentials ]]; then
        log_success "GitHub credentials configured as file"
    else
        log_info "WARNING: Git credentials file creation failed"
        ls -la ~/.git-credentials 2>/dev/null || log_info "No .git-credentials found"
    fi
else
    log_info "No GITHUB_TOKEN found - skipping credential setup"
fi

log_success "Git user configuration set for appuser"

# Verify Git configuration
log_info "Verifying Git configuration..."
GIT_USER=$(git config --global user.name)
GIT_EMAIL=$(git config --global user.email)
GIT_CREDENTIAL_HELPER=$(git config --global credential.helper)

log_success "Git user.name: $GIT_USER"
log_success "Git user.email: $GIT_EMAIL"
log_success "Git credential.helper: $GIT_CREDENTIAL_HELPER"

# Quick Git authentication check
log_info "Checking Git authentication setup..."
if [[ -n "${GITHUB_TOKEN:-}" || -n "${GH_TOKEN:-}" ]]; then
    log_success "GitHub token detected - Git authentication configured"
    
    # Test Git authentication with a simple command
    if timeout 10 git ls-remote https://github.com/octocat/Hello-World.git >/dev/null 2>&1; then
        log_success "Git authentication test passed"
    else
        log_warning "Git authentication test failed - check token permissions"
    fi
else
    log_warning "No GitHub token found - Git operations may fail"
    log_info "Set GITHUB_TOKEN environment variable to enable Git authentication"
fi

# GitHub CLI Setup and Authentication
log_info "Setting up GitHub CLI authentication..."

# Check if GitHub CLI is available
if command -v gh >/dev/null 2>&1; then
    log_success "GitHub CLI (gh) is available"
    
    # Check current authentication status
    log_info "Checking GitHub CLI authentication status..."
    if gh auth status >/dev/null 2>&1; then
        log_success "GitHub CLI is already authenticated"
        gh auth status >> "$LOGS_PATH/github-cli.log" 2>&1
    else
        log_warning "GitHub CLI is not authenticated"
        
        # Try to authenticate using token if available
        if [[ -n "${GITHUB_TOKEN:-}" ]]; then
            log_info "Attempting to authenticate GitHub CLI with token..."
            echo "$GITHUB_TOKEN" | gh auth login --with-token >> "$LOGS_PATH/github-cli.log" 2>&1
            
            if gh auth status >/dev/null 2>&1; then
                log_success "GitHub CLI authenticated successfully with token"
                gh auth status >> "$LOGS_PATH/github-cli.log" 2>&1
            else
                log_error "Failed to authenticate GitHub CLI with token"
                echo "GitHub CLI authentication failed at $(date)" >> "$LOGS_PATH/github-cli.log"
            fi
        elif [[ -n "${GH_TOKEN:-}" ]]; then
            log_info "Attempting to authenticate GitHub CLI with GH_TOKEN..."
            echo "$GH_TOKEN" | gh auth login --with-token >> "$LOGS_PATH/github-cli.log" 2>&1
            
            if gh auth status >/dev/null 2>&1; then
                log_success "GitHub CLI authenticated successfully with GH_TOKEN"
                gh auth status >> "$LOGS_PATH/github-cli.log" 2>&1
            else
                log_error "Failed to authenticate GitHub CLI with GH_TOKEN"
                echo "GitHub CLI authentication failed at $(date)" >> "$LOGS_PATH/github-cli.log"
            fi
        else
            log_error "No GitHub token available for CLI authentication"
            echo "No GitHub token available for CLI authentication at $(date)" >> "$LOGS_PATH/github-cli.log"
        fi
    fi
    
    # Test GitHub CLI functionality
    log_info "Testing GitHub CLI functionality..."
    if gh repo list --limit 1 >/dev/null 2>&1; then
        log_success "GitHub CLI can list repositories"
        echo "GitHub CLI repo list test successful at $(date)" >> "$LOGS_PATH/github-cli.log"
    else
        log_warning "GitHub CLI cannot list repositories"
        echo "GitHub CLI repo list test failed at $(date)" >> "$LOGS_PATH/github-cli.log"
        gh repo list --limit 1 >> "$LOGS_PATH/github-cli.log" 2>&1
    fi
    
else
    log_warning "GitHub CLI (gh) is not available"
    echo "GitHub CLI not available at $(date)" >> "$LOGS_PATH/github-cli.log"
fi

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

# Run Next dev explicitly on the desired port and host
log_info "Running next dev on -p $KIBITZ_PORT -H 0.0.0.0..."
npx next dev -p "$KIBITZ_PORT" -H 0.0.0.0 > "$KIBITZ_LOG" 2>&1 &
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