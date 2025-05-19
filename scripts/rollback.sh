#!/bin/bash

# Rollback script - Restores the codebase to a previous checkpoint
# Usage: bash rollback.sh <checkpoint-hash>

# Verify that a target hash was provided
target="$1"
if [ -z "$target" ]; then
  echo "❌ Error: No checkpoint hash provided"
  echo "   Usage: bash rollback.sh <checkpoint-hash>"
  exit 1
fi

# Make sure we're in a git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "❌ Error: Not in a git repository"
  exit 1
fi

# Fetch latest changes from remote
echo "📥 Fetching latest changes from GitHub..."
git fetch --quiet origin

# Check if the target hash exists
if ! git cat-file -e "$target" 2>/dev/null; then
  echo "❌ Error: Checkpoint $target does not exist"
  echo "   Make sure you're using a valid hash"
  exit 1
fi

# Create a backup checkpoint before rolling back (optional)
current_hash=$(git rev-parse --short HEAD)
echo "💾 Creating backup of current state: backup-before-rollback-${current_hash}..."
git add -A
git commit --quiet -m "Backup before rollback" || true
backup_hash=$(git rev-parse --short HEAD)
git commit --amend --quiet -m "Backup before rollback to ${target}: ${backup_hash}" || true

# Perform the rollback
echo "⏪ Rolling back to checkpoint ${target}..."
git reset --hard "$target"

# Push the rolled-back state to GitHub
current_branch=$(git rev-parse --abbrev-ref HEAD)
echo "🚀 Pushing rolled-back state to ${current_branch}..."
git push --force-with-lease origin ${current_branch}

echo "✅ Successfully rolled back to checkpoint ${target}"
echo "   The backup checkpoint is: ${backup_hash}"
echo "   To return to the state before rollback: bash rollback.sh ${backup_hash}" 