# 🔧 GIT OPTIMIZER INTEGRATION EXAMPLE

This shows how to integrate the lightweight Git optimizer with your existing services to minimize redundant commands and save JSON data.

## 📋 Quick Integration (No Workflow Changes)

### 1. Update GitService.ts

```typescript
// Add import at top
import { wrapGitCommand, createGitContext } from './gitCommandOptimizer';

// In executeGitCommand function, replace:
const result = await executeTool(serverId, 'BashCommand', {
  action_json: {
    command: fullCommand,
    type: 'command'
  },
  thread_id: threadId
});

// With:
const context = createGitContext(projectId, projectPath, 'BashCommand');
const optimizedResult = await wrapGitCommand(
  context,
  () => executeTool(serverId, 'BashCommand', {
    action_json: {
      command: fullCommand,
      type: 'command'
    },
    thread_id: threadId
  }),
  gitCommand  // e.g. "git status --porcelain"
);

const result = optimizedResult.output;
```

### 2. Update OptimizedGitService.ts

```typescript
// Add import
import { GitCommandOptimizer, createGitContext } from './gitCommandOptimizer';

// In getGitStatus method, add caching:
async getGitStatus(projectPath: string, executeTool: Function, options = {}) {
  const context = createGitContext(this.projectId, projectPath, 'OptimizedGitService');
  const optimizer = GitCommandOptimizer.getInstance(context);
  
  // Try to get cached status first
  const quickStatus = await optimizer.getOptimizedStatus();
  if (quickStatus.cached && !options.forceRefresh) {
    console.log(`⚡ Using cached git status for ${projectPath}`);
    return {
      hasChanges: quickStatus.hasChanges,
      stagedFiles: [],
      unstagedFiles: quickStatus.changedFiles,
      untrackedFiles: quickStatus.changedFiles,
      currentBranch: quickStatus.currentBranch
    };
  }

  // Fallback to regular git command (wrapped for tracking)
  return await optimizer.optimizeGitCommand(
    () => this.executeGitCommand(projectPath, 'git status --porcelain -b', executeTool),
    'git status --porcelain -b'
  );
}
```

### 3. Update AutoCommitAgent.ts

```typescript
// Add import
import { GitCommandOptimizer, createGitContext } from './gitCommandOptimizer';

// In the auto-commit process, add tracking:
async executeOptimizedAutoCommit(projectId: string, conversationId: string, projectPath: string, executeTool: Function) {
  const context = createGitContext(projectId, projectPath, 'AutoCommitAgent', 'auto_commit');
  const optimizer = GitCommandOptimizer.getInstance(context);

  // All git commands will now be tracked and cached
  const statusResult = await optimizer.optimizeGitCommand(
    () => executeTool(serverId, 'BashCommand', { /* ... */ }),
    'git status --porcelain -b'
  );

  // Branch creation will be tracked
  const branchResult = await optimizer.optimizeGitCommand(
    () => executeTool(serverId, 'BashCommand', { /* ... */ }),
    `git checkout -b auto/${timestamp}`
  );

  // Commit will be tracked
  const commitResult = await optimizer.optimizeGitCommand(
    () => executeTool(serverId, 'BashCommand', { /* ... */ }),
    `git commit -m "Auto-commit: Changes detected"`
  );

  // JSON files will be automatically saved after each command
}
```

## 📁 What Gets Saved

The system will automatically create these JSON files in each project:

```
/Users/test/gitrepo/projects/bftahe_new-project/
└── .kibitz/
    └── git-state/
        ├── project-bftahe.json          # Main project data
        ├── branch-main.json             # Branch-specific data  
        ├── branch-auto-2025-07-19.json  # Auto branches
        └── summary.json                 # Quick overview
```

### Example project-bftahe.json:
```json
{
  "projectId": "bftahe",
  "projectPath": "/Users/test/gitrepo/projects/bftahe_new-project",
  "projectName": "bftahe_new-project",
  "currentState": {
    "projectPath": "/Users/test/gitrepo/projects/bftahe_new-project",
    "projectId": "bftahe",
    "currentBranch": "auto/2025-07-19-17-21-20",
    "hasChanges": false,
    "changedFiles": [],
    "lastCommitHash": "26473d7",
    "lastCommitMessage": "Auto-commit: Changes detected",
    "timestamp": 1752945680000,
    "isGitRepo": true
  },
  "branches": [
    {
      "name": "auto/2025-07-19-17-21-20",
      "type": "auto",
      "createdAt": 1752945680000,
      "lastActivity": 1752945680000,
      "commitHash": "26473d7",
      "commitMessage": "Auto-commit: Changes detected",
      "filesChanged": ["test_binary_search.py"]
    }
  ],
  "statistics": {
    "totalBranches": 1,
    "autoBranches": 1,
    "totalCommits": 1,
    "lastActivity": 1752945680000
  }
}
```

## 🚀 Benefits You'll See

1. **Reduced BashCommand Load**: Status checks cached for 15 seconds
2. **JSON Storage**: All branch/commit data automatically saved
3. **No Workflow Changes**: Your existing Git flow stays the same
4. **Performance**: Faster responses for repeated status checks
5. **Callback System**: Ready for future frontend integration

## 🎯 Future Frontend Integration

```typescript
// Add callback to get real-time updates
const context = createGitContext(projectId, projectPath);
const optimizer = GitCommandOptimizer.getInstance(context);

optimizer.addCallback((projectId, data) => {
  console.log(`Git state updated for ${projectId}:`, data);
  // Update UI with new branch/commit data
  updateProjectUI(data);
});
```

## 📊 Monitor Performance

```typescript
// Check cache effectiveness
const stats = optimizer.getCacheStats();
console.log(`Cache hit rate: ${stats.hasCache ? 'YES' : 'NO'}, Age: ${stats.age}ms`);
```

This integration keeps your existing workflow intact while adding JSON storage and reducing redundant Git commands! 