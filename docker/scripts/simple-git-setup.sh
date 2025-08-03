#!/bin/bash

# ============================================================================
# Simple Git Configuration for Docker Environment
# Sets up Git authentication using environment variables directly
# ============================================================================

set -euo pipefail

# Function to log with timestamp
log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [simple-git-setup] $1" >&2
}

# Function to configure git globally
setup_git_config() {
    log_info "Setting up Git configuration..."
    
    # Configure Git user info from environment variables
    if [[ -n "${GIT_USER_NAME:-}" ]]; then
        git config --global user.name "$GIT_USER_NAME"
        log_info "Set Git user.name to: $GIT_USER_NAME"
    else
        log_info "WARNING: GIT_USER_NAME not set"
    fi
    
    if [[ -n "${GIT_USER_EMAIL:-}" ]]; then
        git config --global user.email "$GIT_USER_EMAIL"
        log_info "Set Git user.email to: $GIT_USER_EMAIL"
    else
        log_info "WARNING: GIT_USER_EMAIL not set"
    fi
    
    # Configure GitHub authentication using token directly
    if [[ -n "${GITHUB_TOKEN:-}" ]]; then
        # Set up credential store for GitHub
        git config --global credential.helper store
        
        # Create credentials file with GitHub token
        # Remove any existing .git-credentials directory and create as file
        rm -rf ~/.git-credentials
        echo "https://malikrohail:${GITHUB_TOKEN}@github.com" > ~/.git-credentials
        chmod 600 ~/.git-credentials
        
        log_info "Configured GitHub authentication with token (length: ${#GITHUB_TOKEN})"
    else
        log_info "WARNING: GITHUB_TOKEN not set - GitHub operations will fail"
    fi
    
    log_info "Git configuration completed successfully"
}

# Main execution
main() {
    log_info "Starting simple Git setup..."
    setup_git_config
    log_info "Simple Git setup completed"
}

# Execute main function
main "$@"