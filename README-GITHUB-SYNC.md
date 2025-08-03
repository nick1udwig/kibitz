# GitHub Sync System for Kibitz

A comprehensive Node.js system for automatically syncing your project branches to GitHub repositories via MCP (Model Context Protocol) server integration.

## 🎯 System Overview

This system provides automatic GitHub synchronization for projects managed by the Kibitz system, featuring:

- **Automatic change detection** using git commands
- **Configurable branch syncing** with wildcard pattern support  
- **Safe concurrent operations** with file locking and retry logic
- **Comprehensive error handling** and recovery
- **MCP server integration** for git/GitHub CLI operations
- **Project metadata management** with structured JSON schemas

## 📁 System Components

### Core Modules

1. **`project-json-manager.js`** - Project metadata and configuration management
2. **`sync-detection-service.js`** - Change detection and branch filtering
3. **`git-executor.js`** - Git/GitHub operations via MCP server
4. **`github-sync-manager.js`** - Main orchestration engine

### Testing & Setup

5. **`test-github-sync-system.js`** - Comprehensive test suite
6. **`setup-github-sync.js`** - Setup and configuration helper

### Configuration Files

7. **`project-schema.types.ts`** - TypeScript definitions
8. **`enhanced_project_schema.json`** - JSON schema example

## 🚀 Quick Start

### 1. Setup and Test

```bash
# Run full setup (checks system, migrates projects, runs tests)
node setup-github-sync.js

# Or run individual commands
node setup-github-sync.js check      # Check system requirements
node setup-github-sync.js discover   # Find existing projects
node setup-github-sync.js migrate    # Migrate to v2 schema
node setup-github-sync.js test       # Run test suite
```

### 2. Basic Usage

```javascript
import { createGitHubSyncManager } from './github-sync-manager.js';

// Initialize with your MCP client
const syncManager = createGitHubSyncManager(mcpClient, {
  maxRetries: 3,
  retryDelay: 5000,
  batchSize: 5
});

// Sync a specific project
const result = await syncManager.performSync('projectId');

// Sync all pending projects
const batchResult = await syncManager.syncAllPendingProjects();

// Get sync status
const status = await syncManager.getSyncStatus();
```

### 3. Project Configuration

Enable GitHub sync for a project:

```javascript
import { updateGitHubConfig } from './project-json-manager.js';

await updateGitHubConfig('/path/to/project', {
  enabled: true,
  remoteUrl: 'https://github.com/user/repo.git',
  syncBranches: ['main', 'auto/*'],
  syncInterval: 300000, // 5 minutes
  authentication: {
    type: 'token',
    configured: true
  }
});
```

## 📊 Project JSON Schema v2

Each project maintains a `.kibitz/api/project.json` file with this structure:

```json
{
  "projectId": "conv123_my-project",
  "projectName": "my-project", 
  "projectPath": "/Users/test/gitrepo/projects/conv123_my-project",
  "github": {
    "enabled": true,
    "remoteUrl": "https://github.com/user/repo.git",
    "syncInterval": 300000,
    "syncBranches": ["main", "auto/*"],
    "lastSync": 1640995200000,
    "syncStatus": "idle",
    "authentication": {
      "type": "token",
      "configured": true
    }
  },
  "sync": {
    "lastAttempt": 1640995200000,
    "nextScheduled": 1640995500000,
    "consecutiveFailures": 0,
    "pendingChanges": []
  },
  "branches": [
    {
      "branchName": "main",
      "commitHash": "abc123",
      "sync": {
        "lastPushed": 1640995200000,
        "pushedHash": "abc123",
        "needsSync": false,
        "syncError": null
      }
    }
  ]
}
```

## 🔧 Key Features

### Change Detection
- **Git-based detection** - Uses git commands to compare local vs remote
- **Branch filtering** - Configurable patterns (supports `main`, `auto/*`, etc.)
- **Activity checking** - Only syncs recently active projects
- **Commit tracking** - Tracks which commits have been pushed

### Sync Operations
- **Safe pushing** - Uses `--force-with-lease` for force pushes
- **Upstream setup** - Automatically sets upstream for new branches
- **Batch processing** - Syncs multiple projects with configurable concurrency
- **Repository creation** - Auto-creates GitHub repos via `gh` CLI

### Error Handling
- **Retry logic** - Configurable retry attempts with exponential backoff
- **File locking** - Prevents concurrent modifications to project.json
- **Status tracking** - Maintains sync status and error states
- **Graceful degradation** - Continues processing other projects on failures

## 🛠 System Requirements

- **Node.js** 16+ with ES modules support
- **Git** installed and configured
- **GitHub CLI** (`gh`) installed and authenticated
- **MCP Server** connected and available

## 📋 Configuration Options

### Sync Manager Options
```javascript
{
  maxRetries: 3,           // Max retry attempts on failure
  retryDelay: 5000,        // Delay between retries (ms)
  batchSize: 5,            // Max concurrent project syncs
  defaultSyncInterval: 300000  // Default sync interval (ms)
}
```

### Project GitHub Config
```javascript
{
  enabled: true,                    // Enable sync for this project
  remoteUrl: 'github-url',         // GitHub repository URL
  syncInterval: 300000,            // Sync frequency (ms)
  syncBranches: ['main', 'auto/*'], // Branch patterns to sync
  syncStatus: 'idle',              // Current sync status
  authentication: {                // Auth configuration
    type: 'token',
    configured: true
  }
}
```

## 🧪 Testing

### Run All Tests
```bash
node test-github-sync-system.js
```

### Run Specific Test Categories
```bash
# Test with your actual project
node setup-github-sync.js test

# Enable debug logging
DEBUG=1 node test-github-sync-system.js
```

### Mock vs Real Testing
- Tests use `MockMcpClient` by default for safety
- Replace with real MCP client for integration testing
- All git commands are logged for debugging

## 🔒 Security Considerations

- **Authentication** - Uses GitHub CLI auth or SSH keys
- **Force Push Safety** - Uses `--force-with-lease` to prevent overwrites
- **File Permissions** - Respects existing file permissions
- **Concurrent Access** - File locking prevents corruption

## 📈 Monitoring & Debugging

### Enable Debug Logging
```bash
DEBUG=1 node your-script.js
```

### Check Sync Status
```javascript
const status = await syncManager.getSyncStatus();
console.log(status);
// {
//   totalProjects: 10,
//   enabledProjects: 8, 
//   projectsNeedingSync: 3,
//   activeSyncs: 1,
//   recentFailures: 0
// }
```

### View Project Status
```javascript
const projects = await getAllPendingProjects();
projects.forEach(project => {
  console.log(`${project.projectId}: ${project.branches.length} branches need sync`);
});
```

## 🔄 Background Service Integration

Ready for background service implementation:

```javascript
// Example background service setup
setInterval(async () => {
  try {
    const results = await syncManager.syncAllPendingProjects();
    console.log(`Synced ${results.syncedProjects} projects`);
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}, 300000); // Every 5 minutes
```

## 🐛 Troubleshooting

### Common Issues

1. **"Project JSON file not found"**
   - Run migration: `node setup-github-sync.js migrate`
   - Check project directory structure

2. **"Git command failed"**
   - Verify git is installed: `git --version`
   - Check repository initialization
   - Verify MCP server connectivity

3. **"GitHub CLI command failed"**
   - Install GitHub CLI: `brew install gh`
   - Authenticate: `gh auth login`
   - Check repository permissions

4. **"Sync already in progress"**
   - Normal behavior - prevents duplicate syncs
   - Wait for current sync to complete

### Debug Commands

```bash
# Check system status
node setup-github-sync.js check

# Test git operations
git status
git remote -v
gh auth status

# Test MCP connectivity
# (depends on your MCP client setup)
```

## 🚧 Next Steps

After testing the core system:

1. **Background Service** - Implement scheduling and queue management
2. **Web API** - Add REST API for external integrations  
3. **Dashboard** - Build monitoring interface
4. **Webhooks** - Add GitHub webhook support for real-time updates
5. **Multi-Remote** - Support for multiple git remotes per project

## 📄 License

[Your License Here]

---

**Ready to sync?** Run `node setup-github-sync.js` to get started! 🚀 