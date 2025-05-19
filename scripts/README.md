# Checkpoint & Rollback System

This directory contains scripts for managing code state with a checkpoint and rollback system. These scripts help you save your work at critical points and restore to previous states when needed.

## 📋 Available Scripts

### 1. Checkpoint Creation

Save the current state of your codebase:

```bash
# Using the script directly
bash scripts/checkpoint.sh [optional message]

# Using npm script
npm run checkpoint [optional message]
```

This creates a Git commit with your changes and pushes it to GitHub. The commit message includes a unique hash ID that can be used for rollbacks.

### 2. Rollback to Previous Checkpoint

Restore your codebase to a previous checkpoint:

```bash
# Using the script directly
bash scripts/rollback.sh <checkpoint-hash>

# Using npm script
npm run rollback <checkpoint-hash>
```

This will reset your codebase to the state of the specified checkpoint. A backup of your current state is automatically created before rollback.

### 3. List Available Checkpoints

View a list of available checkpoints to roll back to:

```bash
# Using the script directly
bash scripts/list-checkpoints.sh [number of checkpoints to show]

# Using npm script
npm run list-checkpoints [number of checkpoints to show]
```

## 🔄 Automatic Checkpoints

The system can automatically create checkpoints after successful builds through GitHub Actions. This is configured in `.github/workflows/auto-checkpoint.yml`.

## 📝 Tips for Effective Use

1. Create checkpoints at logical points in your development:
   - After implementing a feature
   - Before making significant changes
   - When you have a stable, working state

2. Use descriptive messages with your checkpoints:
   ```bash
   npm run checkpoint "Implemented user authentication"
   ```

3. Before rolling back, make sure you have committed all your changes or they will be lost.

4. Use `npm run list-checkpoints` to find the hash of the checkpoint you want to restore.

5. After rolling back, you can always return to the pre-rollback state using the backup checkpoint that was automatically created.

## ⚠️ Important Notes

- Pushing to GitHub requires proper authentication and permissions
- Force pushes are used which can overwrite remote history
- This system works best when you're the only one working on a branch
- Always communicate with your team when using force pushes on shared branches 