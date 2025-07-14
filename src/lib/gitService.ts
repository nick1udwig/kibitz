/**
 * Git Service
 * 
 * Handles Git operations through the MCP (Model-Controller-Presenter) system
 * by executing shell commands on the user's system.
 */

import { createHash } from 'crypto';
import { getGitHubRepoName } from './projectPathService';

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
      console.warn(`Invalid path detected: "${cwd}", using current directory`);
      cwd = ".";
    }
    
    console.log(`🔧 executeGitCommand: Using working directory: "${cwd}" for command: "${command}"`);
    
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
        action_json: {
          command: fullCommand
        },
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
      } else {
        // Handle plain text format with status information
        // The actual command output comes before the "---" separator
        const statusSeparator = '\n---\n';
        if (result.includes(statusSeparator)) {
          actualOutput = result.split(statusSeparator)[0];
        }
      }
      
      // Clean up the output - remove any trailing whitespace and newlines
      actualOutput = actualOutput.trim();
      
      console.log("Parsed git command output:", JSON.stringify(actualOutput));
      
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
      console.error('BashCommand execution failed:', bashError);
      
      // 🔧 REMOVED: Fallback logic that creates additional timeout-prone calls
      // Previously this would try a second BashCommand call which could cascade timeouts
      return {
        success: false,
        output: '',
        error: bashError instanceof Error ? bashError.message : String(bashError)
      };
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
      `[ -f .gitignore ] || printf 'node_modules/\\n.next/\\n.DS_Store\\nout/\\n.env*\\n*.log\\n' > .gitignore`,
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
 * Automatically initializes Git for a project directory if not already a Git repo
 * @param projectPath Project directory path
 * @param projectName Project name
 * @param serverId MCP server ID
 * @param executeTool Function to execute tool on MCP server
 * @returns Whether Git initialization was successful or already existed
 */
export const autoInitGitIfNeeded = async (
  projectPath: string,
  projectName: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<{ success: boolean; wasAlreadyGitRepo: boolean; error?: string }> => {
  try {
    // First check if it's already a Git repository
    const gitCheckResult = await executeGitCommand(
      serverId,
      'git rev-parse --is-inside-work-tree',
      projectPath,
      executeTool
    );
    
    if (gitCheckResult.success && gitCheckResult.output.includes('true')) {
      console.log(`Directory ${projectPath} is already a Git repository`);
      return { success: true, wasAlreadyGitRepo: true };
    }
    
    // Not a Git repo, so initialize it
    console.log(`Initializing Git repository in ${projectPath}`);
    const initResult = await initGitRepository(
      {
        projectPath,
        projectName,
        addFiles: false,  // Don't automatically add files
        initialCommit: false,  // Don't automatically commit
      },
      serverId,
      executeTool
    );
    
    return { 
      success: initResult.success, 
      wasAlreadyGitRepo: false, 
      error: initResult.error 
    };
  } catch (error) {
    console.error('Failed to auto-initialize Git repository:', error);
    return {
      success: false,
      wasAlreadyGitRepo: false,
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
    
    // First, let's verify what files exist in the project directory
    console.log("Checking files in project directory...");
    const listFilesResult = await executeGitCommand(
      serverId,
      'ls -la',
      projectPath,
      executeTool
    );
    
    if (listFilesResult.success) {
      console.log("Files in project directory:", listFilesResult.output);
    }
    
    // Check git status before adding files
    console.log("Checking git status before staging...");
    const preStatusResult = await executeGitCommand(
      serverId,
      'git status --porcelain',
      projectPath,
      executeTool
    );
    
    if (preStatusResult.success) {
      console.log("Git status before staging:", preStatusResult.output || "(empty)");
    }
    
    // Stage all changes with explicit patterns to catch more files
    console.log("Staging changes...");
    const stageResult = await executeGitCommand(
      serverId,
      'git add . && git add -A && git add --all',
      projectPath,
      executeTool
    );
    
    if (!stageResult.success) {
      console.error("Failed to stage changes:", stageResult.error || stageResult.output);
      return { success: false, commitHash: null };
    }
    
    // Also try to add any files that might be in subdirectories
    console.log("Staging files with force...");
    const forceStageResult = await executeGitCommand(
      serverId,
      'find . -type f -not -path "./.git/*" -not -name ".gitignore" -exec git add {} \\;',
      projectPath,
      executeTool
    );
    
    // This command might fail if there are no files, that's okay
    if (forceStageResult.success) {
      console.log("Force staging successful");
    }
    
    // Wait a moment for file system operations to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if there are changes to commit (retry up to 3 times)
    console.log("Checking for changes to commit...");
    let statusResult;
    let attempts = 0;
    const maxAttempts = 3;
    
    do {
      attempts++;
      console.log(`Checking git status (attempt ${attempts}/${maxAttempts})...`);
      
      statusResult = await executeGitCommand(
        serverId,
        'git status --porcelain',
        projectPath,
        executeTool
      );
      
      if (statusResult.success && statusResult.output.trim()) {
        console.log("Found changes to commit:", statusResult.output);
        break;
      }
      
      if (attempts < maxAttempts) {
        console.log("No changes detected, waiting and retrying...");
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Re-stage files before retry with more aggressive approach
        await executeGitCommand(
          serverId,
          'git add . && git add -A && git add --all',
          projectPath,
          executeTool
        );
        
        // Also try force staging again
        await executeGitCommand(
          serverId,
          'find . -type f -not -path "./.git/*" -not -name ".gitignore" -exec git add {} \\;',
          projectPath,
          executeTool
        );
      }
    } while (attempts < maxAttempts);
    
    if (!statusResult || !statusResult.success) {
      console.error("Failed to check git status:", statusResult?.error || statusResult?.output);
      return { success: false, commitHash: null };
    }
    
    // If still no changes after retries, check what files git can see
    if (!statusResult.output.trim()) {
      console.log("No changes detected after retries. Checking git ls-files...");
      const gitLsResult = await executeGitCommand(
        serverId,
        'git ls-files',
        projectPath,
        executeTool
      );
      
      console.log("Git tracked files:", gitLsResult.output || "(none)");
      
      const gitLsOthersResult = await executeGitCommand(
        serverId,
        'git ls-files --others --exclude-standard',
        projectPath,
        executeTool
      );
      
      console.log("Git untracked files:", gitLsOthersResult.output || "(none)");
      
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
    
    // Check if the commit result indicates "nothing to commit"
    if (commitResult.success && commitResult.output.includes('nothing to commit')) {
      console.log("Git reports: nothing to commit, working tree clean");
      return { success: true, commitHash: "no_changes" };
    }
    
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
    
    // Try to push to GitHub if remote origin exists
    console.log("Checking for remote origin and pushing to GitHub...");
    try {
      const remoteCheckResult = await executeGitCommand(
        serverId,
        'git remote get-url origin',
        projectPath,
        executeTool
      );
      
      // Check if remote actually exists (not just command success)
      const hasRemote = remoteCheckResult.success && 
                       remoteCheckResult.output.trim() && 
                       !remoteCheckResult.output.includes('error:') &&
                       !remoteCheckResult.output.includes('No such remote');
      
      if (hasRemote) {
        console.log("Remote origin found, pushing to GitHub...");
        const pushResult = await executeGitCommand(
          serverId,
          'git push origin main',
          projectPath,
          executeTool
        );
        
        if (pushResult.success) {
          console.log("Successfully pushed to GitHub");
        } else {
          console.log("Failed to push to GitHub, but commit was successful locally:", pushResult.output);
        }
      } else {
        console.log("No remote origin configured, skipping push to GitHub");
      }
    } catch (pushError) {
      console.log("Error checking/pushing to GitHub (commit was still successful):", pushError);
    }
    
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

/**
 * Connects a local git repository to a GitHub remote
 * @param projectPath Project path
 * @param repoName GitHub repository name
 * @param username GitHub username
 * @param serverId MCP server ID
 * @param executeTool Function to execute tool on MCP server
 */
export const connectToGitHubRemote = async (
  projectPath: string,
  repoName: string,
  username: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<GitCommandResponse> => {
  try {
    console.log(`Connecting local repository to GitHub remote: ${username}/${repoName}`);
    
    // Check if remote origin already exists
    const checkRemoteResult = await executeGitCommand(
      serverId,
      'git remote get-url origin',
      projectPath,
      executeTool
    );
    
    // Check if remote actually exists (not just command success)
    const hasRemote = checkRemoteResult.success && 
                     checkRemoteResult.output.trim() && 
                     !checkRemoteResult.output.includes('error:') &&
                     !checkRemoteResult.output.includes('No such remote');
    
    if (hasRemote) {
      console.log("Remote origin already exists:", checkRemoteResult.output);
      
      // Try to push existing commits to GitHub
      console.log("Remote exists, pushing any existing commits to GitHub...");
      const pushResult = await executeGitCommand(
        serverId,
        'git push origin main',
        projectPath,
        executeTool
      );
      
      if (pushResult.success) {
        console.log("Successfully pushed to existing remote");
        return { success: true, output: "Remote already configured and commits pushed" };
      } else {
        console.log("Remote exists but push failed:", pushResult.output);
        return { success: true, output: "Remote already configured (push failed)" };
      }
    }
    
    console.log("No remote origin found, adding new remote...");
    
    // Add the remote origin
    const remoteUrl = `https://github.com/${username}/${repoName}.git`;
    console.log(`Adding remote origin: ${remoteUrl}`);
    
    const addRemoteResult = await executeGitCommand(
      serverId,
      `git remote add origin ${remoteUrl}`,
      projectPath,
      executeTool
    );
    
    if (!addRemoteResult.success) {
      console.error("Failed to add remote origin:", addRemoteResult.error || addRemoteResult.output);
      return addRemoteResult;
    }
    
    console.log("Remote origin added successfully");
    
    // Try to push existing commits to GitHub
    console.log("Pushing existing commits to GitHub...");
    const pushResult = await executeGitCommand(
      serverId,
      'git push -u origin main',
      projectPath,
      executeTool
    );
    
    if (pushResult.success) {
      console.log("Successfully connected and pushed to GitHub");
      return { success: true, output: "Connected to GitHub and pushed commits" };
    } else {
      console.log("Connected to GitHub but failed to push:", pushResult.output);
      // Even if push fails, the remote is set up, so this is still a partial success
      return { 
        success: true, 
        output: `Connected to GitHub (push failed: ${pushResult.output})`,
        error: pushResult.error
      };
    }
  } catch (error) {
    console.error('Failed to connect to GitHub remote:', error);
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Pushes commits to the remote repository
 * @param projectPath Project path
 * @param serverId MCP server ID  
 * @param executeTool Function to execute tool on MCP server
 * @param branch Branch to push (defaults to 'main')
 */
export const pushToRemote = async (
  projectPath: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  branch: string = 'main'
): Promise<GitCommandResponse> => {
  try {
    console.log(`Pushing to remote branch '${branch}' from ${projectPath}`);
    
    // Check if remote origin exists
    const remoteCheckResult = await executeGitCommand(
      serverId,
      'git remote get-url origin',
      projectPath,
      executeTool
    );
    
    const hasRemote = remoteCheckResult.success && 
                     remoteCheckResult.output.trim() && 
                     !remoteCheckResult.output.includes('error:') &&
                     !remoteCheckResult.output.includes('No such remote');
    
    if (!hasRemote) {
      return {
        success: false,
        output: '',
        error: 'No remote origin configured. Please connect to a GitHub repository first.'
      };
    }
    
    console.log("Remote origin found:", remoteCheckResult.output);
    
    // Check if there are commits to push
    const statusResult = await executeGitCommand(
      serverId,
      `git status --porcelain -b`,
      projectPath,
      executeTool
    );
    
    if (statusResult.success) {
      console.log("Git status before push:", statusResult.output);
    }
    
    // Push to remote
    const pushResult = await executeGitCommand(
      serverId,
      `git push origin ${branch}`,
      projectPath,
      executeTool
    );
    
    if (pushResult.success) {
      console.log("Successfully pushed to remote");
      return {
        success: true,
        output: `Successfully pushed to origin/${branch}`
      };
    } else {
      console.error("Failed to push to remote:", pushResult.output);
      return {
        success: false,
        output: pushResult.output,
        error: pushResult.error || 'Push failed'
      };
    }
  } catch (error) {
    console.error('Failed to push to remote:', error);
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Gets the current GitHub username from gh CLI
 * @param serverId MCP server ID
 * @param executeTool Function to execute tool on MCP server
 */
export const getGitHubUsername = async (
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<string | null> => {
  try {
    // Check if GitHub CLI is authenticated and get the username
    const userInfoResult = await executeGitCommand(
      serverId,
      'gh api user --jq .login',
      '/',
      executeTool
    );
    
    if (userInfoResult.success && userInfoResult.output.trim()) {
      return userInfoResult.output.trim();
    }
    
    return null;
  } catch (error) {
    console.error('Failed to get GitHub username:', error);
    return null;
  }
};

/**
 * Automatically sets up GitHub integration for auto-commit
 * @param projectPath Project path
 * @param projectId Project ID
 * @param projectName Project name
 * @param serverId MCP server ID
 * @param executeTool Function to execute tool on MCP server
 * @param gitHubEnabled Whether GitHub integration is enabled for this project
 */
export const autoSetupGitHub = async (
  projectPath: string,
  projectId: string,
  projectName: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  gitHubEnabled: boolean = false
): Promise<{ success: boolean; repoUrl?: string; error?: string }> => {
  try {
    console.log('🔧 autoSetupGitHub: Starting automatic GitHub setup...');
    
    // Check if GitHub integration is enabled
    if (!gitHubEnabled) {
      console.log('🔧 autoSetupGitHub: GitHub integration disabled for this project');
      return {
        success: false,
        error: 'GitHub integration is disabled for this project. Enable it in project settings to use GitHub features.'
      };
    }
    
    // Get GitHub username
    const username = await getGitHubUsername(serverId, executeTool);
    if (!username) {
      return {
        success: false,
        error: 'Cannot get GitHub username. Please run `gh auth login` first.'
      };
    }
    
    console.log(`✅ autoSetupGitHub: Using GitHub username: ${username}`);
    
    // Generate repository name
    const repoName = getGitHubRepoName(projectId, projectName);
    console.log(`✅ autoSetupGitHub: Creating repository: ${repoName}`);
    
    // Create GitHub repository
    const createResult = await createGitHubRepository(
      {
        repoName,
        description: `Auto-created for Kibitz project: ${projectName}`,
        isPrivate: false
      },
      serverId,
      executeTool
    );
    
    if (!createResult.success) {
      return {
        success: false,
        error: `Failed to create GitHub repository: ${createResult.error}`
      };
    }
    
    console.log('✅ autoSetupGitHub: GitHub repository created successfully');
    
    // Connect local repository to GitHub
    const connectResult = await connectToGitHubRemote(
      projectPath,
      repoName,
      username,
      serverId,
      executeTool
    );
    
    if (!connectResult.success) {
      return {
        success: false,
        error: `Failed to connect to GitHub remote: ${connectResult.error}`
      };
    }
    
    console.log('✅ autoSetupGitHub: Successfully connected to GitHub remote');
    
    const repoUrl = `https://github.com/${username}/${repoName}`;
    return {
      success: true,
      repoUrl
    };
    
  } catch (error) {
    console.error('❌ autoSetupGitHub: Auto-setup failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during GitHub setup'
    };
  }
};
