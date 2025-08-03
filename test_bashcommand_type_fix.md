# BashCommand Type Field Fix Test

This test verifies that the `type: 'BashCommand'` field is properly added to all BashCommand calls.

## Issue Fixed:

The MCP server was rejecting BashCommand calls with:
```
Input validation error: 'type' is a required property
```

## Root Cause:

ALL BashCommand calls need the `type: 'BashCommand'` field, not just the ones in `gitService.ts`. The calls were being formatted like:

```json
{
  "action_json": {
    "command": "cd \"/Users/test/gitrepo/projects/2bd56k_new-project\" && git rev-parse --git-dir"
  },
  "thread_id": "i8408"
}
```

But the MCP server expected:

```json
{
  "type": "BashCommand",
  "action_json": {
    "command": "cd \"/Users/test/gitrepo/projects/2bd56k_new-project\" && git rev-parse --git-dir"
  },
  "thread_id": "i8408"
}
```

## Fixes Applied:

1. **Added type field to all BashCommand processing in rootStore.ts**:
   - In project context BashCommand processing: `type: 'BashCommand'`
   - In fallback BashCommand processing: `type: 'BashCommand'`
   - In debug section: Ensure type field is added if missing

2. **Enhanced debug logging**: Shows `hasType: !!modifiedArgs.type` to verify the fix

## Expected Result:

After this fix, all BashCommand calls should include the `type: 'BashCommand'` field and no longer receive validation errors from the MCP server.

## Git Operations Should Work:

- ✅ Git repository detection
- ✅ Branch creation  
- ✅ Auto-commit functionality
- ✅ File change tracking

## Timeline:

- **Issue**: BashCommand calls missing required `type` field
- **Fix**: Added `type: 'BashCommand'` to all BashCommand processing paths
- **Expected**: Git operations should work without validation errors

**This should be the final fix that resolves the BashCommand validation error!** 