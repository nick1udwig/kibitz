/**
 * 🌿 Branch Naming Strategy - Auto-Branch Feature
 * 
 * Provides timestamp-based branch naming for automatic branch creation
 * before test/build runs, following industry best practices.
 */

export interface BranchNamingOptions {
  prefix?: string;
  context?: string;
  includeSeconds?: boolean;
  separator?: string;
}

export class BranchNamingStrategy {
  private defaultPrefix = 'auto';
  private defaultSeparator = '/';

  /**
   * Generate timestamp in YYYY-MM-DD-HH-MM-SS format
   */
  generateTimestamp(includeSeconds: boolean = true): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    
    let timestamp = `${year}-${month}-${day}-${hour}-${minute}`;
    
    if (includeSeconds) {
      const second = String(now.getSeconds()).padStart(2, '0');
      timestamp += `-${second}`;
    }
    
    return timestamp;
  }

  /**
   * Generate complete branch name with prefix and context
   */
  generateBranchName(options: BranchNamingOptions = {}): string {
    const {
      prefix = this.defaultPrefix,
      context,
      includeSeconds = true,
      separator = this.defaultSeparator
    } = options;

    const timestamp = this.generateTimestamp(includeSeconds);
    
    if (context) {
      return `${prefix}${separator}${context}-${timestamp}`;
    }
    
    return `${prefix}${separator}${timestamp}`;
  }

  /**
   * Generate branch name for specific contexts
   */
  generateTestBranch(customPrefix?: string): string {
    return this.generateBranchName({
      prefix: customPrefix || this.defaultPrefix,
      context: 'test'
    });
  }

  generateBuildBranch(customPrefix?: string): string {
    return this.generateBranchName({
      prefix: customPrefix || this.defaultPrefix,
      context: 'build'
    });
  }

  generateExperimentBranch(customPrefix?: string): string {
    return this.generateBranchName({
      prefix: customPrefix || this.defaultPrefix,
      context: 'experiment'
    });
  }

  /**
   * Parse timestamp from branch name
   */
  parseTimestamp(branchName: string): Date | null {
    const timestampRegex = /(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}(?:-\d{2})?)/;
    const match = branchName.match(timestampRegex);
    
    if (!match) return null;
    
    const timestampStr = match[1];
    const parts = timestampStr.split('-');
    
    if (parts.length >= 5) {
      const [year, month, day, hour, minute, second = '00'] = parts;
      return new Date(
        parseInt(year),
        parseInt(month) - 1, // Month is 0-indexed
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      );
    }
    
    return null;
  }

  /**
   * Check if branch name follows auto-branch pattern
   */
  isAutoBranch(branchName: string, prefix: string = this.defaultPrefix): boolean {
    const pattern = new RegExp(`^${prefix}${this.defaultSeparator}.*\\d{4}-\\d{2}-\\d{2}-\\d{2}-\\d{2}`, 'i');
    return pattern.test(branchName);
  }

  /**
   * Extract context from branch name
   */
  extractContext(branchName: string): string | null {
    const parts = branchName.split(this.defaultSeparator);
    if (parts.length >= 2) {
      const contextPart = parts[1];
      const contextMatch = contextPart.match(/^(test|build|experiment)/);
      return contextMatch ? contextMatch[1] : null;
    }
    return null;
  }

  /**
   * Generate safe branch name (sanitize for git)
   */
  sanitizeBranchName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\-_\/]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

// Export singleton instance
export const branchNaming = new BranchNamingStrategy(); 