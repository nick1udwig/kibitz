# Testing the Project-Specific Directory System

## Overview

Each project now gets its own isolated directory under `/Users/test/gitrepo/projects/` with the structure:
- `{projectId}_{sanitized-project-name}/`

## Key Features

1. **Automatic Directory Creation**: Project directories are created when:
   - A new project is created with MCP servers available
   - A user sends their first message to an LLM with tool capabilities
   - Git operations are performed

2. **Unique GitHub Repository Names**: GitHub repos are named `{sanitized-name}-{projectId}` to avoid conflicts

3. **Isolated Workspaces**: Each project operates in its own directory, preventing cross-contamination

## Testing Steps

### 1. Create a New Project
1. Open Kibitz
2. Create a new project with any name (e.g., "My Test Project")
3. The system should automatically create: `/Users/test/gitrepo/projects/{projectId}_my-test-project/`

### 2. Test Tool Execution
1. Send a message that triggers tool use (like asking to create a file)
2. The tool should execute in the project-specific directory
3. Check that files are created in the correct project directory

### 3. Test Git Operations
1. Go to the Checkpoints tab
2. Click "Initialize Git" - should work in the project directory
3. Click "Create GitHub Repo" - should create repo with unique name like `my-test-project-{projectId}`
4. Click "Create Commit" - should work in the project directory

### 4. Test Multiple Projects
1. Create a second project
2. Switch between projects
3. Verify that tool operations work in the correct directories for each project

## Expected Directory Structure
```
/Users/test/gitrepo/projects/
├── abc123_my-test-project/
│   ├── README.md
│   ├── .git/ (if git initialized)
│   └── (other project files)
└── def456_another-project/
    ├── README.md
    └── (other project files)
```

## Verification Commands

You can verify the system is working by running these commands in terminal:

```bash
# Check if project directories are created
ls -la /Users/test/gitrepo/projects/

# Check content of a specific project
ls -la /Users/test/gitrepo/projects/{projectId}_{project-name}/

# Check git status in project directory
cd /Users/test/gitrepo/projects/{projectId}_{project-name}/
git status
```

## Troubleshooting

If directories aren't being created:
1. Check that MCP servers are connected
2. Check console logs for errors
3. Verify the base directory `/Users/test/gitrepo/` exists and is writable

If git operations fail:
1. Ensure git is installed and configured
2. For GitHub operations, ensure `gh` CLI is installed and authenticated
3. Check that the project directory has been created first 