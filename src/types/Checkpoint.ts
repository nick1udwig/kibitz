import { Project } from '../components/LlmChat/context/types';

/**
 * Represents a checkpoint of a project's state at a point in time
 */
export interface Checkpoint {
  id: string;
  projectId: string;
  timestamp: Date;
  description: string;
  commitHash?: string;  // Git commit hash if available
  snapshotData: ProjectSnapshot;
  tags: string[];       // For categorizing or marking important checkpoints
}

/**
 * Contains the serialized project state for a checkpoint
 */
export interface ProjectSnapshot {
  project: Project;
  files?: ProjectFile[];  // Optional array of relevant files
}

/**
 * Represents a file in the project at the time of the checkpoint
 */
export interface ProjectFile {
  path: string;
  content: string;
  lastModified: Date;
}

/**
 * Checkpoint system configuration
 */
export interface CheckpointConfig {
  autoCheckpointEnabled: boolean;
  checkpointFrequency: 'onCommit' | 'onSave' | 'manual';
  maxCheckpoints: number;
  gitIntegrationEnabled: boolean;
} 