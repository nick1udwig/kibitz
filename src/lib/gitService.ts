/**
 * Git Service
 * 
 * Handles Git operations through the MCP (Model-Controller-Presenter) system
 * by executing shell commands on the user's system.
 */

/**
 * Response from Git command execution
 */
interface GitCommandResponse {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Options for Git repository initialization
 */
interface GitInitOptions {
  projectPath: string;
  projectName: string;
  addFiles?: boolean;
  initialCommit?: boolean;
  commitMessage?: string;
}

/**
 * Options for creating a GitHub repository
 */
interface GitHubRepoOptions {
  repoName: string;
  description?: string;
  isPrivate?: boolean;
}

/**
 * MCP server response content item
 */
interface McpResponseItem {
  type: string;
  text: string;
}

/**
 * Executes a Git command via MCP
 * @param serverId MCP server ID
 * @param command Git command to execute
 * @param cwd Current working directory
 * @param executeTool Function to execute tool on MCP server
 */
export const executeGitCommand = async (
  serverId: string,
  command: string,
  cwd: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<GitCommandResponse> => {
  try {
    // Validate the path - if it contains "Error:" or other indicators it's not valid
    if (!cwd || typeof cwd !== 'string' || cwd.includes('Error:') || cwd.includes('No such file')) {
      console.warn(`Invalid path detected: "${cwd}", using fallback`);
      cwd = "/Users/test/workx/kibitz";
    }
    
    // Storage for the thread ID
    let threadId = "git-operations";
    let needToInitialize = true;
    
    // First try to initialize if needed
    if (needToInitialize) {
      try {
        console.log("Initializing MCP environment...");
        const initResult = await executeTool(serverId, 'Initialize', {
          type: "first_call",
          any_workspace_path: cwd,
          initial_files_to_read: [],
          task_id_to_resume: "",
          mode_name: "wcgw",
          thread_id: threadId
        });
        
        // Extract the thread_id from the response
        const match = initResult.match(/thread_id=([a-z0-9]+)/i);
        if (match && match[1]) {
          threadId = match[1];
          console.log(`Successfully initialized with thread_id=${threadId}`);
          needToInitialize = false;
        } else {
          console.log("Initialized but couldn't extract thread_id, using default");
        }
      } catch (initError) {
        console.warn("Failed to initialize MCP environment:", initError);
      }
    }
    
    // Run the actual command with BashCommand
    try {
      const fullCommand = `cd "${cwd}" && ${command}`;
      console.log(`Executing bash command: ${fullCommand} with thread_id=${threadId}`);
      
      const result = await executeTool(serverId, 'BashCommand', {
        action_json: { command: fullCommand },
        thread_id: threadId
      });
      
      console.log("Raw BashCommand result:", result);
      
      // Extract the actual output from the result structure
      let actualOutput = result;
      
      // Handle response in JSON format
      if (result.includes('"content":')) {
        try {
          // Try to parse as JSON, in case the entire response is JSON
          const jsonResult = JSON.parse(result);
          if (jsonResult.content && Array.isArray(jsonResult.content)) {
            actualOutput = jsonResult.content
              .filter((item: McpResponseItem) => item.type === 'text')
              .map((item: McpResponseItem) => item.text)
              .join('\n');
          }
        } catch (jsonError) {
          // If it's not valid JSON, try to extract the content array using regex
          const contentMatch = result.match(/"content":\s*\[\s*\{\s*"type":\s*"text",\s*"text":\s*"([^"]+)"/);
          if (contentMatch && contentMatch[1]) {
            actualOutput = contentMatch[1].replace(/\\n/g, '\n');
          }
        }
      }
      
      // Check for error indicators in the output
      const isError = 
        actualOutput.includes('Error:') || 
        actualOutput.includes('fatal:') ||
        actualOutput.includes('No such file or directory');
      
      return {
        success: !isError,
        output: actualOutput
      };
    } catch (bashError) {
      console.log('BashCommand failed, trying terminal tool as fallback:', bashError);
      
      // Fallback to terminal tool (older MCP servers)
      try {
        const result = await executeTool(serverId, 'terminal', {
          command: `cd "${cwd}" && ${command}`,
          cwd,
        });
        
        return {
          success: !result.includes('Error:') && !result.includes('fatal:') && !result.includes('No such file'),
          output: result
        };
      } catch (terminalError) {
        console.error('Terminal command execution failed:', terminalError);
        throw new Error(`Failed to execute command: ${command} - ${terminalError}`);
      }
    }
  } catch (error) {
    console.error('Git command execution failed:', error);
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Initializes a Git repository
 * @param options Init options
 * @param serverId MCP server ID
 * @param executeTool Function to execute tool on MCP server
 */
export const initGitRepository = async (
  options: GitInitOptions,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<GitCommandResponse> => {
  try {
    // Initialize Git repository
    const initResult = await executeGitCommand(
      serverId,
      'git init',
      options.projectPath,
      executeTool
    );
    
    if (!initResult.success) {
      return initResult;
    }
    
    // Create .gitignore if it doesn't exist
    const createGitignoreResult = await executeGitCommand(
      serverId,
      `[ -f .gitignore ] || echo "node_modules/\\n.next/\\n.DS_Store\\nout/\\n.env*\\n*.log" > .gitignore`,
      options.projectPath,
      executeTool
    );
    
    if (!createGitignoreResult.success) {
      return createGitignoreResult;
    }
    
    // Add files if requested
    if (options.addFiles) {
      const addResult = await executeGitCommand(
        serverId,
        'git add .',
        options.projectPath,
        executeTool
      );
      
      if (!addResult.success) {
        return addResult;
      }
    }
    
    // Make initial commit if requested
    if (options.initialCommit) {
      const message = options.commitMessage || 'Initial commit';
      const commitResult = await executeGitCommand(
        serverId,
        `git commit -m "${message}"`,
        options.projectPath,
        executeTool
      );
      
      if (!commitResult.success) {
        return commitResult;
      }
    }
    
    return {
      success: true,
      output: 'Git repository initialized successfully'
    };
  } catch (error) {
    console.error('Failed to initialize Git repository:', error);
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Creates a GitHub repository using GitHub CLI
 * @param options GitHub repository options
 * @param serverId MCP server ID
 * @param executeTool Function to execute tool on MCP server
 */
export const createGitHubRepository = async (
  options: GitHubRepoOptions,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<GitCommandResponse> => {
  try {
    // Check if GitHub CLI is installed
    const ghCheckResult = await executeGitCommand(
      serverId,
      'gh --version',
      '/',
      executeTool
    );
    
    if (!ghCheckResult.success) {
      return {
        success: false,
        output: '',
        error: 'GitHub CLI is not installed or not available in PATH'
      };
    }
    
    // Check if user is authenticated with GitHub CLI
    const authCheckResult = await executeGitCommand(
      serverId,
      'gh auth status',
      '/',
      executeTool
    );
    
    if (!authCheckResult.success) {
      return {
        success: false,
        output: '',
        error: 'GitHub CLI is not authenticated. Please run `gh auth login` first'
      };
    }
    
    // Create GitHub repository
    let createRepoCommand = `gh repo create ${options.repoName}`;
    if (options.description) {
      createRepoCommand += ` --description "${options.description}"`;
    }
    createRepoCommand += options.isPrivate ? ' --private' : ' --public';
    
    const createRepoResult = await executeGitCommand(
      serverId,
      createRepoCommand,
      '/',
      executeTool
    );
    
    return createRepoResult;
  } catch (error) {
    console.error('Failed to create GitHub repository:', error);
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Gets Git username and email
 * @param serverId MCP server ID
 * @param executeTool Function to execute tool on MCP server
 */
export const getGitUserInfo = async (
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ name: string | null; email: string | null }> => {
  try {
    const nameResult = await executeGitCommand(
      serverId,
      'git config --get user.name',
      '/',
      executeTool
    );
    
    const emailResult = await executeGitCommand(
      serverId,
      'git config --get user.email',
      '/',
      executeTool
    );
    
    return {
      name: nameResult.success ? nameResult.output.trim() : null,
      email: emailResult.success ? emailResult.output.trim() : null
    };
  } catch (error) {
    console.error('Failed to get Git user info:', error);
    return { name: null, email: null };
  }
};

/**
 * Gets the current commit hash
 * @param projectPath Project path
 * @param serverId MCP server ID
 * @param executeTool Function to execute tool on MCP server
 */
export const getCurrentCommitHash = async (
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<string | null> => {
  try {
    const result = await executeGitCommand(
      serverId,
      'git rev-parse HEAD',
      projectPath,
      executeTool
    );
    
    return result.success ? result.output.trim() : null;
  } catch (error) {
    console.error('Failed to get current commit hash:', error);
    return null;
  }
};

/**
 * Creates a Git commit
 * @param projectPath Project path
 * @param message Commit message
 * @param serverId MCP server ID
 * @param executeTool Function to execute tool on MCP server
 */
export const createCommit = async (
  projectPath: string,
  message: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ success: boolean; commitHash: string | null }> => {
  try {
    console.log(`Attempting to create commit in ${projectPath} with message: "${message}"`);
    
    // Stage all changes
    console.log("Staging changes...");
    const stageResult = await executeGitCommand(
      serverId,
      'git add .',
      projectPath,
      executeTool
    );
    
    if (!stageResult.success) {
      console.error("Failed to stage changes:", stageResult.error || stageResult.output);
      return { success: false, commitHash: null };
    }
    
    // Check if there are changes to commit
    console.log("Checking for changes to commit...");
    const statusResult = await executeGitCommand(
      serverId,
      'git status --porcelain',
      projectPath,
      executeTool
    );
    
    if (!statusResult.success) {
      console.error("Failed to check git status:", statusResult.error || statusResult.output);
      return { success: false, commitHash: null };
    }
    
    // If no changes, return error
    if (!statusResult.output.trim()) {
      console.log("No changes to commit");
      return { success: true, commitHash: "no_changes" };
    }
    
    // Commit changes
    console.log(`Creating commit with message: "${message}"...`);
    const commitResult = await executeGitCommand(
      serverId,
      `git commit -m "${message}"`,
      projectPath,
      executeTool
    );
    
    if (!commitResult.success) {
      console.error("Failed to commit changes:", commitResult.error || commitResult.output);
      return { success: false, commitHash: null };
    }
    
    console.log("Commit successful, retrieving commit hash...");
    // Get commit hash
    const hashResult = await executeGitCommand(
      serverId,
      'git rev-parse HEAD',
      projectPath,
      executeTool
    );
    
    if (!hashResult.success || !hashResult.output.trim()) {
      console.error("Failed to get commit hash:", hashResult.error || "Empty result");
      return { success: true, commitHash: "unknown" };
    }
    
    const commitHash = hashResult.output.trim();
    console.log(`Successfully retrieved commit hash: ${commitHash}`);
    
    return {
      success: true,
      commitHash
    };
  } catch (error) {
    console.error('Failed to create commit:', error);
    return { 
      success: false, 
      commitHash: null 
    };
  }
}; 