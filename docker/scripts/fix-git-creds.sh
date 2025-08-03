#!/bin/bash

# Quick fix script to create proper git credentials file
log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [fix-git-creds] $1" >&2
}

log_info "Fixing Git credentials file..."

# Force remove any existing .git-credentials (directory or file)
rm -rf ~/.git-credentials 2>/dev/null || true
rm -rf /home/appuser/.git-credentials 2>/dev/null || true

# Create credentials file with GitHub token
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    echo "https://malikrohail:${GITHUB_TOKEN}@github.com" > ~/.git-credentials
    chmod 600 ~/.git-credentials
    
    # Verify it was created properly
    if [[ -f ~/.git-credentials ]]; then
        log_info "✅ Git credentials file created successfully"
        log_info "File info: $(ls -la ~/.git-credentials)"
    else
        log_info "❌ Failed to create git credentials file"
    fi
else
    log_info "❌ No GITHUB_TOKEN found"
fi

log_info "Fix completed"