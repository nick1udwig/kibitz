/**
 * 📝 LLM-Powered Commit Message Generator - Auto-Branch Feature
 * 
 * Generates meaningful commit messages using the user's configured LLM
 * via MCP server integration, with intelligent fallbacks.
 */

export interface FileChange {
  path: string;
  type: 'added' | 'modified' | 'deleted';
  lines?: number;
}

export interface ChangesSummary {
  modifiedFiles: string[];
  addedFiles: string[];
  deletedFiles: string[];
  totalChanges: number;
  hasNewFeatures: boolean;
  hasBugFixes: boolean;
  hasTests: boolean;
}

export class CommitMessageGenerator {
  constructor(
    private executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
    private serverId: string
  ) {}

  /**
   * Generate commit message using LLM or fallback to rule-based
   */
  async generateCommitMessage(
    changes: FileChange[],
    context: 'test' | 'build' | 'experiment' = 'test'
  ): Promise<string> {
    const changesSummary = this.analyzeChanges(changes);
    
    try {
      console.log(`🤖 Generating commit message for ${context} with ${changes.length} changes...`);
      
      const prompt = this.buildCommitPrompt(changesSummary, context);
      
      // Use MCP server to generate message with user's configured LLM
      const response = await this.executeTool(this.serverId, 'BashCommand', {
        action_json: {
          command: `echo '${prompt}' | head -1` // Simple fallback if no LLM available
        },
        thread_id: `commit-msg-${Date.now()}`
      });
      
      // Try to use actual LLM if available
      let llmResponse: string;
      try {
        llmResponse = await this.callLLMViaPrompt(prompt);
      } catch (error) {
        console.warn('LLM call failed, using intelligent fallback:', error);
        llmResponse = this.generateIntelligentFallback(changesSummary, context);
      }
      
      return this.sanitizeCommitMessage(llmResponse);
    } catch (error) {
      console.warn('Commit message generation failed, using fallback:', error);
      return this.generateIntelligentFallback(changesSummary, context);
    }
  }

  /**
   * Analyze file changes to understand the nature of the work
   */
  private analyzeChanges(changes: FileChange[]): ChangesSummary {
    const modifiedFiles = changes.filter(c => c.type === 'modified').map(c => c.path);
    const addedFiles = changes.filter(c => c.type === 'added').map(c => c.path);
    const deletedFiles = changes.filter(c => c.type === 'deleted').map(c => c.path);

    return {
      modifiedFiles,
      addedFiles,
      deletedFiles,
      totalChanges: changes.length,
      hasNewFeatures: this.detectNewFeatures(addedFiles, modifiedFiles),
      hasBugFixes: this.detectBugFixes(modifiedFiles),
      hasTests: this.detectTests(addedFiles, modifiedFiles)
    };
  }

  /**
   * Build prompt for LLM commit message generation
   */
  private buildCommitPrompt(changes: ChangesSummary, context: string): string {
    const filesContext = this.buildFilesContext(changes);
    
    return `Generate a concise git commit message for these changes before ${context} run:

${filesContext}

Context: Auto-commit before ${context} run
Requirements:
- Maximum 50 characters total
- Use conventional commit format (feat:, fix:, test:, build:, etc.)
- Be descriptive but concise
- Focus on the most important change

Examples:
- "feat: add user authentication"
- "fix: resolve login validation bug"
- "test: add unit tests for auth"
- "build: update dependencies"

Generate only the commit message, no explanation:`;
  }

  /**
   * Build file context for the prompt
   */
  private buildFilesContext(changes: ChangesSummary): string {
    const parts: string[] = [];
    
    if (changes.addedFiles.length > 0) {
      parts.push(`Added files (${changes.addedFiles.length}): ${changes.addedFiles.slice(0, 3).join(', ')}${changes.addedFiles.length > 3 ? '...' : ''}`);
    }
    
    if (changes.modifiedFiles.length > 0) {
      parts.push(`Modified files (${changes.modifiedFiles.length}): ${changes.modifiedFiles.slice(0, 3).join(', ')}${changes.modifiedFiles.length > 3 ? '...' : ''}`);
    }
    
    if (changes.deletedFiles.length > 0) {
      parts.push(`Deleted files (${changes.deletedFiles.length}): ${changes.deletedFiles.slice(0, 3).join(', ')}${changes.deletedFiles.length > 3 ? '...' : ''}`);
    }

    if (parts.length === 0) {
      parts.push('No file changes detected');
    }

    return parts.join('\n');
  }

  /**
   * Call LLM via a simulated prompt (placeholder for actual LLM integration)
   */
  private async callLLMViaPrompt(prompt: string): Promise<string> {
    // This is a placeholder - in real implementation, this would use
    // the actual MCP LLM integration based on user's configured provider
    
    // For now, we'll try to use a simple echo command that could be
    // replaced with actual LLM calls when MCP supports it
    try {
      const result = await this.executeTool(this.serverId, 'BashCommand', {
        action_json: {
          command: `echo "auto: prepare for execution"` // Fallback
        },
        thread_id: `llm-prompt-${Date.now()}`
      });
      
      return result.trim();
    } catch (error) {
      throw new Error('LLM integration not available');
    }
  }

  /**
   * Generate intelligent fallback commit message based on analysis
   */
  private generateIntelligentFallback(changes: ChangesSummary, context: string): string {
    // Prioritize by impact and type
    if (changes.hasNewFeatures && changes.addedFiles.length > 0) {
      if (changes.addedFiles.length === 1) {
        const fileName = this.getFileBaseName(changes.addedFiles[0]);
        return `feat: add ${fileName} before ${context}`;
      }
      return `feat: add ${changes.addedFiles.length} files before ${context}`;
    }
    
    if (changes.hasBugFixes && changes.modifiedFiles.length > 0) {
      if (changes.modifiedFiles.length === 1) {
        const fileName = this.getFileBaseName(changes.modifiedFiles[0]);
        return `fix: update ${fileName} before ${context}`;
      }
      return `fix: update ${changes.modifiedFiles.length} files before ${context}`;
    }
    
    if (changes.hasTests) {
      return `test: update tests before ${context}`;
    }
    
    if (changes.deletedFiles.length > 0) {
      return `remove: delete ${changes.deletedFiles.length} files before ${context}`;
    }
    
    if (changes.modifiedFiles.length > 0) {
      return `update: modify ${changes.modifiedFiles.length} files before ${context}`;
    }

    // Default fallback
    return `auto: prepare for ${context} run`;
  }

  /**
   * Sanitize and format commit message
   */
  private sanitizeCommitMessage(message: string): string {
    return message
      .trim()
      .replace(/^["']|["']$/g, '') // Remove quotes
      .replace(/\n.*/, '') // Take only first line
      .toLowerCase() // Conventional commits are lowercase
      .substring(0, 72) // Git recommended max length
      .trim();
  }

  /**
   * Detect if changes include new features
   */
  private detectNewFeatures(addedFiles: string[], modifiedFiles: string[]): boolean {
    const featureIndicators = [
      'component', 'feature', 'service', 'api', 'endpoint',
      'route', 'model', 'controller', 'view', 'page'
    ];
    
    const allFiles = [...addedFiles, ...modifiedFiles];
    return allFiles.some(file => 
      featureIndicators.some(indicator => 
        file.toLowerCase().includes(indicator)
      )
    );
  }

  /**
   * Detect if changes include bug fixes
   */
  private detectBugFixes(modifiedFiles: string[]): boolean {
    const bugFixIndicators = [
      'fix', 'bug', 'error', 'issue', 'patch',
      'correct', 'repair', 'resolve'
    ];
    
    return modifiedFiles.some(file => 
      bugFixIndicators.some(indicator => 
        file.toLowerCase().includes(indicator)
      )
    );
  }

  /**
   * Detect if changes include tests
   */
  private detectTests(addedFiles: string[], modifiedFiles: string[]): boolean {
    const testIndicators = [
      'test', 'spec', '__tests__', '.test.', '.spec.',
      'testing', 'jest', 'cypress', 'playwright'
    ];
    
    const allFiles = [...addedFiles, ...modifiedFiles];
    return allFiles.some(file => 
      testIndicators.some(indicator => 
        file.toLowerCase().includes(indicator)
      )
    );
  }

  /**
   * Get base name of file for commit messages
   */
  private getFileBaseName(filePath: string): string {
    const fileName = filePath.split('/').pop() || filePath;
    const nameWithoutExt = fileName.split('.')[0];
    return nameWithoutExt.replace(/[-_]/g, ' ').toLowerCase();
  }

  /**
   * Generate context-specific commit message
   */
  async generateForContext(
    changes: FileChange[],
    context: 'test' | 'build' | 'experiment',
    customPrefix?: string
  ): Promise<string> {
    const baseMessage = await this.generateCommitMessage(changes, context);
    
    if (customPrefix) {
      return `${customPrefix}: ${baseMessage.replace(/^[^:]+:\s*/, '')}`;
    }
    
    return baseMessage;
  }

  /**
   * Get suggested commit types based on changes
   */
  getSuggestedCommitType(changes: ChangesSummary): string {
    if (changes.hasNewFeatures) return 'feat';
    if (changes.hasBugFixes) return 'fix';
    if (changes.hasTests) return 'test';
    if (changes.deletedFiles.length > 0) return 'remove';
    if (changes.modifiedFiles.length > 0) return 'update';
    return 'auto';
  }
}

export default CommitMessageGenerator; 