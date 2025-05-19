import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

interface CheckpointResult {
  success: boolean;
  hash?: string;
  error?: string;
  output?: string;
}

interface Checkpoint {
  hash: string;
  date: string;
  message: string;
}

interface CheckpointListResult {
  success: boolean;
  checkpoints?: Checkpoint[];
  error?: string;
}

/**
 * Create a checkpoint with the given message
 * @param message - Message to include with the checkpoint
 */
export async function createCheckpoint(message: string = ''): Promise<CheckpointResult> {
  try {
    const { stdout, stderr } = await execPromise(`npm run checkpoint "${message}"`);
    
    // Extract hash from output
    const hashMatch = stdout.match(/Checkpoint ([a-f0-9]+) created/);
    const hash = hashMatch ? hashMatch[1] : undefined;
    
    if (stderr && !stdout.includes('✅')) {
      return {
        success: false,
        error: stderr
      };
    }
    
    return {
      success: true,
      hash,
      output: stdout
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Roll back to a specific checkpoint hash
 * @param hash - The checkpoint hash to roll back to
 */
export async function rollbackToCheckpoint(hash: string): Promise<CheckpointResult> {
  if (!hash || typeof hash !== 'string' || hash.length < 4) {
    return {
      success: false,
      error: 'Invalid checkpoint hash provided'
    };
  }
  
  try {
    const { stdout, stderr } = await execPromise(`npm run rollback ${hash}`);
    
    if (stderr && !stdout.includes('✅')) {
      return {
        success: false,
        error: stderr
      };
    }
    
    return {
      success: true,
      output: stdout
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * List available checkpoints
 * @param count - Number of checkpoints to list
 */
export async function listCheckpoints(count: number = 10): Promise<CheckpointListResult> {
  try {
    // First get raw git log to parse checkpoints
    const { stdout, stderr } = await execPromise(
      `git log --pretty=format:"%h | %ad | %s" --date=short -n ${count}`
    );
    
    if (stderr && stderr.includes('Error')) {
      return {
        success: false,
        error: stderr
      };
    }
    
    // Parse output to extract checkpoint information
    const checkpoints: Checkpoint[] = [];
    const lines = stdout.split('\n');
    
    for (const line of lines) {
      const parts = line.split(' | ');
      if (parts.length >= 3) {
        const hash = parts[0];
        const date = parts[1];
        const message = parts.slice(2).join(' | ');
        
        // Only include lines that are checkpoints or backups
        if (message.includes('Checkpoint') || message.includes('Backup')) {
          checkpoints.push({ hash, date, message });
        }
      }
    }
    
    return {
      success: true,
      checkpoints
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Create an automatic checkpoint after a successful build or task
 * @param taskName - Name of the completed task
 */
export async function autoCheckpointAfterTask(taskName: string): Promise<CheckpointResult> {
  return createCheckpoint(`Auto checkpoint after ${taskName}`);
}

/**
 * Create a checkpoint and push to a new branch
 * @param message - Checkpoint message
 * @param branchName - Name of the new branch
 */
export async function checkpointToBranch(message: string, branchName: string): Promise<CheckpointResult> {
  try {
    // Create new branch
    await execPromise(`git checkout -b ${branchName}`);
    
    // Create checkpoint on the new branch
    const result = await createCheckpoint(message);
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
} 