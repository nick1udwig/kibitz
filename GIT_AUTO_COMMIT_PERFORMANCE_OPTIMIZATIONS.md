# Git Auto-Commit Performance Optimizations

## Overview
This document outlines the performance optimizations implemented to address the excessive function calls identified in the auto-commit system.

## Original Performance Issues
Based on console logs analysis, the following bottlenecks were identified:

| Operation | Original Call Count | Impact |
|-----------|-------------------|--------|
| `getProjectPath` | 1,384 calls | Excessive path resolution with logging overhead |
| `executeTool` | 551 calls | Heavy logging and repeated auto-commit triggering |
| `autoInitializeGitForProject` | 63 calls | Redundant Git initialization checks |
| Fast Refresh rebuilds | 73 calls | Cascading auto-commit operations |
| `git rev-parse` invocations | 25 calls | Repeated Git directory validation |

## Implemented Optimizations

### 1. Project Path Caching 🚀
**File:** `src/lib/projectPathService.ts`

- **Added:** In-memory cache (`projectPathCache`) for computed project paths
- **Benefit:** Eliminates 1,384+ redundant path resolution calls
- **Implementation:** Cache key based on `projectId|projectName|customPath`
- **Memory Management:** Manual cache clearing function for testing

```typescript
// Before: Every call re-computed path with extensive logging
export const getProjectPath = (projectId: string, projectName?: string, customPath?: string): string => {
  console.log(`🔧 getProjectPath: Input values:`, { /* extensive logging */ });
  // ... heavy string processing every time
}

// After: Cache-first approach with minimal logging
const projectPathCache = new Map<string, string>();
export const getProjectPath = (projectId: string, projectName?: string, customPath?: string): string => {
  const cacheKey = `${cleanProjectId}|${cleanProjectName || 'project'}|${cleanCustomPath || ''}`;
  if (projectPathCache.has(cacheKey)) {
    return projectPathCache.get(cacheKey)!; // Instant return for cached paths
  }
  // ... compute and cache result
}
```

### 2. ExecuteTool Optimization 🚀  
**File:** `src/stores/rootStore.ts`

- **Reduced Logging:** Conditional logging based on operation type (internal vs user-initiated)
- **Smart Auto-Commit Triggering:** Only trigger auto-commit for file-changing tools
- **WebSocket State Optimization:** Reduced repeated state checking
- **Selective Tool Processing:** Whitelist approach for auto-commit eligible tools

```typescript
// Before: Logged every operation with full details
console.log('🔧 executeTool: Detailed request info:', {
  serverId, toolName, args: JSON.stringify(args, null, 2), // Expensive JSON serialization
  timestamp: new Date().toISOString(), isInternalCall
});

// After: Conditional logging for performance
const shouldLogDetails = !isInternalCall || toolName === 'BashCommand';
if (shouldLogDetails) {
  console.log('🔧 executeTool:', { serverId, toolName, isInternalCall }); // Minimal logging
}
```

### 3. Git Initialization Flags 🚀
**File:** `src/lib/gitAutoInitService.ts`

- **Added:** In-memory flag (`gitInitializedProjects`) to track initialized projects
- **Benefit:** Eliminates redundant Git initialization checks
- **Implementation:** Set-based tracking with immediate early returns

```typescript
// Before: Always checked Git status via expensive commands
const gitCheckResult = await executeGitCommand(mcpServerId, 'git rev-parse --git-dir', projectPath, executeTool);

// After: Fast in-memory check first
const gitInitializedProjects = new Set<string>();

export const autoInitializeGitForProject = async (...) => {
  if (gitInitializedProjects.has(projectId)) {
    return { success: true, message: 'Project Git already initialized (cached)' };
  }
  // ... only proceed with expensive checks if needed
}
```

### 4. Auto-Commit Debouncing & Rate Limiting 🚀
**File:** `src/stores/autoCommitStore.ts`

- **Global Rate Limiting:** 2-second minimum between consecutive commits
- **Improved Debouncing:** Enhanced debounce logic in hook with race condition protection
- **Reduced Logging:** Conditional logging based on operation type
- **Tool Filtering:** Only auto-commit for tools that actually modify files

```typescript
// Before: Auto-commit triggered for every tool execution
if (!isInternalCall) {
  // ... extensive logging and processing for every tool
}

// After: Smart filtering with rate limiting
const fileChangingTools = ['FileWriteOrEdit', 'write', 'edit', 'create', 'delete'];
const shouldTriggerAutoCommit = fileChangingTools.some(tool => 
  toolName.toLowerCase().includes(tool.toLowerCase())
);

// Global rate limiting
if (lastCommitTime && (now - lastCommitTime) < 2000) {
  return false; // Prevent excessive commits
}
```

### 5. Logging Optimization 🚀
**Files:** Multiple files in hot paths

- **Conditional Logging:** Reduced console.log calls in high-frequency operations
- **Selective Debug Output:** Only log details for user-initiated operations
- **Optimized Log Content:** Removed expensive JSON serialization and stack traces

## Performance Impact

### Expected Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| `getProjectPath` calls | 1,384 | ~10-20 | 98%+ reduction |
| `executeTool` logging overhead | 551 × heavy logs | 551 × minimal logs | 80%+ reduction |
| Git initialization checks | 63 redundant calls | 1 per project | 98%+ reduction |
| Auto-commit processing time | High latency | Debounced/rate-limited | Significant reduction |

### Memory Usage
- **Project Path Cache:** ~1KB per unique project path combination
- **Git Flags:** ~100 bytes per project
- **Total Additional Memory:** < 10KB for typical usage

## Usage Notes

### Cache Management
```typescript
// Clear caches when needed (testing, project deletion)
import { clearProjectPathCache } from './lib/projectPathService';
import { clearGitInitializationFlags } from './lib/gitAutoInitService';

clearProjectPathCache();
clearGitInitializationFlags();
```

### Debugging
- Set breakpoints in conditional logging blocks to debug specific operations
- Use browser dev tools to monitor auto-commit frequency
- Check `gitInitializedProjects` Set size for cache efficiency

## Future Optimizations

1. **Batch Git Operations:** Group multiple git commands into single calls
2. **WebSocket Connection Pooling:** Reuse connections for internal operations
3. **Lazy Loading:** Defer non-critical auto-commit operations
4. **Metrics Collection:** Add performance monitoring for auto-commit latency

## Testing

To verify optimizations:
1. Monitor console logs for reduced `getProjectPath` calls
2. Check auto-commit frequency with file watching tools
3. Measure tool execution latency before/after changes
4. Verify memory usage doesn't increase significantly

These optimizations should dramatically reduce the performance impact of the auto-commit system while maintaining all functionality.