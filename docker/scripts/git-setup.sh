#!/bin/bash

# Docker startup script for Git/GitHub configuration
set -e

echo "🚀 Starting Git configuration setup..."

# Default values (can be overridden by environment variables)
GIT_USER_NAME=${GIT_USER_NAME:-"malikrohail"}
GIT_USER_EMAIL=${GIT_USER_EMAIL:-"malikrohail525@gmail.com"}

# Ensure GitHub token is available (fallback to hardcoded token)
if [ -z "${GITHUB_TOKEN:-}" ] && [ -n "${GH_TOKEN:-}" ]; then
    export GITHUB_TOKEN="$GH_TOKEN"
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "⚠️  GITHUB_TOKEN not set - using embedded fallback token"
    export GITHUB_TOKEN="${GITHUB_TOKEN}"
fi

# Configure Git user settings
echo "⚙️  Configuring Git user settings..."
git config --global user.name "$GIT_USER_NAME"
git config --global user.email "$GIT_USER_EMAIL"

# Configure Git credential helper for GitHub
echo "🔑 Setting up GitHub authentication..."
git config --global credential.helper store

# Remove any existing credentials file or directory
rm -rf /home/appuser/.git-credentials

# Create credentials file with GitHub token
touch /home/appuser/.git-credentials
echo "https://$GIT_USER_NAME:$GITHUB_TOKEN@github.com" > /home/appuser/.git-credentials

# Set proper permissions
chmod 600 /home/appuser/.git-credentials

# Optional: Configure Git to use the credential helper
git config --global credential.https://github.com.username "$GIT_USER_NAME"

# Optional: Set some useful Git defaults
echo "🛠️  Setting Git defaults..."
git config --global init.defaultBranch main
git config --global pull.rebase false
git config --global push.default simple

# Verify configuration
echo "✅ Git configuration complete!"
echo "📋 Current Git config:"
echo "   User: $(git config --global user.name) <$(git config --global user.email)>"

# Optional: Test GitHub connection
if command -v curl &> /dev/null; then
    echo "🔍 Testing GitHub API connection..."
    if curl -s -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user &> /dev/null; then
        echo "✅ GitHub API connection successful!"
    else
        echo "⚠️  Warning: GitHub API connection test failed"
    fi
fi

echo "🎉 Startup script completed successfully!"

# Start your main application
echo "🚀 Starting main application..."
exec "$@"