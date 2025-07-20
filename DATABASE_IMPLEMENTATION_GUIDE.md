# 🗄️ **Kibitz Database Implementation Guide**

## **Database Location Decision**

✅ **Centralized Database** (Recommended Implementation)

**Location:** `{project_root}/data/kibitz.db` (stored in your main Kibitz directory)

**Benefits:**
- Cross-project queries and analytics
- Unified backup and maintenance
- Global search across all conversations
- Better performance with centralized indexing
- Easier to implement features like "show all my projects"

---

## **🏗️ Architecture Overview**

```
kibitz/
├── data/
│   ├── kibitz.db (localStorage-based database)
│   └── backups/
├── src/
│   ├── lib/
│   │   ├── kibitzDatabase.ts          # Core database implementation
│   │   └── rollbackIntegrationService.ts  # Auto-commit + rollback service
│   └── components/
│       └── RollbackPanel.tsx          # UI components
└── projects/
    ├── {conversation_id_1}/
    │   ├── .git/
    │   ├── src/
    │   └── .kibitz_meta.json
    └── {conversation_id_2}/
        ├── .git/
        ├── src/
        └── .kibitz_meta.json
```

---

## **📊 Database Schema**

### **Projects Table**
```typescript
interface ProjectRecord {
  id: string;                    // Unique project ID
  conversation_id: string;       // Links to conversation
  project_name: string;          // Display name
  folder_path: string;           // Full path to project folder
  created_at: string;            // ISO timestamp
  last_commit_sha?: string;      // Latest commit hash
  current_branch: string;        // Active branch (default: 'main')
  status: 'active' | 'archived' | 'deleted';
  git_initialized: boolean;      // Whether git init was run
  last_activity: string;         // Last interaction timestamp
}
```

### **Commits Table**
```typescript
interface CommitRecord {
  id: string;                    // Unique commit record ID
  project_id: string;            // Links to project
  commit_sha: string;            // Git commit hash
  commit_message: string;        // Commit description
  branch_name: string;           // Branch where commit was made
  timestamp: string;             // When commit was created
  file_changes: string[];        // List of changed files
  author: string;                // Who made the commit
  is_auto_commit: boolean;       // Auto-generated vs manual
  is_checkpoint: boolean;        // Marked as rollback point
  parent_commit_sha?: string;    // Previous commit (for rollbacks)
}
```

### **Branches Table**
```typescript
interface BranchRecord {
  id: string;                    // Unique branch record ID
  project_id: string;            // Links to project
  branch_name: string;           // Branch name (e.g., 'auto/20250118-1430')
  base_commit_sha: string;       // Where branch started
  head_commit_sha: string;       // Latest commit on branch
  created_at: string;            // Branch creation time
  branch_type: 'main' | 'feature' | 'auto-commit' | 'experimental';
  is_active: boolean;            // Currently in use
  description?: string;          // Branch purpose
}
```

### **Rollback Points Table**
```typescript
interface RollbackPointRecord {
  id: string;                    // Unique rollback point ID
  project_id: string;            // Links to project
  commit_sha: string;            // Commit to rollback to
  rollback_name: string;         // Display name
  description: string;           // Why this rollback point exists
  created_at: string;            // When rollback point was created
  project_state: object;         // Snapshot of project metadata
  file_count: number;            // Number of files at this point
  created_by: 'user' | 'auto';   // Manual vs automatic creation
}
```

---

## **🚀 Usage Examples**

### **1. Initialize Database**
```typescript
import { initializeRollbackIntegration } from './lib/rollbackIntegrationService';

// Initialize once at app startup
const rollbackService = await initializeRollbackIntegration();
```

### **2. Create Project with Tracking**
```typescript
const { projectId, projectPath } = await rollbackService.createProjectWithTracking(
  'conversation_123',
  'My New Project',
  '/custom/path/optional'
);

console.log(`Project created: ${projectId} at ${projectPath}`);
```

### **3. Execute Auto-Commit**
```typescript
const result = await rollbackService.executeAutoCommit(
  projectId,
  'conversation_123',
  ['src/main.py', 'README.md', 'config.json'],
  'Auto-commit: 3 files changed',
  {
    isAutoCommit: true,
    createCheckpoint: true,
    fileThreshold: 2,
    branchPrefix: 'auto'
  }
);

if (result.success) {
  console.log(`Auto-commit successful: ${result.branchName}`);
} else {
  console.error(`Auto-commit failed: ${result.error}`);
}
```

### **4. Create Manual Rollback Point**
```typescript
const rollbackId = await rollbackService.createRollbackPoint(
  projectId,
  'commit_abc123',
  {
    name: 'Before major refactor',
    description: 'Stable state before changing architecture',
    createdBy: 'user'
  }
);
```

### **5. Execute Rollback**
```typescript
const rollbackResult = await rollbackService.executeRollback(
  projectId,
  'commit_abc123',
  {
    createCheckpoint: true,
    preserveUncommittedChanges: true
  }
);

if (rollbackResult.success) {
  console.log(`Rollback successful: ${rollbackResult.filesRestored?.length} files restored`);
} else {
  console.error(`Rollback failed: ${rollbackResult.error}`);
}
```

### **6. Get Rollback History**
```typescript
const history = await rollbackService.getRollbackHistory(projectId);

console.log('Recent commits:', history.commits.slice(0, 10));
console.log('Available branches:', history.branches);
console.log('Rollback points:', history.rollbackPoints);
```

### **7. Search Commits**
```typescript
const searchResults = await rollbackService.searchCommits('bug fix', projectId);
console.log('Found commits:', searchResults.length);
```

---

## **🎨 React Integration**

### **Using the Hook**
```typescript
import { useRollbackIntegration } from './lib/rollbackIntegrationService';

function ProjectComponent() {
  const {
    createProject,
    executeAutoCommit,
    executeRollback,
    getRollbackHistory,
    getProjectStatistics,
    createRollbackPoint,
    searchCommits,
    getCheckpoints,
    markAsCheckpoint
  } = useRollbackIntegration();

  const handleAutoCommit = async () => {
    const result = await executeAutoCommit(
      projectId,
      conversationId,
      ['file1.py', 'file2.js'],
      'Auto-commit from UI',
      { createCheckpoint: true }
    );
    
    if (result.success) {
      console.log('Auto-commit successful!');
    }
  };

  const handleRollback = async (commitSha: string) => {
    const result = await executeRollback(
      projectId,
      commitSha,
      { createCheckpoint: true }
    );
    
    if (result.success) {
      console.log('Rollback successful!');
    }
  };

  return (
    <div>
      <button onClick={handleAutoCommit}>Auto-Commit</button>
      <button onClick={() => handleRollback('abc123')}>Rollback</button>
    </div>
  );
}
```

### **Rollback Panel Component**
```typescript
import React, { useState, useEffect } from 'react';
import { useRollbackIntegration } from './lib/rollbackIntegrationService';

interface RollbackPanelProps {
  projectId: string;
}

function RollbackPanel({ projectId }: RollbackPanelProps) {
  const [history, setHistory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { getRollbackHistory, executeRollback } = useRollbackIntegration();

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const data = await getRollbackHistory(projectId);
        setHistory(data);
      } catch (error) {
        console.error('Failed to load rollback history:', error);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [projectId]);

  const handleRollback = async (commitSha: string) => {
    const result = await executeRollback(projectId, commitSha, {
      createCheckpoint: true
    });
    
    if (result.success) {
      alert('Rollback successful!');
      // Refresh history
      const data = await getRollbackHistory(projectId);
      setHistory(data);
    } else {
      alert(`Rollback failed: ${result.error}`);
    }
  };

  if (loading) return <div>Loading rollback history...</div>;

  return (
    <div className="rollback-panel">
      <h3>Project History</h3>
      
      {/* Rollback Points */}
      <div className="rollback-points">
        <h4>Rollback Points</h4>
        {history.rollbackPoints.map((point: any) => (
          <div key={point.id} className="rollback-point">
            <strong>{point.rollback_name}</strong>
            <p>{point.description}</p>
            <small>{new Date(point.created_at).toLocaleString()}</small>
            <button onClick={() => handleRollback(point.commit_sha)}>
              Rollback to this point
            </button>
          </div>
        ))}
      </div>

      {/* Recent Commits */}
      <div className="recent-commits">
        <h4>Recent Commits</h4>
        {history.commits.slice(0, 10).map((commit: any) => (
          <div key={commit.id} className="commit-item">
            <div className="commit-message">{commit.commit_message}</div>
            <div className="commit-meta">
              {new Date(commit.timestamp).toLocaleString()} • {commit.branch_name}
              {commit.is_checkpoint && <span className="checkpoint-badge">📍</span>}
            </div>
            <button onClick={() => handleRollback(commit.commit_sha)}>
              Rollback to this commit
            </button>
          </div>
        ))}
      </div>

      {/* Auto-Created Branches */}
      <div className="auto-branches">
        <h4>Auto-Created Branches</h4>
        {history.branches.filter((b: any) => b.branch_type === 'auto-commit').map((branch: any) => (
          <div key={branch.id} className="branch-item">
            <strong>{branch.branch_name}</strong>
            <p>{branch.description}</p>
            <button onClick={() => handleRollback(branch.head_commit_sha)}>
              Rollback to this branch
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## **🔧 Integration with Existing Auto-Commit**

### **Modify Your Auto-Commit Function**
```typescript
// In your existing auto-commit logic
import { getRollbackIntegrationService } from './lib/rollbackIntegrationService';

async function handleAutoCommit(projectId: string, conversationId: string, gitResult: any) {
  const rollbackService = getRollbackIntegrationService();
  
  // Extract file changes from git result
  const filesChanged = parseGitChanges(gitResult);
  
  // Execute auto-commit with database tracking
  const result = await rollbackService.executeAutoCommit(
    projectId,
    conversationId,
    filesChanged,
    generateCommitMessage(filesChanged),
    {
      isAutoCommit: true,
      createCheckpoint: filesChanged.length >= 5, // Checkpoint for major changes
      fileThreshold: 3,
      branchPrefix: 'auto'
    }
  );
  
  if (result.success) {
    console.log(`✅ Auto-commit successful: ${result.branchName}`);
    
    // Update UI to show new branch
    updateBranchDisplay(result.branchName);
    
    // Show notification
    showNotification(`Auto-commit created: ${result.branchName}`);
  } else {
    console.error(`❌ Auto-commit failed: ${result.error}`);
  }
}
```

---

## **📈 Statistics and Analytics**

### **Project Statistics**
```typescript
const stats = await rollbackService.getProjectStatistics(projectId);

console.log('Project Statistics:', {
  totalCommits: stats.basic.totalCommits,
  autoCommits: stats.basic.autoCommits,
  checkpoints: stats.basic.checkpoints,
  branches: stats.basic.totalBranches,
  rollbackPoints: stats.basic.totalRollbackPoints,
  lastActivity: stats.basic.lastActivity
});

console.log('Recent Activity:', stats.recentActivity);
```

### **Global Statistics**
```typescript
const globalStats = await rollbackService.database.getGlobalStatistics();

console.log('Global Statistics:', {
  totalProjects: globalStats.totalProjects,
  activeProjects: globalStats.activeProjects,
  totalCommits: globalStats.totalCommits,
  autoCommits: globalStats.autoCommits
});
```

---

## **🛠️ Maintenance and Backup**

### **Database Backup**
```typescript
// Export all data
const backupData = await rollbackService.database.exportData();
console.log('Database backed up:', backupData.length, 'characters');

// Save to file (in Node.js environment)
require('fs').writeFileSync(`backup_${Date.now()}.json`, backupData);
```

### **Cleanup Old Data**
```typescript
// Archive projects older than 30 days
await rollbackService.cleanupOldData(30);

// Vacuum database to reclaim space
await rollbackService.database.vacuum();
```

### **Health Check**
```typescript
const health = await rollbackService.healthCheck();
console.log('Database Health:', health.database);
console.log('Service Health:', health.overall);
```

---

## **🎯 Production Recommendations**

### **1. Initialize Early**
```typescript
// In your main app initialization
async function initializeApp() {
  try {
    await initializeRollbackIntegration();
    console.log('✅ Rollback system ready');
  } catch (error) {
    console.error('❌ Rollback system failed to initialize:', error);
  }
}
```

### **2. Error Handling**
```typescript
// Always handle errors gracefully
const result = await rollbackService.executeAutoCommit(/* ... */);
if (!result.success) {
  // Log error
  console.error('Auto-commit failed:', result.error);
  
  // Show user-friendly message
  showErrorNotification('Auto-commit failed. Your changes are still safe.');
  
  // Optionally retry
  setTimeout(() => retryAutoCommit(), 5000);
}
```

### **3. Performance Optimization**
```typescript
// Batch operations when possible
const promises = [
  rollbackService.getProjectStatistics(projectId),
  rollbackService.getRollbackHistory(projectId),
  rollbackService.getCheckpoints(projectId)
];

const [stats, history, checkpoints] = await Promise.all(promises);
```

---

## **🚨 Troubleshooting**

### **Common Issues**

1. **Database not initializing:**
   - Check browser localStorage availability
   - Verify no quota exceeded errors
   - Run health check

2. **Auto-commits not creating:**
   - Check if project exists in database
   - Verify file changes are detected
   - Check console for error messages

3. **Rollback fails:**
   - Ensure target commit exists
   - Check if project is in valid state
   - Verify no uncommitted changes conflict

### **Debug Commands**
```typescript
// Check database state
const stats = await rollbackService.database.getGlobalStatistics();
console.log('Database state:', stats);

// Check project exists
const project = await rollbackService.database.getProject(projectId);
console.log('Project found:', !!project);

// Check recent commits
const commits = await rollbackService.database.getProjectCommits(projectId, 5);
console.log('Recent commits:', commits.length);
```

---

## **🎉 Benefits of This Implementation**

✅ **Local Storage**: Everything stored locally, no external dependencies
✅ **Auto-Commit Integration**: Seamless integration with existing auto-commit
✅ **Rollback Capabilities**: One-click rollback to any previous state
✅ **Branch Management**: Automatic branch creation and tracking
✅ **Statistics & Analytics**: Comprehensive project insights
✅ **Search & Discovery**: Find commits and changes quickly
✅ **Backup & Recovery**: Export/import functionality
✅ **Performance**: Indexed queries and optimized storage

This implementation provides a production-ready rollback and auto-commit system that matches the functionality of Replit Agent v2 and Cursor, while keeping everything local and integrated with your existing Kibitz infrastructure. 