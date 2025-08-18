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

/**
 * Branch Naming Utilities
 * 
 * Utilities for formatting and parsing branch names to make them more readable
 */

/**
 * Format branch names to be more readable in the UI
 */
export const formatBranchName = (branchName: string): string => {
  if (!branchName) return 'Unknown branch';
  
  // Handle auto/ branch format: auto/YYYYMMDD-HHMM
  if (branchName.startsWith('auto/')) {
    const datePart = branchName.replace('auto/', '');
    const match = datePart.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/);
    if (match) {
      const [, year, month, day, hours, minutes] = match;
      return `Auto (${month}/${day}/${year} ${hours}:${minutes})`;
    }
  }
  
  // Handle checkpoint/ branch format: checkpoint/YYYYMMDD-HHMM
  if (branchName.startsWith('checkpoint/')) {
    const datePart = branchName.replace('checkpoint/', '');
    const match = datePart.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/);
    if (match) {
      const [, year, month, day, hours, minutes] = match;
      return `Checkpoint (${month}/${day}/${year} ${hours}:${minutes})`;
    }
  }
  
  // Handle other branch formats with date patterns
  if (branchName.includes('/')) {
    const parts = branchName.split('/');
    if (parts.length >= 2) {
      const type = parts[0];
      const datePart = parts[1];
      
      // Try to parse date from various formats
      const dateMatch = datePart.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})/);
      if (dateMatch) {
        const [, year, month, day, hours, minutes] = dateMatch;
        return `${type.charAt(0).toUpperCase() + type.slice(1)} (${month}/${day}/${year} ${hours}:${minutes})`;
      }
    }
  }
  
  // Return original name if no special formatting needed
  return branchName;
};

/**
 * Get the date from a branch name if it exists
 */
export const getBranchDate = (branchName: string): Date | null => {
  if (!branchName) return null;
  
  // Handle auto/ and checkpoint/ formats: YYYYMMDD-HHMM
  const autoMatch = branchName.match(/(?:auto|checkpoint)\/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/);
  if (autoMatch) {
    const [, year, month, day, hours, minutes] = autoMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
  }
  
  // Handle other formats: type/YYYY-MM-DD-HHMM
  const otherMatch = branchName.match(/\w+\/(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})/);
  if (otherMatch) {
    const [, year, month, day, hours, minutes] = otherMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
  }
  
  return null;
};

/**
 * Check if a branch name represents an auto-generated branch
 */
export const isAutoGeneratedBranch = (branchName: string): boolean => {
  if (!branchName) return false;
  
  return branchName.startsWith('auto/') || 
         branchName.startsWith('checkpoint/') || 
         branchName.startsWith('backup/') ||
         branchName.includes('auto-') ||
         branchName.includes('checkpoint-');
};

/**
 * Get the branch type from the branch name
 */
export const getBranchType = (branchName: string): 'auto' | 'checkpoint' | 'feature' | 'bugfix' | 'main' | 'other' => {
  if (!branchName) return 'other';
  
  if (branchName.startsWith('auto/')) return 'auto';
  if (branchName.startsWith('checkpoint/')) return 'checkpoint';
  if (branchName.startsWith('feature/')) return 'feature';
  if (branchName.startsWith('bugfix/')) return 'bugfix';
  if (branchName === 'main' || branchName === 'master') return 'main';
  
  return 'other';
};

// Export singleton instance
export const branchNaming = new BranchNamingStrategy(); 