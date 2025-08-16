import { Checkpoint, ProjectSnapshot } from '../types/Checkpoint';
import { Project } from '../components/LlmChat/context/types';

// Local storage key for checkpoints
const CHECKPOINTS_STORAGE_KEY = 'kibitz_checkpoints';

/**
 * Generates a random ID for a checkpoint
 */
const generateCheckpointId = () => Math.random().toString(36).substring(7);

/**
 * Creates a git commit and returns the commit hash
 * @param projectPath Path to the git repository
 * @param message Commit message
 */
export const createGitCommit = async (): Promise<string | null> => {
  try {
    // This will be implemented to use shell commands via MCP
    // For now, return a placeholder hash
    return null;
  } catch (error) {
    console.error('Failed to create git commit:', error);
    return null;
  }
};

/**
 * Creates a snapshot of the current project state
 * @param project Project to snapshot
 */
export const createProjectSnapshot = (project: Project): ProjectSnapshot => {
  return {
    project: JSON.parse(JSON.stringify(project)), // Deep clone
  };
};

/**
 * Creates a new checkpoint for a project
 * @param projectId Project ID
 * @param project Project data
 * @param description Description of the checkpoint
 * @param tags Optional tags for the checkpoint
 */
export const createCheckpoint = async (
  projectId: string,
  project: Project,
  description: string,
  tags: string[] = []
): Promise<Checkpoint> => {
  // Create snapshot
  const snapshot = createProjectSnapshot(project);
  
  // Create checkpoint
  const checkpoint: Checkpoint = {
    id: generateCheckpointId(),
    projectId,
    timestamp: new Date(),
    description,
    snapshotData: snapshot,
    tags,
  };
  
  // Save checkpoint
  await saveCheckpoint(checkpoint);
  
  return checkpoint;
};

/**
 * Saves a checkpoint to storage
 * @param checkpoint Checkpoint to save
 */
export const saveCheckpoint = async (checkpoint: Checkpoint): Promise<void> => {
  // Get existing checkpoints
  const existingCheckpoints = await getCheckpoints(checkpoint.projectId);
  
  // Add new checkpoint
  existingCheckpoints.push(checkpoint);
  
  // Save to local storage
  try {
    localStorage.setItem(
      `${CHECKPOINTS_STORAGE_KEY}_${checkpoint.projectId}`,
      JSON.stringify(existingCheckpoints)
    );
  } catch (error) {
    console.error('Failed to save checkpoint:', error);
    throw error;
  }
};

/**
 * Gets all checkpoints for a project
 * @param projectId Project ID
 */
export const getCheckpoints = async (projectId: string): Promise<Checkpoint[]> => {
  try {
    const checkpointsJson = localStorage.getItem(`${CHECKPOINTS_STORAGE_KEY}_${projectId}`);
    if (!checkpointsJson) {
      return [];
    }
    return JSON.parse(checkpointsJson);
  } catch (error) {
    console.error('Failed to retrieve checkpoints:', error);
    return [];
  }
};

/**
 * Gets a specific checkpoint by ID
 * @param projectId Project ID
 * @param checkpointId Checkpoint ID
 */
export const getCheckpointById = async (
  projectId: string, 
  checkpointId: string
): Promise<Checkpoint | null> => {
  const checkpoints = await getCheckpoints(projectId);
  return checkpoints.find(cp => cp.id === checkpointId) || null;
};

/**
 * Deletes a checkpoint
 * @param projectId Project ID
 * @param checkpointId Checkpoint ID
 */
export const deleteCheckpoint = async (
  projectId: string, 
  checkpointId: string
): Promise<void> => {
  // Get existing checkpoints
  const checkpoints = await getCheckpoints(projectId);
  
  // Filter out the checkpoint to delete
  const updatedCheckpoints = checkpoints.filter(cp => cp.id !== checkpointId);
  
  // Save updated list
  localStorage.setItem(
    `${CHECKPOINTS_STORAGE_KEY}_${projectId}`,
    JSON.stringify(updatedCheckpoints)
  );
};

/**
 * Gets the short hash (first 7 characters) from a full commit hash
 * @param fullHash Full commit hash
 */
export const getShortHash = (fullHash: string): string => {
  if (!fullHash || typeof fullHash !== 'string') {
    console.error("Invalid commit hash:", fullHash);
    return "invalid";
  }
  
  try {
    return fullHash.substring(0, 7);
  } catch (error) {
    console.error("Error getting short hash:", error);
    return "error";
  }
};

/**
 * Creates an automatic checkpoint after a significant operation
 * @param projectId Project ID
 * @param project Project data
 * @param operation Description of the operation
 */
export const createAutoCheckpoint = async (
  projectId: string,
  project: Project,
  operation: string
): Promise<Checkpoint> => {
  const description = `Auto checkpoint: ${operation}`;
  return createCheckpoint(projectId, project, description, ['auto']);
}; 