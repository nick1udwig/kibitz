// import path from 'path';

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

  async executeGitCommand(command, args = [], options = {}) {
    const { cwd = process.cwd(), ignoreErrors = false } = options;
    const fullCommand = ['git', command, ...args].join(' ');
    this.logger.debug(`Executing git command: ${fullCommand} in ${cwd}`);
    try {
      const result = await this.mcpClient.callTool('run_terminal_cmd', {
        command: fullCommand,
        explanation: `Execute git ${command} command`,
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
        throw new Error(`Git command failed: ${result.stderr || result.error || 'Unknown error'}`);
      }
      this.logger.debug(`Git command succeeded: ${command}`);
      return executionResult;
    } catch (error) {
      this.logger.error(`Git command failed: ${fullCommand}`, error.message);
      const errorResult = { success: false, command: fullCommand, cwd, stdout: '', stderr: error.message, exitCode: 1, error: error.message, timestamp: new Date().toISOString() };
      if (!ignoreErrors) { throw error; }
      return errorResult;
    }
  }

  async executeGhCommand(args = [], options = {}) {
    const { cwd = process.cwd(), ignoreErrors = false } = options;
    const fullCommand = ['gh', ...args].join(' ');
    this.logger.debug(`Executing gh command: ${fullCommand} in ${cwd}`);
    try {
      const result = await this.mcpClient.callTool('run_terminal_cmd', {
        command: fullCommand,
        explanation: `Execute GitHub CLI command`,
        is_background: false
      });
      const executionResult = { success: true, command: fullCommand, cwd, stdout: result.stdout || '', stderr: result.stderr || '', exitCode: result.exitCode || 0, timestamp: new Date().toISOString() };
      if (!ignoreErrors && (result.exitCode !== 0 || result.error)) {
        throw new Error(`GitHub CLI command failed: ${result.stderr || result.error || 'Unknown error'}`);
      }
      this.logger.debug(`GitHub CLI command succeeded: ${args.join(' ')}`);
      return executionResult;
    } catch (error) {
      this.logger.error(`GitHub CLI command failed: ${fullCommand}`, error.message);
      const errorResult = { success: false, command: fullCommand, cwd, stdout: '', stderr: error.message, exitCode: 1, error: error.message, timestamp: new Date().toISOString() };
      if (!ignoreErrors) { throw error; }
      return errorResult;
    }
  }

  async pushBranch(projectPath, branchName, options = {}) {
    const { force = false, setUpstream = false, remote = 'origin' } = options;
    this.logger.info(`Pushing branch ${branchName} to ${remote}`);
    try {
      const pushArgs = ['push'];
      if (setUpstream) pushArgs.push('--set-upstream');
      if (force) pushArgs.push('--force-with-lease');
      pushArgs.push(remote, branchName);
      const result = await this.executeGitCommand('push', pushArgs.slice(1), { cwd: projectPath, timeout: 60000 });
      const pushResult = { success: result.success, branchName, remote, pushed: result.success, commitsPushed: this.extractCommitCount(result.stderr), upToDate: result.stderr.includes('up-to-date'), newBranch: result.stderr.includes('new branch'), fastForward: !result.stderr.includes('non-fast-forward'), timestamp: result.timestamp, details: { stdout: result.stdout, stderr: result.stderr } };
      if (result.success) this.logger.info(`Successfully pushed ${branchName} to ${remote}`);
      return pushResult;
    } catch (error) {
      this.logger.error(`Failed to push branch ${branchName}:`, error.message);
      return { success: false, branchName, remote, pushed: false, error: error.message, timestamp: new Date().toISOString() };
    }
  }

  async pushAllBranches(projectPath, branchNames, options = {}) {
    this.logger.info(`Pushing ${branchNames.length} branches: ${branchNames.join(', ')}`);
    const results = { success: true, totalBranches: branchNames.length, successfulPushes: 0, failedPushes: 0, branches: [], timestamp: new Date().toISOString() };
    for (const branchName of branchNames) {
      try {
        const branchResult = await this.pushBranch(projectPath, branchName, options);
        results.branches.push(branchResult);
        if (branchResult.success) results.successfulPushes++; else { results.failedPushes++; results.success = false; }
      } catch (error) {
        this.logger.error(`Failed to push branch ${branchName}:`, error.message);
        results.branches.push({ success: false, branchName, pushed: false, error: error.message, timestamp: new Date().toISOString() });
        results.failedPushes++; results.success = false;
      }
    }
    this.logger.info(`Batch push completed: ${results.successfulPushes}/${results.totalBranches} successful`);
    return results;
  }

  async getRemoteStatus(projectPath, branchName, remote = 'origin') {
    this.logger.debug(`Checking remote status for branch ${branchName} on ${remote}`);
    try {
      await this.executeGitCommand('fetch', [remote], { cwd: projectPath, ignoreErrors: true });
      const remoteBranchCheck = await this.executeGitCommand('ls-remote', ['--heads', remote, branchName], { cwd: projectPath, ignoreErrors: true });
      const remoteBranchExists = remoteBranchCheck.success && remoteBranchCheck.stdout.includes(branchName);
      const localHashResult = await this.executeGitCommand('rev-parse', [branchName], { cwd: projectPath, ignoreErrors: true });
      const localHash = localHashResult.success ? localHashResult.stdout.trim() : null;
      let remoteHash = null; let ahead = 0; let behind = 0;
      if (remoteBranchExists) {
        const remoteHashResult = await this.executeGitCommand('rev-parse', [`${remote}/${branchName}`], { cwd: projectPath, ignoreErrors: true });
        remoteHash = remoteHashResult.success ? remoteHashResult.stdout.trim() : null;
        if (localHash && remoteHash) {
          const compareResult = await this.executeGitCommand('rev-list', ['--left-right', '--count', `${remote}/${branchName}...${branchName}`], { cwd: projectPath, ignoreErrors: true });
          if (compareResult.success) {
            const [behindCount, aheadCount] = compareResult.stdout.trim().split('\t');
            behind = parseInt(behindCount) || 0; ahead = parseInt(aheadCount) || 0;
          }
        }
      }
      const status = { branchName, remote, exists: remoteBranchExists, localHash, remoteHash, inSync: localHash === remoteHash, ahead, behind, needsPush: ahead > 0, needsPull: behind > 0, timestamp: new Date().toISOString() };
      this.logger.debug(`Remote status for ${branchName}: exists=${remoteBranchExists}, ahead=${ahead}, behind=${behind}`);
      return status;
    } catch (error) {
      this.logger.error(`Failed to get remote status for ${branchName}:`, error.message);
      return { branchName, remote, exists: false, error: error.message, timestamp: new Date().toISOString() };
    }
  }

  async createRemoteRepo(projectPath, repoName, options = {}) {
    const { private: isPrivate = true, description = '', addOrigin = true } = options;
    this.logger.info(`Creating GitHub repository: ${repoName}`);
    try {
      const createArgs = ['repo', 'create', repoName, '--private'];
      if (description) createArgs.push('--description', description);
      const createResult = await this.executeGhCommand(createArgs, { cwd: projectPath });
      if (!createResult.success) { throw new Error(`Failed to create repository: ${createResult.stderr}`); }
      const repoUrl = this.extractRepoUrl(createResult.stdout);
      let addRemoteResult = null;
      if (addOrigin && repoUrl) {
        addRemoteResult = await this.executeGitCommand('remote', ['add', 'origin', repoUrl], { cwd: projectPath, ignoreErrors: true });
      }
      const result = { success: true, repoName, repoUrl, private: isPrivate, description, originAdded: addRemoteResult?.success || false, timestamp: new Date().toISOString(), details: { createOutput: createResult.stdout, addRemoteOutput: addRemoteResult?.stdout } };
      this.logger.info(`Successfully created repository: ${repoName} at ${repoUrl}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to create repository ${repoName}:`, error.message);
      return { success: false, repoName, error: error.message, timestamp: new Date().toISOString() };
    }
  }

  async setupInitialPush(projectPath, defaultBranch = 'main') {
    this.logger.info(`Setting up initial push for branch: ${defaultBranch}`);
    try {
      const currentBranchResult = await this.executeGitCommand('branch', ['--show-current'], { cwd: projectPath });
      const currentBranch = currentBranchResult.stdout.trim();
      if (currentBranch !== defaultBranch) {
        await this.executeGitCommand('checkout', ['-b', defaultBranch], { cwd: projectPath, ignoreErrors: true });
      }
      const pushResult = await this.pushBranch(projectPath, defaultBranch, { setUpstream: true });
      return { success: pushResult.success, defaultBranch, currentBranch, switchedBranch: currentBranch !== defaultBranch, pushResult, timestamp: new Date().toISOString() };
    } catch (error) {
      this.logger.error(`Failed to setup initial push:`, error.message);
      return { success: false, defaultBranch, error: error.message, timestamp: new Date().toISOString() };
    }
  }

  extractCommitCount(stderr) { const match = stderr.match(/(\d+) commit/); return match ? parseInt(match[1]) : 0; }
  extractRepoUrl(stdout) { const httpsMatch = stdout.match(/https:\/\/github\.com\/[^\s]+/); if (httpsMatch) return httpsMatch[0]; const sshMatch = stdout.match(/git@github\.com:[^\s]+/); return sshMatch ? sshMatch[0] : null; }

  async validateTools() {
    this.logger.info('Validating git and gh CLI availability...');
    const results = { git: { available: false, version: null }, gh: { available: false, version: null }, allAvailable: false };
    try {
      const gitVersion = await this.executeGitCommand('--version', [], { ignoreErrors: true });
      if (gitVersion.success) { results.git.available = true; results.git.version = gitVersion.stdout.trim(); }
      const ghVersion = await this.executeGhCommand(['--version'], { ignoreErrors: true });
      if (ghVersion.success) { results.gh.available = true; results.gh.version = ghVersion.stdout.trim(); }
      results.allAvailable = results.git.available && results.gh.available;
      this.logger.info(`Tool validation: git=${results.git.available}, gh=${results.gh.available}`);
      return results;
    } catch (error) {
      this.logger.error('Tool validation failed:', error.message);
      return results;
    }
  }
}

export function createGitExecutor(mcpClient) { return new GitExecutor(mcpClient); }
export default GitExecutor;


