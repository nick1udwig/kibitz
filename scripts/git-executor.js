import path from 'path';

/**
 * GitExecutor class for executing git and GitHub CLI commands via MCP server
 */
export class GitExecutor {
  constructor(mcpClient) {
    this.mcpClient = mcpClient;
    this.logger = {
      info: (msg, ...args) => console.log(`[GIT-EXECUTOR] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[GIT-EXECUTOR] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[GIT-EXECUTOR] ${msg}`, ...args),
      debug: (msg, ...args) => process.env.DEBUG && console.log(`[GIT-EXECUTOR] ${msg}`, ...args)
    };
  }

  /**
   * Executes a git command via MCP server
   * @param {string} command - Git subcommand (e.g., 'push', 'status', 'log')
   * @param {Array<string>} args - Command arguments
   * @param {Object} options - Execution options
   * @param {string} options.cwd - Working directory
   * @param {number} options.timeout - Timeout in milliseconds
   * @param {boolean} options.ignoreErrors - Don't throw on non-zero exit codes
   * @returns {Promise<Object>} Execution result
   */
  async executeGitCommand(command, args = [], options = {}) {
    const {
      cwd = process.cwd(),
      timeout = 30000,
      ignoreErrors = false
    } = options;

    const fullCommand = ['git', command, ...args].join(' ');
    
    this.logger.debug(`Executing git command: ${fullCommand} in ${cwd}`);

    try {
      // Execute command via MCP server
      const result = await this.mcpClient.callTool('run_terminal_cmd', {
        command: fullCommand,
        explanation: `Execute git ${command} command`,
        is_background: false
      });

      // Parse MCP result
      const executionResult = {
        success: true,
        command: fullCommand,
        cwd,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.exitCode || 0,
        timestamp: new Date().toISOString()
      };

      // Check for errors
      if (!ignoreErrors && (result.exitCode !== 0 || result.error)) {
        throw new Error(`Git command failed: ${result.stderr || result.error || 'Unknown error'}`);
      }

      this.logger.debug(`Git command succeeded: ${command}`);
      return executionResult;

    } catch (error) {
      this.logger.error(`Git command failed: ${fullCommand}`, error.message);
      
      const errorResult = {
        success: false,
        command: fullCommand,
        cwd,
        stdout: '',
        stderr: error.message,
        exitCode: 1,
        error: error.message,
        timestamp: new Date().toISOString()
      };

      if (!ignoreErrors) {
        throw error;
      }

      return errorResult;
    }
  }

  /**
   * Executes a GitHub CLI command via MCP server
   * @param {Array<string>} args - gh command arguments
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async executeGhCommand(args = [], options = {}) {
    const {
      cwd = process.cwd(),
      timeout = 30000,
      ignoreErrors = false
    } = options;

    const fullCommand = ['gh', ...args].join(' ');
    
    this.logger.debug(`Executing gh command: ${fullCommand} in ${cwd}`);

    try {
      const result = await this.mcpClient.callTool('run_terminal_cmd', {
        command: fullCommand,
        explanation: `Execute GitHub CLI command`,
        is_background: false
      });

      const executionResult = {
        success: true,
        command: fullCommand,
        cwd,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.exitCode || 0,
        timestamp: new Date().toISOString()
      };

      if (!ignoreErrors && (result.exitCode !== 0 || result.error)) {
        throw new Error(`GitHub CLI command failed: ${result.stderr || result.error || 'Unknown error'}`);
      }

      this.logger.debug(`GitHub CLI command succeeded: ${args.join(' ')}`);
      return executionResult;

    } catch (error) {
      this.logger.error(`GitHub CLI command failed: ${fullCommand}`, error.message);
      
      const errorResult = {
        success: false,
        command: fullCommand,
        cwd,
        stdout: '',
        stderr: error.message,
        exitCode: 1,
        error: error.message,
        timestamp: new Date().toISOString()
      };

      if (!ignoreErrors) {
        throw error;
      }

      return errorResult;
    }
  }

  /**
   * Pushes a specific branch to origin
   * @param {string} projectPath - Path to the project directory
   * @param {string} branchName - Name of the branch to push
   * @param {Object} options - Push options
   * @param {boolean} options.force - Force push
   * @param {boolean} options.setUpstream - Set upstream tracking
   * @param {string} options.remote - Remote name (default: 'origin')
   * @returns {Promise<Object>} Push result
   */
  async pushBranch(projectPath, branchName, options = {}) {
    const {
      force = false,
      setUpstream = false,
      remote = 'origin'
    } = options;

    this.logger.info(`Pushing branch ${branchName} to ${remote}`);

    try {
      // Build push arguments
      const pushArgs = ['push'];
      
      if (setUpstream) {
        pushArgs.push('--set-upstream');
      }
      
      if (force) {
        pushArgs.push('--force-with-lease');
      }
      
      pushArgs.push(remote, branchName);

      // Execute push command
      const result = await this.executeGitCommand('push', pushArgs.slice(1), {
        cwd: projectPath,
        timeout: 60000 // 1 minute timeout for push operations
      });

      // Parse push result
      const pushResult = {
        success: result.success,
        branchName,
        remote,
        pushed: result.success,
        commitsPushed: this.extractCommitCount(result.stderr),
        upToDate: result.stderr.includes('up-to-date'),
        newBranch: result.stderr.includes('new branch'),
        fastForward: !result.stderr.includes('non-fast-forward'),
        timestamp: result.timestamp,
        details: {
          stdout: result.stdout,
          stderr: result.stderr
        }
      };

      if (result.success) {
        this.logger.info(`Successfully pushed ${branchName} to ${remote}`);
      }

      return pushResult;

    } catch (error) {
      this.logger.error(`Failed to push branch ${branchName}:`, error.message);
      
      return {
        success: false,
        branchName,
        remote,
        pushed: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Pushes multiple branches to origin
   * @param {string} projectPath - Path to the project directory
   * @param {Array<string>} branchNames - Array of branch names to push
   * @param {Object} options - Push options
   * @returns {Promise<Object>} Batch push results
   */
  async pushAllBranches(projectPath, branchNames, options = {}) {
    this.logger.info(`Pushing ${branchNames.length} branches: ${branchNames.join(', ')}`);

    const results = {
      success: true,
      totalBranches: branchNames.length,
      successfulPushes: 0,
      failedPushes: 0,
      branches: [],
      timestamp: new Date().toISOString()
    };

    // Push branches sequentially to avoid conflicts
    for (const branchName of branchNames) {
      try {
        const branchResult = await this.pushBranch(projectPath, branchName, options);
        results.branches.push(branchResult);
        
        if (branchResult.success) {
          results.successfulPushes++;
        } else {
          results.failedPushes++;
          results.success = false;
        }

      } catch (error) {
        this.logger.error(`Failed to push branch ${branchName}:`, error.message);
        
        results.branches.push({
          success: false,
          branchName,
          pushed: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        results.failedPushes++;
        results.success = false;
      }
    }

    this.logger.info(`Batch push completed: ${results.successfulPushes}/${results.totalBranches} successful`);
    return results;
  }

  /**
   * Checks if a branch exists on remote and gets its status
   * @param {string} projectPath - Path to the project directory
   * @param {string} branchName - Name of the branch to check
   * @param {string} remote - Remote name (default: 'origin')
   * @returns {Promise<Object>} Remote status
   */
  async getRemoteStatus(projectPath, branchName, remote = 'origin') {
    this.logger.debug(`Checking remote status for branch ${branchName} on ${remote}`);

    try {
      // First, fetch latest remote references
      await this.executeGitCommand('fetch', [remote], {
        cwd: projectPath,
        ignoreErrors: true
      });

      // Check if remote branch exists
      const remoteBranchCheck = await this.executeGitCommand('ls-remote', ['--heads', remote, branchName], {
        cwd: projectPath,
        ignoreErrors: true
      });

      const remoteBranchExists = remoteBranchCheck.success && remoteBranchCheck.stdout.includes(branchName);

      // Get local branch hash
      const localHashResult = await this.executeGitCommand('rev-parse', [branchName], {
        cwd: projectPath,
        ignoreErrors: true
      });

      const localHash = localHashResult.success ? localHashResult.stdout.trim() : null;

      let remoteHash = null;
      let ahead = 0;
      let behind = 0;

      if (remoteBranchExists) {
        // Get remote branch hash
        const remoteHashResult = await this.executeGitCommand('rev-parse', [`${remote}/${branchName}`], {
          cwd: projectPath,
          ignoreErrors: true
        });

        remoteHash = remoteHashResult.success ? remoteHashResult.stdout.trim() : null;

        // Compare local and remote
        if (localHash && remoteHash) {
          const compareResult = await this.executeGitCommand('rev-list', ['--left-right', '--count', `${remote}/${branchName}...${branchName}`], {
            cwd: projectPath,
            ignoreErrors: true
          });

          if (compareResult.success) {
            const [behindCount, aheadCount] = compareResult.stdout.trim().split('\t');
            behind = parseInt(behindCount) || 0;
            ahead = parseInt(aheadCount) || 0;
          }
        }
      }

      const status = {
        branchName,
        remote,
        exists: remoteBranchExists,
        localHash,
        remoteHash,
        inSync: localHash === remoteHash,
        ahead,
        behind,
        needsPush: ahead > 0,
        needsPull: behind > 0,
        timestamp: new Date().toISOString()
      };

      this.logger.debug(`Remote status for ${branchName}: exists=${remoteBranchExists}, ahead=${ahead}, behind=${behind}`);
      return status;

    } catch (error) {
      this.logger.error(`Failed to get remote status for ${branchName}:`, error.message);
      
      return {
        branchName,
        remote,
        exists: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Creates a new GitHub repository using gh CLI
   * @param {string} projectPath - Path to the project directory
   * @param {string} repoName - Name of the repository to create
   * @param {Object} options - Repository options
   * @param {boolean} options.private - Create private repository
   * @param {string} options.description - Repository description
   * @param {boolean} options.addOrigin - Add as origin remote
   * @returns {Promise<Object>} Repository creation result
   */
  async createRemoteRepo(projectPath, repoName, options = {}) {
    const {
      private: isPrivate = true,
      description = '',
      addOrigin = true
    } = options;

    this.logger.info(`Creating GitHub repository: ${repoName}`);

    try {
      // Build gh repo create arguments
      const createArgs = ['repo', 'create', repoName, '--private'];


      if (description) {
        createArgs.push('--description', description);
      }

      // Create repository
      const createResult = await this.executeGhCommand(createArgs, {
        cwd: projectPath
      });

      if (!createResult.success) {
        throw new Error(`Failed to create repository: ${createResult.stderr}`);
      }

      // Extract repository URL from output
      const repoUrl = this.extractRepoUrl(createResult.stdout);

      // Add as origin remote if requested
      let addRemoteResult = null;
      if (addOrigin && repoUrl) {
        addRemoteResult = await this.executeGitCommand('remote', ['add', 'origin', repoUrl], {
          cwd: projectPath,
          ignoreErrors: true
        });
      }

      const result = {
        success: true,
        repoName,
        repoUrl,
        private: isPrivate,
        description,
        originAdded: addRemoteResult?.success || false,
        timestamp: new Date().toISOString(),
        details: {
          createOutput: createResult.stdout,
          addRemoteOutput: addRemoteResult?.stdout
        }
      };

      this.logger.info(`Successfully created repository: ${repoName} at ${repoUrl}`);
      return result;

    } catch (error) {
      this.logger.error(`Failed to create repository ${repoName}:`, error.message);
      
      return {
        success: false,
        repoName,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Sets up initial push for a newly created repository
   * @param {string} projectPath - Path to the project directory
   * @param {string} defaultBranch - Default branch name (e.g., 'main')
   * @returns {Promise<Object>} Initial push result
   */
  async setupInitialPush(projectPath, defaultBranch = 'main') {
    this.logger.info(`Setting up initial push for branch: ${defaultBranch}`);

    try {
      // Check if we're on the correct branch
      const currentBranchResult = await this.executeGitCommand('branch', ['--show-current'], {
        cwd: projectPath
      });

      const currentBranch = currentBranchResult.stdout.trim();
      
      // Switch to default branch if needed
      if (currentBranch !== defaultBranch) {
        await this.executeGitCommand('checkout', ['-b', defaultBranch], {
          cwd: projectPath,
          ignoreErrors: true
        });
      }

      // Push with upstream
      const pushResult = await this.pushBranch(projectPath, defaultBranch, {
        setUpstream: true
      });

      return {
        success: pushResult.success,
        defaultBranch,
        currentBranch,
        switchedBranch: currentBranch !== defaultBranch,
        pushResult,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error(`Failed to setup initial push:`, error.message);
      
      return {
        success: false,
        defaultBranch,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Utility method to extract commit count from git push stderr
   * @private
   */
  extractCommitCount(stderr) {
    const match = stderr.match(/(\d+) commit/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * Utility method to extract repository URL from gh output
   * @private
   */
  extractRepoUrl(stdout) {
    // Look for HTTPS URL pattern
    const httpsMatch = stdout.match(/https:\/\/github\.com\/[^\s]+/);
    if (httpsMatch) {
      return httpsMatch[0];
    }
    
    // Look for SSH URL pattern
    const sshMatch = stdout.match(/git@github\.com:[^\s]+/);
    return sshMatch ? sshMatch[0] : null;
  }

  /**
   * Validates git and gh CLI availability
   * @returns {Promise<Object>} Validation result
   */
  async validateTools() {
    this.logger.info('Validating git and gh CLI availability...');

    const results = {
      git: { available: false, version: null },
      gh: { available: false, version: null },
      allAvailable: false
    };

    try {
      // Check git
      const gitVersion = await this.executeGitCommand('--version', [], { ignoreErrors: true });
      if (gitVersion.success) {
        results.git.available = true;
        results.git.version = gitVersion.stdout.trim();
      }

      // Check gh CLI
      const ghVersion = await this.executeGhCommand(['--version'], { ignoreErrors: true });
      if (ghVersion.success) {
        results.gh.available = true;
        results.gh.version = ghVersion.stdout.trim();
      }

      results.allAvailable = results.git.available && results.gh.available;

      this.logger.info(`Tool validation: git=${results.git.available}, gh=${results.gh.available}`);
      return results;

    } catch (error) {
      this.logger.error('Tool validation failed:', error.message);
      return results;
    }
  }
}

/**
 * Factory function to create a GitExecutor instance
 * @param {Object} mcpClient - MCP client instance
 * @returns {GitExecutor} GitExecutor instance
 */
export function createGitExecutor(mcpClient) {
  return new GitExecutor(mcpClient);
}

export default GitExecutor; 