## Rollback/Commit Analysis and Implementation Status

Status updates:
- Implemented `src/lib/versionControl/VersionControlManager.ts` with unified rollback-by-commit, revert-to-branch, and commit helpers using standardized options (`stashChanges`, `createBackup`, `force`).
- Refactored `src/lib/gitSessionService.ts` to use the manager and shared `RollbackOptions`/`RollbackResult`.
- Refactored `src/lib/rollbackSystem.ts` to delegate revert execution to the manager while keeping preview/conflict checks.
- Exported the manager in `src/lib/versionControl/index.ts`.
- Migrated `src/lib/rollbackIntegrationService.ts` to a clean facade that:
  - Uses `existingDatabaseIntegration` for persistence.
  - Delegates git rollback to `VersionControlManager` with shared `RollbackOptions/Result`.
  - Provides synthetic rollback/commit records where the facade lacks tables, keeping responsibilities separated.

Next steps:
- Migrate `src/lib/rollbackIntegrationService.ts` to use shared types and call the manager for git operations; keep it focused on DB/persistence.
- Unify backup branch naming to one convention across modules.
- Gradually route remaining commit flows through the manager and standardize logging/identity handling.

You mentioned a specific file but its content wasn’t included. Below is a repo-wide analysis focused on rollback/commit behavior to help you spot overlaps and decide consolidation. When you share the file or path, I’ll add a precise summary for that file in section 1.

### 1) File summaries (current state)
- NEW: `src/lib/versionControl/VersionControlManager.ts` → unified facade for rollback-by-commit, revert-to-branch, commit helpers; standard options; central git execution.
- UPDATED: `src/lib/gitSessionService.ts` → imports shared `RollbackOptions/Result` and uses manager for rollback.
- UPDATED: `src/lib/rollbackSystem.ts` → delegates revert execution to manager; retains preview/conflict checks.
- UPDATED: `src/lib/versionControl/index.ts` → re-exports manager for a single import surface.

### 2) Overlapping functionality across the codebase
- **Git rollback to commit (low-level)**: Performs `git reset --hard`, with optional stash and backup branch.
  - Key location: `src/lib/versionControl/rollback.ts`

```1:18:src/lib/versionControl/rollback.ts
import { RollbackResult, RollbackToCommitParams } from './types';

export async function rollbackToCommit(params: RollbackToCommitParams): Promise<RollbackResult> {
  const { projectPath, serverId, executeTool, commitHash, options } = params;
  try {
    const stashChanges = options?.stashChanges !== false; // default true
    const createBackup = options?.createBackup !== false; // default true
    // ...
  }
}
```

- **Session-level rollback facade**: Validates commit existence, delegates to the low-level rollback, shapes user-facing result.
  - Key location: `src/lib/gitSessionService.ts` (method `rollbackToCommit`)

```44:87:src/lib/gitSessionService.ts
  /**
   * Rollback to a specific commit hash
   */
  async rollbackToCommit(
    commitHash: string,
    options: RollbackOptions = {}
  ): Promise<RollbackResult> {
    const { stashChanges = true, createBackup = true, force = false } = options;
    try {
      // ... verify commit exists, check current commit
      const { rollbackToCommit: vcRollbackToCommit } = await import('./versionControl/rollback');
      const res = await vcRollbackToCommit({ projectPath: this.projectPath, serverId: this.serverId, executeTool: this.executeTool, commitHash, options: { stashChanges, createBackup, force } });
      if (res.success) {
        return { success: true, commitHash, backupBranch: res.backupBranch, message: res.message || `Rolled back to commit ${commitHash.substring(0, 7)}` };
      }
      return { success: false, error: res.error, backupBranch: res.backupBranch };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
```

- **Branch-based revert flow**: Revert to a branch, preview conflicts, optional backup branch, optional stash, updates metadata.
  - Key location: `src/lib/rollbackSystem.ts`

```90:106:src/lib/rollbackSystem.ts
  /**
   * Perform rollback to specified branch
   */
  async revertToBranch(
    branchName: string, 
    options: { createBackup?: boolean; stashChanges?: boolean; force?: boolean } = {}
  ): Promise<RevertResult> {
    const { createBackup = true, stashChanges = true, force = false } = options;
    try {
      // validate branch, preview conflicts, optionally backup/stash, checkout, update metadata
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
```

- **Database-tracked rollback/checkpoints/branches**: Records commits/branches/rollback points in DB, updates project state for “rollback”, but does not execute git operations.
  - Key location: `src/lib/rollbackIntegrationService.ts` (methods: `executeAutoCommit`, `createRollbackPoint`, `executeRollback`)

- **Local (in-memory + localStorage) branch/session persistence**: Manages rollback points and snapshots outside of git; includes a TODO for actual file restoration.
  - Key location: `src/lib/enhancedBranchPersistence.ts` (methods: `createRollbackPoint`, `rollbackToPoint`)

- **Commit creation logic (duplicated in several places)**:
  - `src/lib/gitIntegrationService.ts` → `commitChanges`
  - `src/lib/gitService.ts` → `createCommit`
  - `src/lib/llmAgentGitHandler.ts` → internal `createCommit`
  - `src/lib/conversationBranchService.ts` → consumes commit metadata and generates diffs/messages
  - `src/lib/gitCheckpointService.ts` → orchestrates git commit + Kibitz checkpoint

### 3) Should this be bundled into a shared module/class?
Yes. There is clear overlap among low-level git operations, higher-level revert/rollback flows, persistence (DB/local), and UI-facing orchestration. Recommend a single cohesive domain:

- **Proposed module**: `src/lib/versionControl/VersionControlManager.ts`
  - **RollbackService**: unified API for rollback by commit and by branch; normalizes options and results; always handles stash/backup consistently; internally calls low-level git operations.
  - **CommitService**: a single commit path (stage/add, identity handling, commit, hash retrieval) consumed by all callers (auto-commit, manual commit, checkpoint commit).
  - **CheckpointService**: bridges git commits with Kibitz checkpoints (DB/local) consistently.
  - **PersistenceAdapters**: `DatabaseAdapter` and `LocalPersistenceAdapter` to ensure DB/local state is updated atomically with git operations when required.
  - **Result/Option types**: shared `RollbackOptions`, `RollbackResult`, `CommitOptions`, `CommitResult` across all surfaces.

This reduces drift, eliminates duplicated git command strings, aligns logging/error handling, and gives UI a single entry point.

### 4) Inconsistencies and potential confusion
- **Result object shape**:
  - `RollbackResult` varies: some include `message`, some not; some include `backupBranch`, others `rollbackCommitSha`; some throw, others return `{ success: false }`.
  - Action: define one `RollbackResult` and one `CommitResult`, return consistently (no mixing throw vs return for expected errors).

- **Option names/semantics**:
  - `createCheckpoint` (DB-centric) vs `createBackup` (git branch) vs `preserveUncommittedChanges` vs `stashChanges`.
  - Action: converge on `stashChanges`, `createBackup`, `force`; treat DB “checkpoint” creation as a separate, explicit step.

- **Backup branch naming**:
  - `backup-before-rollback-<ts>` vs `backup-before-revert-<ts>` vs `backup-before-message-revert-<ts>`.
  - Action: one naming convention, e.g., `backup/rollback/<iso-ts>`.

- **Logging style**:
  - Mixed emoji/phrasing; inconsistent error/warn/info semantics.
  - Action: central logger with levels; structured context (projectId, branch, commitHash).

- **Commit identity handling**:
  - `gitIntegrationService` conditionally sets `user.name/email`; `gitService.createCommit` uses `git -c`; `llmAgentGitHandler` reads from store/env; others rely on repo config.
  - Action: one identity resolution strategy in the shared CommitService, with explicit precedence (in-memory vault → env → repo config) and clear error if missing.

- **Git command duplication**:
  - Repeated `git add`, `git commit`, `git reset`, `git checkout`, `git stash` strings across modules.
  - Action: single low-level git executor with safe wrappers and standardized thread IDs.

- **Side effects in persistence**:
  - `enhancedBranchPersistence` uses `window.localStorage` and a global `setInterval` without cleanup; not SSR-safe and can leak timers.
  - Action: guard for environment, add lifecycle controls, or move to a store-managed scheduler.

- **Responsibility mixing**:
  - `rollbackIntegrationService.executeRollback` updates DB but doesn’t perform git rollback; the name implies git revert behavior.
  - Action: rename to reflect behavior (e.g., `recordRollbackInDatabase`) or have it call the shared RollbackService to actually perform the operation, then update DB.

- **UI-facing components triggering varied flows**:
  - Components like `CommitRollbackControls`, `RevertButton`, `CheckpointList` likely call different services and get different result shapes.
  - Action: route all UI actions through the unified manager to receive consistent results for toasts/UX.

### 5) Does this overlap with transactions/logging/state management?
- **Transactions/state**: Strong overlap between git state transitions, DB history (`rollbackIntegrationService`), and local session/branch snapshots (`enhancedBranchPersistence`). These should be coordinated to avoid partial updates.
- **Logging**: Scattered and inconsistent; centralization will improve observability.
- **UI state**: Stores/components (e.g., checkpoint/branch stores) depend on heterogeneous results; shared types would simplify state handling.

### 6) Recommended consolidation plan (no code yet)
- **Define shared types** in a single `versionControl` types module: `RollbackOptions`, `RollbackResult`, `CommitOptions`, `CommitResult`.
- **Create a VersionControlManager** with `rollback`, `revertToBranch`, `commit`, `createCheckpoint` methods; make existing modules call into it.
- **Encapsulate git shell execution** behind a single adapter using consistent `executeTool` thread IDs and error parsing.
- **Normalize persistence** through adapters: DB and local persistence are optional plugin steps invoked by the manager.
- **Align naming/logging** with conventions documented in the manager.

Once you share the specific file, I’ll augment section 1 with a focused summary, call out its precise overlaps, and tailor the consolidation notes to that file’s role.


