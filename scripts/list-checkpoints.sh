#!/bin/bash

# List Checkpoints script - Shows all available checkpoints
# Usage: bash list-checkpoints.sh [number of checkpoints to show]

# Default to showing 10 checkpoints if not specified
count=${1:-10}

# Make sure we're in a git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "❌ Error: Not in a git repository"
  exit 1
fi

# Get the current branch
current_branch=$(git rev-parse --abbrev-ref HEAD)

# Fetch latest commits
echo "📥 Fetching latest changes from GitHub..."
git fetch --quiet origin

echo "📋 Available checkpoints on branch ${current_branch}:"
echo "------------------------------------------------------"
git log --pretty=format:"%h | %ad | %s" --date=short -n ${count} | while read line; do
  hash=$(echo $line | cut -d' ' -f1)
  rest=$(echo $line | cut -d' ' -f2-)
  
  # Check if this commit is a checkpoint (contains "Checkpoint" or "Backup")
  if [[ "$rest" == *"Checkpoint"* ]] || [[ "$rest" == *"Backup"* ]]; then
    echo "🔖 $line"
    echo "   To rollback: bash rollback.sh ${hash}"
    echo "------------------------------------------------------"
  fi
done

echo "✨ To create a new checkpoint: bash checkpoint.sh [optional message]" 