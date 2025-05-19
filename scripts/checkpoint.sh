#!/bin/bash

# Checkpoint script - Creates a checkpoint of the current codebase state
# Usage: bash checkpoint.sh [optional message]

# Optional custom message
message="$1"
if [ -z "$message" ]; then
  message="Checkpoint"
fi

# Make sure we're in a git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "❌ Error: Not in a git repository"
  exit 1
fi

# Stage all changes
echo "📦 Staging all changes..."
git add -A

# Create temporary commit
git commit --quiet -m "temp" || {
  echo "❌ No changes to commit"
  exit 0
}

# Get the short hash of the new commit
hash=$(git rev-parse --short HEAD)

# Update the commit message with the hash and optional message
git commit --amend --quiet -m "${message}: ${hash}"

# Push to the same branch
current_branch=$(git rev-parse --abbrev-ref HEAD)
echo "🚀 Pushing checkpoint ${hash} to ${current_branch}..."
git push --force-with-lease origin ${current_branch}

echo "✅ Checkpoint ${hash} created and pushed to GitHub"
echo "   Message: ${message}: ${hash}"
echo "   To rollback to this point, use: bash rollback.sh ${hash}" 