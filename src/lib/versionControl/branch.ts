/**
 * Version Control – Branch Facade
 *
 * Centralizes branch-related operations behind a stable module path:
 *   import { createBranch, listBranches, detectChanges, revertToState, autoCreateBranchIfNeeded, mergeBranch } from '@/lib/versionControl';
 *
 * Implementation is delegated to the existing `branchService` to avoid
 * risky refactors right now. This file provides a single, organized place
 * to import branch APIs without changing current behavior.
 */

export type {
  BranchType,
  BranchInfo,
  ChangeDetectionResult,
  RevertOptions
} from '../branchService';

export {
  createProjectJSONFiles,
  getLanguageStats,
  detectChanges,
  createBranch,
  listBranches,
  revertToState,
  autoCreateBranchIfNeeded,
  mergeBranch
} from '../branchService';


