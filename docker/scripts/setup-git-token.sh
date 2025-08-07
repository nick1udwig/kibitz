#!/bin/bash

# ============================================================================
# GitHub Token Setup Script
# ============================================================================

set -euo pipefail

# Color codes for output
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

# Set the GitHub token
GITHUB_TOKEN="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"
GH_TOKEN="$GITHUB_TOKEN"

# Export the tokens
export GITHUB_TOKEN
export GH_TOKEN

# Configure Git
log_info "Configuring Git..."

# Set Git configuration
git config --global user.name "malikrohail"
git config --global user.email "malikrohail525@gmail.com"
git config --global init.defaultBranch main
git config --global pull.rebase false
git config --global credential.helper store

# Set up Git credentials
log_info "Setting up Git credentials..."

# Remove any existing credentials
rm -rf ~/.git-credentials 2>/dev/null || true

# Create new credentials file
echo "https://malikrohail:${GITHUB_TOKEN}@github.com" > ~/.git-credentials
chmod 600 ~/.git-credentials

# Verify credentials file
if [[ -f ~/.git-credentials ]]; then
    log_success "Git credentials file created successfully"
else
    log_error "Failed to create Git credentials file"
    exit 1
fi

# Test Git authentication
log_info "Testing Git authentication..."
if timeout 10 git ls-remote https://github.com/octocat/Hello-World.git >/dev/null 2>&1; then
    log_success "Git authentication test passed"
else
    log_error "Git authentication test failed"
    exit 1
fi

# Set up GitHub CLI if available
if command -v gh >/dev/null 2>&1; then
    log_info "Setting up GitHub CLI..."
    echo "$GITHUB_TOKEN" | gh auth login --with-token
    
    if gh auth status >/dev/null 2>&1; then
        log_success "GitHub CLI authenticated successfully"
    else
        log_warning "GitHub CLI authentication failed"
    fi
else
    log_warning "GitHub CLI not found - skipping CLI setup"
fi

log_success "GitHub token setup completed successfully"