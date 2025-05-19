# Checkpoint & Rollback Tool Integration

This document explains how to integrate the checkpoint system with your tool calls and command execution workflow.

## Overview

The checkpoint system provides:

1. Automatic checkpoints after successful command execution
2. Automatic branch creation for build/deployment operations
3. UI for manual checkpoint and rollback management
4. API endpoints for programmatic control

## Tool Call Integration

### 1. JSON Format

To execute a command with automatic checkpoint creation, use this JSON format:

```json
{
  "action_json": {
    "command": "chmod +x string_utils.py"
  }
}
```

This will:
- Execute the command
- Create a checkpoint with a descriptive name
- Return the result

### 2. Build Commands

For build commands, the system automatically creates a new branch:

```json
{
  "action_json": {
    "command": "npm run build"
  }
}
```

This will:
- Execute the build command
- Create a checkpoint if successful
- Create a new branch with timestamp
- Push the checkpoint to the new branch

### 3. API Endpoints

You can use the API endpoints directly for more control:

```typescript
// Create a checkpoint
fetch('/api/checkpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'create',
    payload: { message: 'My checkpoint message' }
  })
});

// Process a tool action
fetch('/api/checkpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'process_tool',
    payload: { 
      actionJson: { command: 'chmod +x script.py' } 
    }
  })
});
```

## UI Integration

The checkpoint system includes a React component that can be integrated into your UI:

```tsx
import CheckpointToolbar from '../components/CheckpointUI/CheckpointToolbar';
import { createCheckpoint, rollbackToCheckpoint, listCheckpoints } from '../services/checkpointService';

// In your component:
<CheckpointToolbar 
  onCreateCheckpoint={createCheckpoint}
  onRollback={rollbackToCheckpoint}
  onListCheckpoints={() => listCheckpoints()}
/>
```

## Advanced Configuration

### Custom Branch Naming

You can customize how branches are created by modifying the `generateBranchName` function in `toolCallService.ts`:

```typescript
function generateBranchName(taskName: string): string {
  const timestamp = new Date().toISOString()
    .replace(/:/g, '-')
    .replace(/\..+/, '');
  
  // Custom branch naming scheme:
  return `release/${taskName}-${timestamp}`;
}
```

### Checkpoint Retention Policy

By default, all checkpoints are kept indefinitely. To implement a retention policy:

1. Create a cleanup script in the `scripts` directory
2. Add a scheduled GitHub Action to run the cleanup periodically
3. Configure retention rules based on your needs (time-based, count-based, etc.)

## MCP Integration

To integrate with MCP tools using the WCGW framework:

1. Register the `mcp-checkpoint-tools.js` as an MCP tool
2. Add the checkpoint operations to your agent's available tools
3. Configure your agent to automatically create checkpoints after certain operations

Example MCP tool registration:

```javascript
// In your MCP server configuration
const checkpointTools = require('./scripts/mcp-checkpoint-tools');

// Register the tools
registerTool('create_checkpoint', checkpointTools.createCheckpoint);
registerTool('rollback', checkpointTools.rollbackToCheckpoint);
registerTool('list_checkpoints', checkpointTools.listCheckpoints);
```

## Troubleshooting

### Common Issues

1. **Permission denied errors**: Ensure the scripts have executable permissions
   ```bash
   chmod +x scripts/*.sh
   ```

2. **Git authentication issues**: Configure Git credentials correctly
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "your.email@example.com"
   ```

3. **Branch creation failures**: Check if the branch name already exists
   ```bash
   git branch -a | grep <branch-name>
   ```

## Further Customization

The checkpoint system is designed to be extensible. You can:

1. Add pre/post checkpoint hooks
2. Integrate with external CI/CD systems
3. Add custom validation rules for checkpoints
4. Implement checkpoint diffing for visualizing changes

See the code in `scripts/` and `src/services/` for implementation details. 