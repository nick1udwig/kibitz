/**
 * Project Data Extractor
 * 
 * Extracts and structures all git/project data for frontend API integration
 * Like Cursor/Replit: Each conversation = repo, branches = iterations
 * 
 * Features:
 * - Git branch analysis and JSON export
 * - Conversation-to-branch mapping
 * - API-ready data structure
 * - Real-time project state tracking
 */

import { getProjectPath } from './projectPathService';

// 🔒 Singleton pattern to prevent multiple simultaneous extractions
const extractionInProgress = new Map<string, Promise<ProjectApiData>>();

export interface BranchSnapshot {
  branchName: string;
  commitHash: string;
  commitMessage: string;
  timestamp: number;
  author: string;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  parentBranch?: string;
  isMainBranch: boolean;
  tags: string[];
}

export interface ConversationSnapshot {
  conversationId: string;
  conversationName: string;
  projectId: string;
  associatedBranches: string[];
  startTime: number;
  endTime?: number;
  messageCount: number;
  toolsUsed: string[];
  filesCreated: string[];
  filesModified: string[];
  isActive: boolean;
}

export interface ProjectApiData {
  projectId: string;
  projectName: string;
  projectPath: string;
  gitInitialized: boolean;
  
  // Repository info (like GitHub API)
  repository: {
    defaultBranch: string;
    totalBranches: number;
    totalCommits: number;
    lastActivity: number;
    size: number; // bytes
    languages: { [key: string]: number }; // file extensions -> line count
  };
  
  // Branches (like GitHub branches API)
  branches: BranchSnapshot[];
  
  // Conversations (unique to Kibitz)
  conversations: ConversationSnapshot[];
  
  // Recent activity (like GitHub activity API)
  recentActivity: Array<{
    type: 'commit' | 'branch_create' | 'conversation_start' | 'conversation_end';
    timestamp: number;
    details: any;
  }>;
  
  // Statistics (like GitHub stats API)
  statistics: {
    commitsPerDay: { [date: string]: number };
    branchesPerConversation: number;
    averageConversationLength: number;
    mostActiveFiles: Array<{ path: string; changes: number }>;
  };
  
  // API endpoints (for frontend integration)
  apiEndpoints: {
    branches: string;
    commits: string;
    conversations: string;
    activity: string;
    files: string;
  };
  
  lastUpdated: number;
}

export class ProjectDataExtractor {
  private static instance: ProjectDataExtractor | null = null;

  static getInstance(): ProjectDataExtractor {
    if (!ProjectDataExtractor.instance) {
      ProjectDataExtractor.instance = new ProjectDataExtractor();
    }
    return ProjectDataExtractor.instance;
  }

  /**
   * Extract complete project data and save to structured JSON
   */
  async extractProjectData(
    projectId: string,
    projectName: string,
    mcpServerId: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<ProjectApiData> {
    console.log(`🔍 ProjectDataExtractor: Starting extraction for project ${projectId}`);

    const projectPath = getProjectPath(projectId, projectName);
    
    try {
      // Initialize MCP thread
      const threadId = await this.initializeMcpThread(projectPath, executeTool, mcpServerId);
      
      // Extract git data
      const gitData = await this.extractGitData(projectPath, executeTool, mcpServerId, threadId);
      
      // Extract conversation data (from IndexedDB/localStorage)
      const conversationData = await this.extractConversationData(projectId);
      
      // Analyze file system
      const fileSystemData = await this.analyzeFileSystem(projectPath, executeTool, mcpServerId, threadId);
      
      // Build API data structure
      const apiData: ProjectApiData = {
        projectId,
        projectName,
        projectPath,
        gitInitialized: gitData.isInitialized,
        
        repository: {
          defaultBranch: gitData.defaultBranch,
          totalBranches: gitData.branches.length,
          totalCommits: gitData.totalCommits,
          lastActivity: gitData.lastActivity,
          size: fileSystemData.totalSize,
          languages: fileSystemData.languages
        },
        
        branches: gitData.branches,
        conversations: conversationData,
        recentActivity: this.buildActivityTimeline(gitData, conversationData),
        statistics: this.calculateStatistics(gitData, conversationData),
        
        apiEndpoints: {
          branches: `/api/projects/${projectId}/branches`,
          commits: `/api/projects/${projectId}/commits`,
          conversations: `/api/projects/${projectId}/conversations`,
          activity: `/api/projects/${projectId}/activity`,
          files: `/api/projects/${projectId}/files`
        },
        
        lastUpdated: Date.now()
      };
      
      // Save structured JSON files
      await this.saveStructuredData(apiData, projectPath, executeTool, mcpServerId, threadId);
      
      console.log(`✅ ProjectDataExtractor: Extraction complete for project ${projectId}`);
      return apiData;
      
    } catch (error) {
      console.error(`❌ ProjectDataExtractor: Failed to extract project data:`, error);
      throw error;
    }
  }

  /**
   * Initialize MCP thread for operations
   */
  private async initializeMcpThread(
    projectPath: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    mcpServerId: string
  ): Promise<string> {
    const threadId = "git-operations";
    
    try {
      console.log(`🔧 ProjectDataExtractor: Initializing MCP thread: ${threadId}`);
      const result = await executeTool(mcpServerId, 'Initialize', {
        type: "first_call",
        any_workspace_path: projectPath,
        initial_files_to_read: [],
        task_id_to_resume: "",
        mode_name: "wcgw",
        thread_id: threadId
      });
      
      if (result.includes('error') || result.includes('Error')) {
        throw new Error(`Initialize failed: ${result}`);
      }
      
      console.log(`✅ ProjectDataExtractor: MCP thread initialized: ${threadId}`);
      return threadId;
    } catch (error) {
      console.warn(`⚠️ ProjectDataExtractor: Failed to initialize MCP thread, using fallback:`, error);
      return "git-operations";
    }
  }

  /**
   * Extract all git data (branches, commits, etc.)
   */
  private async extractGitData(
    projectPath: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    mcpServerId: string,
    threadId: string
  ): Promise<{
    isInitialized: boolean;
    defaultBranch: string;
    branches: BranchSnapshot[];
    totalCommits: number;
    lastActivity: number;
  }> {
    console.log(`🔍 Extracting git data from ${projectPath}`);

    // Check if git is initialized
    const gitCheckResult = await executeTool(mcpServerId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && git rev-parse --is-inside-work-tree 2>/dev/null || echo "not_git"`,
        type: 'command'
      },
      thread_id: threadId
    });

    const isInitialized = !this.extractCommandOutput(gitCheckResult).includes('not_git');
    
    if (!isInitialized) {
      return {
        isInitialized: false,
        defaultBranch: 'main',
        branches: [],
        totalCommits: 0,
        lastActivity: 0
      };
    }

    // Get all branches
    const branchesResult = await executeTool(mcpServerId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && git branch -a --format="%(refname:short)|%(objectname)|%(committerdate:unix)|%(subject)" 2>/dev/null || echo "no_branches"`,
        type: 'command'
      },
      thread_id: threadId
    });

    const branchLines = this.extractCommandOutput(branchesResult).split('\n').filter(line => line.trim());
    const branches: BranchSnapshot[] = [];

    for (const line of branchLines) {
      if (line.includes('no_branches') || !line.includes('|')) continue;
      
      const [branchName, commitHash, timestamp, message] = line.split('|');
      if (!branchName || !commitHash) continue;

      // Get detailed commit info
      const commitInfoResult = await executeTool(mcpServerId, 'BashCommand', {
        action_json: {
          command: `cd "${projectPath}" && git show --stat --format="%an|%ai|%s" ${commitHash} | head -20`,
          type: 'command'
        },
        thread_id: threadId
      });

      const commitInfo = this.parseCommitInfo(this.extractCommandOutput(commitInfoResult));

      branches.push({
        branchName: branchName.replace('origin/', ''),
        commitHash,
        commitMessage: message || commitInfo.message,
        timestamp: parseInt(timestamp) * 1000 || Date.now(),
        author: commitInfo.author,
        filesChanged: commitInfo.filesChanged,
        linesAdded: commitInfo.linesAdded,
        linesRemoved: commitInfo.linesRemoved,
        isMainBranch: branchName === 'main' || branchName === 'master',
        tags: branchName.startsWith('auto/') ? ['auto'] : ['manual']
      });
    }

    // Get total commits
    const commitCountResult = await executeTool(mcpServerId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && git rev-list --count HEAD 2>/dev/null || echo "0"`,
        type: 'command'
      },
      thread_id: threadId
    });

    const totalCommits = parseInt(this.extractCommandOutput(commitCountResult)) || 0;
    const lastActivity = branches.length > 0 ? Math.max(...branches.map(b => b.timestamp)) : Date.now();

    return {
      isInitialized: true,
      defaultBranch: branches.find(b => b.isMainBranch)?.branchName || 'main',
      branches,
      totalCommits,
      lastActivity
    };
  }

  /**
   * Extract conversation data from frontend storage
   */
  private async extractConversationData(projectId: string): Promise<ConversationSnapshot[]> {
    console.log(`🔍 Extracting conversation data for project ${projectId}`);
    
    // This would normally connect to IndexedDB or localStorage
    // For now, return mock data structure
    return [];
  }

  /**
   * Analyze file system and calculate statistics
   */
  private async analyzeFileSystem(
    projectPath: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    mcpServerId: string,
    threadId: string
  ): Promise<{
    totalSize: number;
    languages: { [key: string]: number };
  }> {
    // Get directory size
    const sizeResult = await executeTool(mcpServerId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && du -sb . 2>/dev/null | cut -f1 || echo "0"`,
        type: 'command'
      },
      thread_id: threadId
    });

    const totalSize = parseInt(this.extractCommandOutput(sizeResult)) || 0;

    // Analyze file types
    const filesResult = await executeTool(mcpServerId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && find . -type f -name "*.*" | grep -v ".git" | head -100`,
        type: 'command'
      },
      thread_id: threadId
    });

    const files = this.extractCommandOutput(filesResult).split('\n').filter(f => f.trim());
    const languages: { [key: string]: number } = {};

    for (const file of files) {
      const ext = file.split('.').pop()?.toLowerCase();
      if (ext) {
        languages[ext] = (languages[ext] || 0) + 1;
      }
    }

    return { totalSize, languages };
  }

  /**
   * Save structured data to JSON files
   */
  private async saveStructuredData(
    apiData: ProjectApiData,
    projectPath: string,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    mcpServerId: string,
    threadId: string
  ): Promise<void> {
    console.log(`💾 Saving structured data to ${projectPath}/.kibitz/`);

    // Create .kibitz directory
    await executeTool(mcpServerId, 'BashCommand', {
      action_json: {
        command: `cd "${projectPath}" && mkdir -p .kibitz/api`,
        type: 'command'
      },
      thread_id: threadId
    });

    // Save main project API data
    await this.saveJsonFile(
      `${projectPath}/.kibitz/api/project.json`,
      apiData,
      executeTool,
      mcpServerId,
      threadId
    );

    // Save branches data (GitHub-style)
    await this.saveJsonFile(
      `${projectPath}/.kibitz/api/branches.json`,
      { branches: apiData.branches },
      executeTool,
      mcpServerId,
      threadId
    );

    // Save conversations data
    await this.saveJsonFile(
      `${projectPath}/.kibitz/api/conversations.json`,
      { conversations: apiData.conversations },
      executeTool,
      mcpServerId,
      threadId
    );

    // Save summary for quick access
    await this.saveJsonFile(
      `${projectPath}/.kibitz/summary.json`,
      {
        projectId: apiData.projectId,
        projectName: apiData.projectName,
        totalBranches: apiData.repository.totalBranches,
        totalCommits: apiData.repository.totalCommits,
        lastActivity: apiData.repository.lastActivity,
        hasData: true,
        apiVersion: "1.0",
        lastUpdated: apiData.lastUpdated
      },
      executeTool,
      mcpServerId,
      threadId
    );

    console.log(`✅ Structured data saved to ${projectPath}/.kibitz/`);
  }

  /**
   * Save JSON file using MCP tools
   */
  private async saveJsonFile(
    filePath: string,
    data: any,
    executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    mcpServerId: string,
    threadId: string
  ): Promise<void> {
    const jsonContent = JSON.stringify(data, null, 2);
    
    try {
      // Use FileWriteOrEdit to save the file
      await executeTool(mcpServerId, 'FileWriteOrEdit', {
        file_path: filePath,
        content: jsonContent,
        thread_id: threadId
      });
    } catch (error) {
      console.warn(`⚠️ Failed to save ${filePath} with FileWriteOrEdit, trying BashCommand`);
      
      // Fallback to echo command
      const escapedContent = jsonContent.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      await executeTool(mcpServerId, 'BashCommand', {
        action_json: {
          command: `echo "${escapedContent}" > "${filePath}"`,
          type: 'command'
        },
        thread_id: threadId
      });
    }
  }

  /**
   * Build activity timeline
   */
  private buildActivityTimeline(gitData: any, conversationData: ConversationSnapshot[]): any[] {
    const activities: any[] = [];
    
    // Add commit activities
    gitData.branches.forEach((branch: BranchSnapshot) => {
      activities.push({
        type: 'commit',
        timestamp: branch.timestamp,
        details: {
          branchName: branch.branchName,
          commitHash: branch.commitHash,
          message: branch.commitMessage,
          author: branch.author
        }
      });
    });

    // Sort by timestamp (newest first)
    return activities.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
  }

  /**
   * Calculate project statistics
   */
  private calculateStatistics(gitData: any, conversationData: ConversationSnapshot[]): any {
    return {
      commitsPerDay: {},
      branchesPerConversation: conversationData.length > 0 ? gitData.branches.length / conversationData.length : 0,
      averageConversationLength: 0,
      mostActiveFiles: []
    };
  }

  /**
   * Parse commit info from git output
   */
  private parseCommitInfo(output: string): {
    author: string;
    message: string;
    filesChanged: string[];
    linesAdded: number;
    linesRemoved: number;
  } {
    const lines = output.split('\n');
    const firstLine = lines[0] || '';
    const [author, , message] = firstLine.split('|');
    
    const filesChanged: string[] = [];
    let linesAdded = 0;
    let linesRemoved = 0;

    // Parse file changes from git stat output
    for (const line of lines.slice(1)) {
      if (line.includes('|') && (line.includes('+') || line.includes('-'))) {
        const fileName = line.split('|')[0]?.trim();
        if (fileName) filesChanged.push(fileName);
        
        const additions = (line.match(/\+/g) || []).length;
        const deletions = (line.match(/-/g) || []).length;
        linesAdded += additions;
        linesRemoved += deletions;
      }
    }

    return {
      author: author?.trim() || 'Unknown',
      message: message?.trim() || 'No message',
      filesChanged,
      linesAdded,
      linesRemoved
    };
  }

  /**
   * Extract command output from MCP result
   */
  private extractCommandOutput(result: string): string {
    try {
      const lines = result.split('\n');
      const outputStart = lines.findIndex(line => 
        line.includes('status = process exited') || 
        line.includes('---')
      );
      
      if (outputStart > 0) {
        return lines.slice(0, outputStart).join('\n');
      }
      return result;
    } catch {
      return result;
    }
  }
}

/**
 * Convenience function to extract and save project data
 */
export async function extractAndSaveProjectData(
  projectId: string,
  projectName: string,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<ProjectApiData> {
  // 🔒 Check if extraction is already in progress for this project
  const key = `${projectId}_${projectName}`;
  
  if (extractionInProgress.has(key)) {
    console.log(`⏳ ProjectDataExtractor: Extraction already in progress for ${projectId}, waiting...`);
    return await extractionInProgress.get(key)!;
  }

  // 🚀 Start new extraction
  console.log(`🚀 ProjectDataExtractor: Starting new extraction for ${projectId}`);
  const extractionPromise = (async () => {
    try {
      const extractor = ProjectDataExtractor.getInstance();
      const result = await extractor.extractProjectData(projectId, projectName, mcpServerId, executeTool);
      return result;
    } finally {
      // 🧹 Clean up when done
      extractionInProgress.delete(key);
    }
  })();

  // 📝 Store the promise to prevent concurrent extractions
  extractionInProgress.set(key, extractionPromise);
  
  return await extractionPromise;
} 