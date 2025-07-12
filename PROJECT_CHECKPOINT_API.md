# 🚀 Project Checkpoint API

**Complete Project Lifecycle Management for Kibitz**

The Project Checkpoint API provides a unified interface for managing the complete project lifecycle in Kibitz, from initialization to deployment. It handles both new projects and cloned repositories with automatic git setup, GitHub integration, and intelligent checkpointing.

## 🎯 Key Features

### 🏗️ Project Initialization
- **New Projects**: Automatic directory creation in hardcoded location (`/Users/test/gitrepo/projects/`)
- **Cloned Projects**: Support for existing repository paths
- **Git Setup**: Always initializes git locally (required for checkpointing)
- **GitHub Integration**: Optional, user-configurable GitHub repository creation

### 📝 Intelligent Checkpointing
- **Automatic Checkpoints**: Created after substantial changes (configurable thresholds)
- **Manual Checkpoints**: On-demand checkpoint creation with custom descriptions
- **Safe Branching**: Different branch types (feature, bugfix, experiment, checkpoint)
- **Smart Backup**: Automatic backup branches before major operations

### 🔄 Advanced Branch Management
- **Safe Rollback**: Switch branches with automatic backup creation
- **Remote Branch Handling**: Proper handling of `origin/` prefixed branches
- **Conflict Resolution**: Smart handling of uncommitted changes
- **Branch Analysis**: Comprehensive repository analysis and recommendations

### 🛠️ Project Health Monitoring
- **Real-time Status**: Git status, current branch, uncommitted changes
- **Configuration Tracking**: GitHub integration, MCP server connections
- **Health Recommendations**: Intelligent suggestions based on project state

## 📋 API Overview

### Core Classes

#### `ProjectCheckpointAPI`
Main class for managing existing projects.

```typescript
const api = createProjectCheckpointAPI(project, serverId, executeTool);

// Analyze repository
const analysis = await api.analyzeProject();

// Create checkpoint
const checkpoint = await api.createCheckpoint("Description", "feature");

// Switch branches safely
const switchResult = await api.switchToBranch("feature/new-ui", true);

// Check project health
const health = await api.getProjectHealth();
```

#### Static Methods for Project Initialization

```typescript
// Initialize new project
const result = await ProjectCheckpointAPI.initializeNewProject({
  projectName: "My App",
  enableGitHub: true,
  autoCheckpoint: true
}, serverId, executeTool);

// Initialize from cloned repository
const result = await ProjectCheckpointAPI.initializeNewProject({
  projectName: "Open Source Project",
  isClonedRepo: true,
  repoPath: "/path/to/existing/repo",
  enableGitHub: false
}, serverId, executeTool);
```

## 🔧 Configuration

### Project Initialization Configuration

```typescript
interface ProjectInitConfig {
  projectName: string;           // Required: Name of the project
  projectId?: string;           // Optional: Will be generated if not provided
  enableGitHub?: boolean;       // Optional: Create GitHub repository (default: false)
  isClonedRepo?: boolean;       // Optional: Whether this is a cloned repo (default: false)
  repoPath?: string;           // Required for cloned repos: Path to existing repository
  autoCheckpoint?: boolean;     // Optional: Create initial checkpoint (default: true for new projects)
  description?: string;         // Optional: Project description
}
```

### Directory Structure

**New Projects** (created in hardcoded directory):
```
/Users/test/gitrepo/projects/
├── {projectId}_my-app/
│   ├── README.md
│   ├── .git/
│   └── (project files)
└── {projectId}_another-project/
    ├── README.md
    ├── .git/
    └── (project files)
```

**Cloned Projects** (use existing path):
```
/Users/test/projects/existing-repo/
├── README.md
├── .git/
├── package.json
└── (existing project structure)
```

## 📚 Usage Examples

### 1. Create New Project

```typescript
import { ProjectCheckpointAPI } from '../api/projectCheckpointAPI';

const config = {
  projectName: "My React App",
  enableGitHub: true,
  autoCheckpoint: true,
  description: "A modern React application"
};

const result = await ProjectCheckpointAPI.initializeNewProject(
  config,
  mcpServerId,
  executeTool
);

if (result.success) {
  console.log('Project created at:', result.data.projectPath);
  console.log('GitHub repo:', result.data.gitHubRepoUrl);
  console.log('Setup summary:', result.data.setupSummary);
}
```

### 2. Work with Cloned Repository

```typescript
const config = {
  projectName: "Contributing to Open Source",
  isClonedRepo: true,
  repoPath: "/Users/test/projects/awesome-project",
  enableGitHub: false, // Already has GitHub
  autoCheckpoint: false // Don't checkpoint existing code
};

const result = await ProjectCheckpointAPI.initializeNewProject(
  config,
  mcpServerId,
  executeTool
);

if (result.success) {
  console.log('Cloned project initialized');
  console.log('Branches found:', result.data.repoAnalysis?.totalBranches);
}
```

### 3. Manage Existing Project

```typescript
import { createProjectCheckpointAPI } from '../api/projectCheckpointAPI';

const api = createProjectCheckpointAPI(project, mcpServerId, executeTool);

// Create checkpoint before major changes
const checkpoint = await api.createCheckpoint(
  "Before implementing authentication",
  "feature"
);

// Switch to a different branch safely
const switchResult = await api.switchToBranch("develop", true);

// List all checkpoints
const checkpoints = await api.listCheckpoints();

// Check project health
const health = await api.getProjectHealth();
```

## 🔄 Workflow Examples

### Complete Development Workflow

```typescript
// 1. Initialize project
const project = await ProjectCheckpointAPI.initializeNewProject({
  projectName: "E-commerce App",
  enableGitHub: true,
  autoCheckpoint: true
}, serverId, executeTool);

// 2. Get API instance for ongoing work
const api = createProjectCheckpointAPI(projectObj, serverId, executeTool);

// 3. Create checkpoint before major feature
await api.createCheckpoint("Before adding payment system", "feature");

// 4. Work on feature branch
await api.switchToBranch("feature/payment-integration", true);

// 5. Create checkpoint after completion
await api.createCheckpoint("Payment system completed", "feature");

// 6. Switch back to main
await api.switchToBranch("main", true);

// 7. Check project health before deployment
const health = await api.getProjectHealth();
```

### Branch Management Scenarios

```typescript
const api = createProjectCheckpointAPI(project, serverId, executeTool);

// Scenario 1: Safe switch with backup
await api.switchToBranch("feature/new-ui", true);

// Scenario 2: Switch to remote branch
await api.switchToBranch("origin/hotfix/critical-bug", true);

// Scenario 3: Switch to checkpoint branch
const checkpoints = await api.listCheckpoints();
const latestCheckpoint = checkpoints.data?.[0];
if (latestCheckpoint) {
  await api.switchToBranch(latestCheckpoint.name, false);
}
```

## 🎯 Integration with Kibitz

### Store Integration

```typescript
import { ProjectAPIStoreIntegration } from '../examples/projectAPIUsage';

// Create project with store integration
const result = await ProjectAPIStoreIntegration.createProjectWithStoreIntegration(
  "My New Project",
  true, // Enable GitHub
  rootStore
);

// Upgrade existing project to use API
const upgraded = ProjectAPIStoreIntegration.upgradeExistingProjectToAPI(
  projectId,
  rootStore
);
```

### Auto-Commit Integration

The API integrates with Kibitz's auto-commit system:

```typescript
// Auto-checkpoint after substantial changes
const autoCommitStore = useAutoCommitStore.getState();
const shouldCheckpoint = await autoCommitStore.shouldCreateAutoCheckpoint(
  projectId,
  project
);

if (shouldCheckpoint) {
  const api = createProjectCheckpointAPI(project, serverId, executeTool);
  await api.createCheckpoint("Auto-checkpoint: substantial changes detected");
}
```

## 📊 Response Format

All API methods return a standardized response:

```typescript
interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
  requestId?: string;
}
```

### Example Responses

**Successful Project Creation:**
```json
{
  "success": true,
  "data": {
    "projectId": "abc123",
    "projectPath": "/Users/test/gitrepo/projects/abc123_my-app",
    "isGitRepo": true,
    "hasGitHubRepo": true,
    "gitHubRepoUrl": "https://github.com/username/my-app-abc123",
    "defaultBranch": "main",
    "setupSummary": [
      "✅ Project directory created successfully",
      "✅ Git repository initialized",
      "🐙 GitHub repository created: https://github.com/username/my-app-abc123",
      "📝 Initial checkpoint created: checkpoint/20241201-1430"
    ]
  },
  "message": "Project My App initialized successfully",
  "timestamp": "2024-12-01T14:30:00.000Z",
  "requestId": "req_abc123"
}
```

**Branch Switch Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "targetBranch": "feature/new-ui",
    "previousBranch": "main",
    "backupBranch": "backup/main-20241201-1430",
    "commitHash": "a1b2c3d4",
    "message": "Successfully switched to branch: feature/new-ui"
  },
  "message": "Successfully switched to branch: feature/new-ui",
  "timestamp": "2024-12-01T14:30:00.000Z",
  "requestId": "req_def456"
}
```

## 🚨 Error Handling

The API provides comprehensive error handling:

```typescript
const result = await api.createCheckpoint("My checkpoint");

if (!result.success) {
  switch (result.error) {
    case 'Not enough changes for checkpoint':
      console.log('Create more substantial changes before checkpointing');
      break;
    case 'Failed to create checkpoint branch':
      console.log('Git operation failed, check repository state');
      break;
    default:
      console.error('Unexpected error:', result.error);
  }
}
```

## 🔧 Advanced Configuration

### Custom Thresholds

```typescript
// Create checkpoint with custom thresholds
const result = await api.createCheckpoint(
  "Custom checkpoint",
  "experiment",
  true // Force creation even without substantial changes
);
```

### GitHub Configuration

GitHub integration can be enabled/disabled per project:

```typescript
// Enable GitHub for new project
const config = {
  projectName: "Public Project",
  enableGitHub: true // Creates public GitHub repository
};

// Disable GitHub for private work
const config = {
  projectName: "Private Project",
  enableGitHub: false // Local git only
};
```

## 🛠️ Troubleshooting

### Common Issues

1. **Directory Creation Failed**
   - Ensure `/Users/test/gitrepo/` exists and is writable
   - Check MCP server connection

2. **Git Operations Failed**
   - Verify git is installed and configured
   - Check for uncommitted changes

3. **GitHub Integration Failed**
   - Ensure `gh` CLI is installed and authenticated
   - Check GitHub API rate limits

4. **Branch Switch Failed**
   - Clean branch names (removes `origin/` prefix automatically)
   - Verify branch exists locally or on remote

### Debug Mode

Enable detailed logging:

```typescript
// The API automatically logs detailed information
// Check browser console for step-by-step execution logs
console.log('🚀 [req_abc123] Initializing new project: My App');
console.log('🔧 [req_abc123] Initializing Git repository...');
console.log('✅ [req_abc123] Project setup completed in 2340ms');
```

## 🚀 Best Practices

### 1. Project Organization
- Use descriptive project names
- Enable GitHub for collaborative projects
- Disable GitHub for sensitive/private work

### 2. Checkpointing Strategy
- Create checkpoints before major changes
- Use descriptive checkpoint messages
- Different branch types for different purposes:
  - `feature/` for new features
  - `bugfix/` for bug fixes
  - `experiment/` for experimental work
  - `checkpoint/` for general checkpoints

### 3. Branch Management
- Always create backups when switching branches
- Use clean, descriptive branch names
- Regularly clean up old checkpoint branches

### 4. Error Handling
- Always check API response success status
- Implement appropriate fallbacks for failed operations
- Log errors for debugging

## 📈 Future Enhancements

Planned improvements to the API:

1. **Automated Conflict Resolution**
2. **Team Collaboration Features** 
3. **Advanced Branch Analytics**
4. **Integration with CI/CD Pipelines**
5. **Custom Checkpoint Triggers**
6. **Repository Templates**

## 🤝 Contributing

When contributing to the Project Checkpoint API:

1. Maintain backward compatibility
2. Add comprehensive tests for new features
3. Update documentation
4. Follow TypeScript best practices
5. Ensure error handling covers edge cases

---

**The Project Checkpoint API provides the foundation for professional-grade project management in Kibitz, combining the simplicity of automatic setup with the power of advanced git operations.** 