# Enhanced Conversation Commit System

This document describes the enhanced conversation commit system that automatically generates git diffs and LLM-powered commit messages for conversation branches.

## 🚀 Features

- **Automatic Git Diff Generation**: Generates comprehensive diffs between commits and their parents
- **LLM-Powered Commit Messages**: Uses your configured LLM provider to generate intelligent, descriptive commit messages
- **Dynamic Provider Support**: Works with Anthropic, OpenAI, and OpenRouter using your project settings
- **Robust Error Handling**: Graceful degradation and retry mechanisms for both Git and LLM failures
- **JSON Metadata Storage**: Stores complete commit history with diffs and LLM data in project JSON
- **Conversation Branch Integration**: Seamlessly integrates with existing conversation branch management

## 📋 Requirements

### LLM Provider Configuration

Your project must have one of the following LLM providers configured:

#### Anthropic (Claude)
```typescript
const projectSettings: ProjectSettings = {
  provider: 'anthropic',
  model: 'claude-3-7-sonnet-20250219',
  anthropicApiKey: 'your-anthropic-api-key',
  // ... other settings
};
```

#### OpenAI
```typescript
const projectSettings: ProjectSettings = {
  provider: 'openai',
  model: 'gpt-4o',
  openaiApiKey: 'your-openai-api-key',
  // ... other settings
};
```

#### OpenRouter
```typescript
const projectSettings: ProjectSettings = {
  provider: 'openrouter',
  model: 'openai/gpt-4-turbo-preview',
  openRouterApiKey: 'your-openrouter-api-key',
  // ... other settings
};
```

### Git Requirements

- A valid Git repository with commits
- MCP server connection for executing Git commands
- Proper Git configuration (user.name and user.email)

## 🛠️ Core Services

### 1. Git Diff Service (`gitDiffService.ts`)

Handles git diff generation and analysis:

```typescript
import { generateCommitDiff, getCommitInfo } from './lib/gitDiffService';

// Generate diff for a specific commit
const diffResult = await generateCommitDiff(
  projectPath,
  commitHash,
  serverId,
  executeTool
);

if (diffResult.success) {
  console.log(`Files changed: ${diffResult.filesChanged.length}`);
  console.log(`Lines: +${diffResult.linesAdded}/-${diffResult.linesRemoved}`);
  console.log(`Diff:\n${diffResult.diff}`);
}
```

### 2. LLM Commit Message Generator (`llmCommitMessageGenerator.ts`)

Generates intelligent commit messages using LLM providers:

```typescript
import { generateLLMCommitMessage } from './lib/llmCommitMessageGenerator';

const request: CommitMessageRequest = {
  gitDiff: diffResult.diff,
  filesChanged: diffResult.filesChanged,
  linesAdded: diffResult.linesAdded,
  linesRemoved: diffResult.linesRemoved,
  conversationId: 'conv-123'
};

const messageResult = await generateLLMCommitMessage(request, projectSettings);

if (messageResult.success) {
  console.log(`Generated message: "${messageResult.message}"`);
  console.log(`Provider: ${messageResult.provider}`);
}
```

### 3. Enhanced Conversation Commit Service (`enhancedConversationCommitService.ts`)

Main integration service that combines all functionality:

```typescript
import { processEnhancedCommit } from './lib/enhancedConversationCommitService';

const request: EnhancedCommitRequest = {
  projectPath: '/path/to/project',
  conversationId: 'conv-abc123',
  branchName: 'conv-abc123-step-1',
  commitHash: 'a1b2c3d4e5f6',
  originalMessage: 'Auto-commit: changes detected',
  projectSettings,
  serverId: 'mcp-server-1',
  executeTool
};

const result = await processEnhancedCommit(request);

if (result.success) {
  console.log('Enhanced commit processed successfully!');
  console.log(`LLM Message: "${result.commitInfo.llmGeneratedMessage}"`);
  console.log(`Processing time: ${result.metrics.totalProcessingTime}ms`);
}
```

## 📊 JSON Schema Updates

The enhanced system stores rich metadata in your project JSON:

### Branch Entry Structure
```json
{
  "branchName": "conv-abc123-step-1",
  "commitHash": "a1b2c3d4e5f6",
  "commitMessage": "feat: implement user authentication",
  "conversation": {
    "conversationId": "abc123",
    "interactionCount": 1,
    "baseBranch": "main"
  },
  "commits": [
    {
      "hash": "a1b2c3d4e5f6",
      "parentHash": "z9y8x7w6v5u4",
      "message": "Auto-commit: changes detected",
      "llmGeneratedMessage": "feat: implement user authentication",
      "author": "Developer Name",
      "timestamp": "2025-01-21T10:30:00Z",
      "diff": "diff --git a/auth.ts b/auth.ts\n...",
      "filesChanged": ["auth.ts", "types.ts"],
      "linesAdded": 145,
      "linesRemoved": 12,
      "llmProvider": "anthropic",
      "llmModel": "claude-3-7-sonnet-20250219"
    }
  ],
  "diffData": {
    "gitDiff": "diff --git a/auth.ts b/auth.ts\n...",
    "llmProvider": "anthropic",
    "llmModel": "claude-3-7-sonnet-20250219",
    "llmGeneratedMessage": "feat: implement user authentication"
  }
}
```

### Conversation Structure
```json
{
  "conversationId": "abc123",
  "createdAt": 1737463800000,
  "branches": [
    {
      "branchName": "conv-abc123-step-1",
      "baseBranch": "main",
      "startingHash": "z9y8x7w6v5u4",
      "interactionIndex": 1,
      "createdAt": 1737463800000,
      "commitHash": "a1b2c3d4e5f6",
      "commits": [...],
      "lastLLMMessage": "feat: implement user authentication"
    }
  ],
  "currentBranch": "conv-abc123-step-1"
}
```

## 🔧 Configuration Options

### Processing Options
```typescript
const options: CommitProcessingOptions = {
  enableLLMGeneration: true,        // Enable LLM commit message generation
  fallbackOnLLMFailure: true,       // Use fallback message if LLM fails
  enableDiffGeneration: true,       // Enable git diff generation
  maxRetries: 3,                    // Maximum retry attempts
  timeoutMs: 30000                  // Timeout in milliseconds
};
```

### LLM Prompt Customization

The system uses a sophisticated prompt to generate commit messages:

- Follows conventional commit format (feat:, fix:, docs:, etc.)
- Focuses on WHAT changed, not HOW
- Keeps messages concise (≤50 characters)
- Uses present tense, imperative mood
- Analyzes file patterns for smart categorization

## 📈 Usage Examples

### Basic Usage
```typescript
import { processEnhancedCommit } from './lib/enhancedConversationCommitService';

// Simple commit processing
const result = await processEnhancedCommit({
  projectPath: '/project/path',
  conversationId: 'conv-123',
  branchName: 'conv-123-step-1',
  commitHash: 'abc123def456',
  originalMessage: 'Changes detected',
  projectSettings,
  serverId: 'mcp-1',
  executeTool
});
```

### Advanced Usage with Custom Options
```typescript
// Custom processing with retry logic
const options = {
  enableLLMGeneration: true,
  fallbackOnLLMFailure: true,
  maxRetries: 2,
  timeoutMs: 20000
};

const result = await processEnhancedCommit(request, options);

if (result.success) {
  // Process successful
  console.log(`Generated: "${result.commitInfo.llmGeneratedMessage}"`);
  
  // Update your project data
  await updateProjectJSONWithCommit(
    projectData,
    conversationId,
    branchName,
    result.commitInfo
  );
} else {
  // Handle failure
  console.error('Processing failed:', result.error);
  console.warn('Warnings:', result.warnings);
}
```

### Batch Processing
```typescript
import { batchCommitProcessingExample } from './examples/enhancedCommitExamples';

// Process multiple commits
await batchCommitProcessingExample(
  projectPath,
  conversationId,
  ['commit1', 'commit2', 'commit3'],
  projectSettings,
  serverId,
  executeTool
);
```

### Analysis and Statistics
```typescript
import { 
  getConversationCommitHistory, 
  generateCommitStatistics 
} from './lib/enhancedConversationCommitService';

// Get commit history
const commits = getConversationCommitHistory(projectData, conversationId);

// Generate statistics
const stats = generateCommitStatistics(commits);

console.log(`LLM Success Rate: ${stats.llmSuccessRate.toFixed(1)}%`);
console.log(`Total Files Changed: ${stats.totalFilesChanged}`);
console.log(`Most Changed Files:`, stats.mostChangedFiles);
```

## 🔍 System Health Check

Validate your system configuration:

```typescript
import { performSystemHealthCheck } from './lib/enhancedConversationCommitService';

const healthCheck = await performSystemHealthCheck(
  projectPath,
  projectSettings,
  serverId,
  executeTool
);

console.log(`System Health: ${healthCheck.overall}`);
console.log('Checks:', healthCheck.checks);

if (healthCheck.overall === 'healthy') {
  // All systems go!
} else {
  // Address issues before proceeding
  console.log('Issues:', healthCheck.details);
}
```

## ⚠️ Error Handling

The system includes comprehensive error handling:

### Graceful Degradation
- If LLM generation fails, falls back to intelligent rule-based messages
- If diff generation fails, continues with basic commit information
- Retry mechanisms with exponential backoff

### Error Types
```typescript
// LLM API failures
{
  success: false,
  message: "feat: add new functionality", // Fallback message
  error: "API key not configured",
  provider: "anthropic"
}

// Git command failures
{
  success: false,
  diff: "",
  error: "Failed to generate diff: not a git repository",
  filesChanged: [],
  linesAdded: 0,
  linesRemoved: 0
}
```

### Validation
```typescript
import { validateLLMSettings } from './lib/enhancedConversationCommitService';

const validation = validateLLMSettings(projectSettings);

if (!validation.isValid) {
  console.error('Configuration errors:', validation.errors);
  // Fix configuration before proceeding
}

if (validation.warnings.length > 0) {
  console.warn('Configuration warnings:', validation.warnings);
}
```

## 🚦 Best Practices

### 1. API Key Management
- Store API keys securely in project settings
- Validate configuration before processing commits
- Handle API failures gracefully

### 2. Performance Optimization
- Use batch processing for multiple commits
- Configure appropriate timeouts
- Implement rate limiting for API calls

### 3. Error Recovery
- Always enable fallback mechanisms
- Monitor LLM success rates
- Implement proper retry logic

### 4. Monitoring
- Track processing metrics
- Monitor API usage and costs
- Analyze commit message quality

## 🔗 Integration Points

### With Conversation Branch Service
```typescript
import { 
  createConversationBranch,
  updateConversationJSON 
} from './lib/conversationBranchService';

// Create branch first
const branchResult = await createConversationBranch(...);

// Then process commits
if (branchResult.success) {
  const commitResult = await processEnhancedCommit(...);
  // Update JSON with enhanced data
}
```

### With Project Management
```typescript
// After processing enhanced commit
if (result.success) {
  // Update project JSON
  projectData = addCommitToConversationJSON(
    projectData,
    conversationId,
    branchName,
    result.commitInfo
  );
  
  // Save to file/database
  await saveProjectData(projectData);
}
```

## 📚 Complete Examples

See `src/examples/enhancedCommitExamples.ts` for comprehensive usage examples including:

1. **Basic Enhanced Commit Processing**
2. **Advanced Usage with Custom Options**
3. **Batch Processing Multiple Commits**
4. **Commit History Analysis**
5. **System Health Checking**
6. **Error Handling and Recovery**

Run all examples:
```typescript
import { runAllExamples } from './examples/enhancedCommitExamples';

await runAllExamples(
  projectPath,
  conversationId,
  commitHashes,
  projectSettings,
  serverId,
  executeTool
);
```

## 🎯 Summary

The Enhanced Conversation Commit System provides:

✅ **Automatic git diff generation** for every commit  
✅ **LLM-powered commit messages** using your configured provider  
✅ **Complete JSON metadata storage** with full commit history  
✅ **Robust error handling** and graceful degradation  
✅ **Easy integration** with existing conversation branch system  
✅ **Comprehensive examples** and documentation  

This system transforms basic auto-commits into intelligent, well-documented changes that provide valuable insight into your development process while maintaining full compatibility with your existing workflow. 