# Auto Commit & Branch Creation Setup Guide

## Overview
Your Kibitz project already has a powerful auto-commit and branch creation system! This guide will help you configure it properly.

## Features Available

### 🔄 Auto Commit System
- **Automatic commits** after tool executions
- **Smart commit messages** with context
- **File change detection** and thresholds
- **Debouncing** to prevent excessive commits

### 🌿 Automatic Branch Creation
- **Auto-branch creation** when significant changes are detected
- **Branch naming** with timestamps (e.g., `auto/20240101-1430`)
- **Change thresholds** (files and lines changed)
- **Post-commit branching** for better isolation

## Quick Setup

### 1. Enable Auto Commit
The auto commit system is controlled by `autoCommitStore.ts`. It's enabled by default with these settings:

```typescript
{
  enabled: true,
  triggers: {
    afterToolExecution: true,
    afterSuccessfulBuild: true, 
    afterTestSuccess: true,
    onFileChanges: true,
    timeBased: false,
  },
  conditions: {
    minimumChanges: 1,
    delayAfterLastChange: 2000, // 2 seconds delay
    skipConsecutiveCommits: true,
    requiredKeywords: [],
  },
  branchManagement: {
    enabled: true,
    fileThreshold: 3, // Create branch when 3+ files change
    lineThreshold: 50, // Or when 50+ lines change
    branchPrefix: 'auto',
    keepHistory: true
  }
}
```

### 2. Configure Branch Creation
Your system will automatically create branches when:
- **3 or more files** are modified in a single commit
- **50 or more lines** are changed
- Changes are detected after tool execution

### 3. Branch Naming Convention
Auto-created branches follow this pattern:
- `auto/YYYYMMDD-HHMM` (e.g., `auto/20240115-1430`)
- Based on timestamp of creation
- Easy to identify and manage

## How It Works

### Auto Commit Flow
1. **Tool Execution** → Triggers auto commit check
2. **Change Detection** → Counts modified files/lines
3. **Commit Creation** → Smart commit message generation
4. **Branch Decision** → Check if changes warrant new branch
5. **Branch Creation** → Create timestamped branch if threshold met

### Branch Management
- **Branch Store** (`branchStore.ts`) manages branch metadata
- **Branch Service** (`branchService.ts`) handles Git operations
- **Auto Branch Manager** (`autoBranchManager.ts`) orchestrates creation
- **Metadata Tracking** for easy rollback and history

## Current Status
Based on your error logs, the system is working but had schema validation issues (now fixed). You should see:

✅ **Fixed Issues:**
- MCP tool call schema validation errors
- Missing `type` property in tool calls

🎯 **Expected Behavior:**
- Auto commits after tool executions
- Branch creation when 3+ files change
- Rollback/revert capabilities
- Local repository management

## UI Components Available

### Auto Commit Settings
- `AutoCommitSettings.tsx` - Configure thresholds and triggers
- Toggle auto-branch creation on/off
- Adjust file/line thresholds

### Branch Management
- `BranchManager/` - Full branch management UI
- `BranchHistoryPanel.tsx` - View branch history
- `SimpleBranchManager.tsx` - Quick branch operations

### Rollback/Revert
- `RevertButton.tsx` - Quick revert to previous state
- `CheckpointManager/` - Create and manage checkpoints
- `RecoveryPanel.tsx` - Session recovery

## Testing the System

1. **Make some changes** to 3+ files in your project
2. **Execute any tool** (this triggers auto commit)
3. **Check the console** for auto commit and branch creation logs
4. **Verify with git**: `git branch` should show new auto branches

## Troubleshooting

### If auto commits aren't working:
- Check `autoCommitStore` configuration
- Verify MCP server connection
- Look for console errors in browser dev tools

### If branches aren't created:
- Ensure `branchManagement.enabled` is `true`
- Check file/line thresholds
- Verify Git repository is properly initialized

### Common Issues:
- **"Not a git repository"** → Initialize git in your project directory
- **Permission errors** → Check directory permissions
- **MCP connection issues** → Restart MCP servers

## Advanced Configuration

You can customize the system by modifying:
- **File thresholds** in `autoCommitStore.ts`
- **Branch naming** in `branchService.ts`
- **Commit messages** in `commitMessageGenerator.ts`
- **UI settings** in component configuration files

Your auto commit and branch system is now ready to use! 🚀 