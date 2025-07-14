# Auto-Commit Debug Log

## Configuration

- **File Threshold**: 2+ files (updated from 3)
- **Line Threshold**: 30+ lines (updated from 50)
- **Auto-commit enabled**: true
- **Auto-branch enabled**: true

## Expected Behavior

1. When 2+ files are changed via tool execution
2. System should trigger auto-commit
3. Auto-commit should create a branch if file threshold is met
4. Branch should be created locally with prefix `auto/`

## Debug Points to Check

### 1. Tool Execution Hook
- Verify `handleToolExecution` is called for file-changing tools
- Check if `FileWriteOrEdit` tools trigger the auto-commit system

### 2. File Change Detection
- Confirm `trackFileChange` is called when files are created
- Verify `pendingChanges` set is populated correctly

### 3. Auto-commit Triggers
- Check `shouldAutoCommit` returns true when conditions are met
- Verify `executeAutoCommit` is called

### 4. Branch Creation Logic
- Confirm branch creation logic triggers when file threshold is met
- Check if MCP workspace initialization affects branch creation

## Current Issues Identified

1. **MCP Workspace**: Initializing at wrong directory level
2. **Path Resolution**: Project path might be truncated to just project ID
3. **Auto-commit not triggering**: Need to verify tool execution hooks

## Fixes Applied

1. Updated file threshold from 3 to 2 files
2. Updated line threshold from 50 to 30 lines
3. Added debugging logs to `ensureProjectDirectory`
4. Fixed remaining MCP command format issues

## Next Steps

1. Test with a simple file creation scenario
2. Check browser console for debug logs
3. Verify auto-commit system triggers correctly
4. Confirm branch creation works in isolated project directories 