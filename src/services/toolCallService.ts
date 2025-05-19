import { autoCheckpointAfterTask, checkpointToBranch } from './checkpointService';

interface ToolAction {
  command: string;
  [key: string]: any;
}

interface ToolResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Process a tool action and create checkpoints after successful completion
 * @param actionJson - The tool action JSON
 */
export async function processToolAction(actionJson: ToolAction): Promise<ToolResult> {
  try {
    // Extract command and arguments
    const { command, ...args } = actionJson;
    
    // Execute the command based on its type
    let result: ToolResult;
    
    if (command.startsWith('npm ') || command.startsWith('yarn ') || command.startsWith('pnpm ')) {
      // Handle package manager commands
      result = await executePackageManagerCommand(command);
    } else if (command.startsWith('git ')) {
      // Handle git commands
      result = await executeGitCommand(command);
    } else if (command.startsWith('chmod ')) {
      // Handle chmod commands
      result = await executeChmodCommand(command);
    } else {
      // Generic command execution
      result = await executeGenericCommand(command);
    }
    
    // If command was successful, create a checkpoint
    if (result.success) {
      const taskName = getTaskNameFromCommand(command);
      const checkpointResult = await autoCheckpointAfterTask(taskName);
      
      // If this was a build command that succeeded, push to a new branch
      if (isBuildCommand(command) && result.success) {
        const branchName = generateBranchName(taskName);
        await checkpointToBranch(`Build success: ${taskName}`, branchName);
        result.message += `. Pushed to branch '${branchName}'`;
      }
    }
    
    return result;
  } catch (error) {
    return {
      success: false,
      message: `Error executing tool action: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Execute a package manager command (npm, yarn, pnpm)
 */
async function executePackageManagerCommand(command: string): Promise<ToolResult> {
  // Implementation would execute the package manager command
  // For this example, we'll just simulate success
  return {
    success: true,
    message: `Executed package manager command: ${command}`
  };
}

/**
 * Execute a git command
 */
async function executeGitCommand(command: string): Promise<ToolResult> {
  // Implementation would execute the git command
  // For this example, we'll just simulate success
  return {
    success: true,
    message: `Executed git command: ${command}`
  };
}

/**
 * Execute a chmod command
 */
async function executeChmodCommand(command: string): Promise<ToolResult> {
  // Implementation would execute the chmod command
  // For this example, we'll just simulate success
  const fileName = command.split(' ').pop();
  return {
    success: true,
    message: `Made ${fileName} executable with command: ${command}`
  };
}

/**
 * Execute a generic command
 */
async function executeGenericCommand(command: string): Promise<ToolResult> {
  // Implementation would execute any other command
  // For this example, we'll just simulate success
  return {
    success: true,
    message: `Executed command: ${command}`
  };
}

/**
 * Extract a human-readable task name from a command
 */
function getTaskNameFromCommand(command: string): string {
  // Extract a meaningful name from the command
  const parts = command.split(' ');
  
  if (command.includes('build')) {
    return 'build';
  } else if (command.includes('test')) {
    return 'tests';
  } else if (command.includes('lint')) {
    return 'linting';
  } else if (command.includes('chmod')) {
    return `chmod ${parts[parts.length - 1]}`;
  } else {
    return parts[0];
  }
}

/**
 * Check if a command is a build command
 */
function isBuildCommand(command: string): boolean {
  return command.includes('build') || 
         command.includes('compile') ||
         command.includes('webpack') ||
         command.includes('rollup');
}

/**
 * Generate a branch name for a successful build
 */
function generateBranchName(taskName: string): string {
  const timestamp = new Date().toISOString()
    .replace(/:/g, '-')
    .replace(/\..+/, '');
  
  return `build/${taskName}-${timestamp}`;
} 