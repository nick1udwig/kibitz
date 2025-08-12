# kibitz

The coding agent for professionals

https://github.com/user-attachments/assets/3f8df448-1c81-4ff2-8598-c48283a4dc00

## Prerequisites

* git
* npm

## Installation

1. Clone the repository:
```bash
git clone https://github.com/nick1udwig/kibitz.git
cd kibitz
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Documentation

- See `KIBITZ_SETUP_AND_WORKFLOW.md` for setup and typical workflow.
- See `KIBITZ_VERSION_CONTROL.md` for commit/rollback architecture, key files, and monorepo migration plan.

## Version control (commit & rollback) — quick summary

- Facade (import from `@/lib/versionControl`):
  - `prepareCommit(ctx)`: stage + diff + LLM commit message
  - `executeCommit(ctx, message)`: perform commit
  - `pushCurrentBranch(projectPath, serverId, executeTool, branch?)`: push current branch
  - `rollbackToCommit({ projectPath, serverId, executeTool, commitHash })`: hard reset to commit
- Auto-commit: handled by `src/stores/autoCommitStore.ts` (already uses the facade)
- Manual UI: `src/components/CommitRollbackControls.tsx` (using the same facade)
- Env/keys:
  - Git identity: `GIT_USER_NAME`, `GIT_USER_EMAIL` or store keys (`githubUsername`, `githubEmail`)
  - GitHub push: `githubToken` (store) or `GITHUB_TOKEN`/`GH_TOKEN` (env), and `enableGitHub: true` per project
- Full details: `KIBITZ_VERSION_CONTROL.md`

## Commit & rollback (detailed behavior)

### What creates commits and when

- Manual commits
  - UI component `src/components/CommitRollbackControls.tsx` uses the facade:
    - `prepareCommit(ctx)` stages changes, collects a diff and asks the LLM for a message.
    - `executeCommit(ctx, message)` runs the git commit via MCP and returns the hash.
  - On success it immediately POSTs `/api/projects/{projectId}/generate` so the API JSON reflects the new state, and optionally triggers `/api/github-sync/trigger` when GitHub sync is enabled.

- Automatic commits (end-of-turn)
  - At the end of each assistant response, `useMessageSender` calls `useAutoCommitStore.executeAutoCommit(...)` with trigger `tool_execution` and the active `conversationId`.
  - File changes are tracked during tool execution by `useAutoCommit` and pushed into `useAutoCommitStore.pendingChanges` via `trackFileChange(...)`.
  - Default guardrails in `useAutoCommitStore`:
    - Minimum changes: 1 file (configurable).
    - Global rate limit: at least 2 seconds between commits per project.
    - Concurrency protection: a single active operation per project; others are deduplicated.
  - If there are no staged changes, the facade returns `success=false` and no commit is made.

### When are branches created

- Conversation step branches conv-{conversationId}-step-{N}
  - `useAutoCommitStore.createLocalCommit(...)` creates a new step branch only when ALL are true:
    - A `conversationId` is present for the active chat, and
    - `branchManagement.enabled` is true (default), and
    - The number of pending changed files is at least `branchManagement.fileThreshold` (default 2).
  - Base branch selection for step N:
    - Step 1 bases on `main`.
    - Step N>1 bases on `conv-{conversationId}-step-{N-1}` if it exists; otherwise falls back to `main`.
  - After base checkout, a new branch is created and the commit is written on that branch.
  - The current implementation checks file count only; the configured `lineThreshold` is present for future use but not enforced during branch creation.

### Post-commit actions

- JSON regeneration: the UI and store POST to `/api/projects/{projectId}/generate` to write `.kibitz/api/project.json` and `.kibitz/api/branches.json` from real git data.
- GitHub push/sync:
  - `pushCurrentBranch(...)` pushes the current branch when possible.
  - A delayed sync then calls `/api/github-sync/trigger` to ensure remote existence and push using token auth if configured.
  - GitHub sync is skipped unless the project’s GitHub config is enabled.

### Rollback behavior

- UI rollback
  - `src/lib/versionControl/rollback.ts` performs `git reset --hard {commit}` via MCP.
  - On success the UI POSTs `/api/projects/{projectId}/generate` to refresh JSON.

- Session rollback (chat utility)
  - `src/lib/gitSessionService.ts` supports rollback with:
    - Commit existence verification.
    - Optional `stashChanges` (default true) and `createBackup` (default true) before executing `git reset --hard {commit}`.

### Endpoints used by commit/rollback flows

- Project data
  - `GET /api/projects/{projectId}`: Returns the structured project JSON. If missing, it attempts on-demand generation by POSTing to `/api/projects/{projectId}/generate`.
  - `POST /api/projects/{projectId}/generate`: Creates `.kibitz/api/project.json` and `.kibitz/api/branches.json` from the repo.
  - `GET /api/projects/{projectId}/branches`: Returns branches from JSON (falls back to project.json if needed).
  - `GET /api/projects/{projectId}/branches/current`: Returns the current branch (git command + HEAD fallback).
  - `POST /api/projects/{projectId}/enhanced-commit`: Persists enhanced commit metadata (diff, LLM message) into `project.json`.

- GitHub sync
  - `POST /api/github-sync/trigger`: Ensures remote and pushes the current branch; uses token auth when available.
  - `POST /api/github-sync/config` and `GET /api/github-sync/config`: Manage or query per-project GitHub sync settings (enable/disable, remote URL, etc.).

### What’s intentionally disabled right now

- `AutoCommitAgent` (timer-based) logs "Auto-commit temporarily disabled" and does not create commits on a timer. All automatic commits are end-of-turn via `useAutoCommitStore.executeAutoCommit(...)`.

### Environment and identity

- Git identity is read from the in-memory keys vault first, then environment:
  - `githubUsername`, `githubEmail` from the store; otherwise `GIT_USER_NAME`, `GIT_USER_EMAIL`.
- GitHub pushes look for a token in the store (`githubToken`) or env (`GITHUB_TOKEN`/`GH_TOKEN`).

Server restart resilience
- The server persists GitHub credentials to `data/server-config.json.enc` when `KIBITZ_CONFIG_SECRET` is set.
- On boot, credentials are restored in this order: env > in-memory vault > encrypted file.
- A health endpoint at `/api/github-sync/health` reports `{ authenticated, source }` for the UI to gate pushes.

### Troubleshooting

- No commits created
  - Ensure at least 1 file change and that you reached the end of the assistant turn.
  - Verify identity variables are set if git requires them.
- Branches not appearing
  - The conversation step branch is created only when at least 2 files changed in that turn (default threshold). Raise or lower `branchManagement.fileThreshold` in `useAutoCommitStore` if desired.
- JSON missing/404
  - The GET project route now generates on-demand; manual generation is available via:
    ```bash
    curl -X POST http://localhost:3000/api/projects/{projectId}/generate
    ```

## Refactor checklist (tracking)

This section tracks consolidation work to productionize version control APIs and reduce duplication.

- [x] Step 1: Shared project path helper
  - Added `src/lib/server/projectPaths.ts` with:
    - `projectsBaseDir()`, `findProjectPath(projectId)`, `sanitizeProjectName(name)`, `buildProjectPath(projectId, name)`, `resolveOrCreateProjectPath(projectId, name)`
  - Next: update all API routes to use this helper instead of ad-hoc path scans.
- [x] Step 2: Standardize git command execution under `src/lib/versionControl/git.ts` and make all callers use it.
- [ ] Step 3: Unify rollback semantics through `@/lib/versionControl/rollback` only.
- [ ] Step 4: Single conversation step branch creator in `conversationBranchService`; delegate from `useAutoCommitStore`.
- [ ] Step 5: Make `/api/projects/[projectId]/generate` use the extractor (async) + per-project lock; return 202 when running.
- [ ] Step 6: Input validation and commit SHA guards across all git-bound paths.
- [ ] Step 7: Add per-project locks and basic rate limits to `/generate` and `/github-sync/trigger`.
- [ ] Step 8: Add authentication/authorization to all project and sync routes.

## Configuration

1. Open the Settings panel in the UI
2. Enter your Anthropic API key ([Get one here](https://console.anthropic.com/)).
3. Optionally set a system prompt
4. Configure MCPs by running them using [ws-mcp](https://github.com/nick1udwig/ws-mcp) and then connecting to them in the Settings page

Note configuration is PER-PROJECT.
When creating a new project, it will use some, but not all, of the current project's configuration: the API key, model, and system prompt will be copied over, but MCP servers will not.

## Building for Kinode

1. Add a base to the endpoint by building with the `NEXT_PUBLIC_BASE_PATH` (MUST start with a `/`),
2. Change the default WS-MCP server URI by specifying `NEXT_PUBLIC_DEFAULT_WS_URI` (MUST start with a `/`),

like so:
```bash
NEXT_PUBLIC_BASE_PATH=/kibitz:kibitz:nick.kino NEXT_PUBLIC_DEFAULT_WS_URI=/fwd-ws:kibitz:nick.kino npm run build
```

and then copy the contents of `out/` into the package's `pkg/ui/` dir.
