## Kibitz setup, environment, commits, rollback, and GitHub sync

### Purpose
This guide explains how to configure your environment, how project workspaces are resolved, and how the commit/auto‑commit, rollback, and GitHub sync flows work end‑to‑end. It references concrete files in this repository so you can navigate and review the code paths.

---

## Environment setup (.env.local)

- **Where**: create `.env.local` at the repo root. It’s git‑ignored and overrides `.env`.
- **Restart** the dev server after changing env values.

### Required
- **PROJECT_WORKSPACE_PATH**: Absolute path where Kibitz creates/manages project workspaces on the server.
- **GITHUB_TOKEN / GH_TOKEN**: GitHub Personal Access Token; either variable name works (the server checks `GITHUB_TOKEN || GH_TOKEN`). Should have `repo` scope at minimum; more scopes allow provisioning.
- **GITHUB_USERNAME**: Your GitHub username; used to compute remote URLs and for repo create.
- **GIT_USER_NAME**, **GIT_USER_EMAIL**: Identity used for local git commits.

### Optional
- **USER_PROJECTS_PATH**: Alternative server‑side base path; same precedence as `PROJECT_WORKSPACE_PATH`.
- **NEXT_PUBLIC_PROJECTS_DIR**: Client‑only hint for UI; does not affect server path resolution.
- **NEXT_PUBLIC_BASE_PATH**: If you deploy under a subpath (Kinode style).
- **NEXT_PUBLIC_DEFAULT_WS_URI**: Default ws‑mcp URI for the UI.

### Example (.env.local)
```bash
PROJECT_WORKSPACE_PATH=/Users/you/kibitz-projects
NEXT_PUBLIC_PROJECTS_DIR=/Users/you/kibitz-projects

GH_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
GITHUB_USERNAME=your_github_username
GIT_USER_NAME=Your Name
GIT_USER_EMAIL=you@example.com

# Optional UI base path (Kinode)
# NEXT_PUBLIC_BASE_PATH=/kibitz:app:yournode
# NEXT_PUBLIC_DEFAULT_WS_URI=/fwd-ws:app:yournode
```

### How paths are resolved
- Single source of truth: `src/lib/pathConfig.ts`
  - Reads `PROJECT_WORKSPACE_PATH` or `USER_PROJECTS_PATH` (server), then `NEXT_PUBLIC_PROJECTS_DIR` (client), else falls back to a local default.
  - All server API routes call `getProjectsBaseDir()` to locate workspaces.
- Project directories follow the pattern: `{projectId}_{projectName}` (sanitized name).

---

## Key components and files

- **Path configuration**: `src/lib/pathConfig.ts`
- **Project path service**: `src/lib/projectPathService.ts`
- **Project JSON manager**: `project-json-manager.js`
- **Auto‑commit store**: `src/stores/autoCommitStore.ts`
- **Enhanced commit service**: `src/lib/enhancedConversationCommitService.ts`
- **Git service wrapper (MCP)**: `src/lib/gitService.ts`
- **GitHub sync toggle (UI)**: `src/components/GitHubSyncToggle.tsx`
- **GitHub sync API**:
  - Config: `src/app/api/github-sync/config/route.ts`
  - Trigger: `src/app/api/github-sync/trigger/route.ts`
  - Status: `src/app/api/github-sync/status/route.ts`
- **JSON generation API**: `src/app/api/projects/[projectId]/generate/route.ts`
- **Manual commit/rollback UI**: `src/components/CommitRollbackControls.tsx`
- **Rollback services (advanced)**:
  - `src/lib/rollbackIntegrationService.ts`
  - `src/lib/rollbackSystem.ts`
  - `src/lib/checkpointRollbackService.ts`

---

## Project metadata (project.json)

- Location: `{projectPath}/.kibitz/api/project.json`
- Created by: generate API or automatically initialized when updating GitHub config if missing.
- Managed by: `project-json-manager.js` (read/write with file locking, merging defaults).
- Holds:
  - Project identity (`projectId`, `projectName`, `projectPath`)
  - Git summary (main branch, latest commit message/hash, lightweight repo stats)
  - Branch list (+ optional conversation metadata)
  - GitHub sync block: `enabled`, `remoteUrl`, `syncInterval`, `syncBranches`, `syncStatus`, `lastSync`, `authentication`
  - Global `sync` block: scheduling/attempt counters

---

## End‑to‑end auto‑commit and GitHub sync

### 1) Change detection and triggers
- Component: `src/stores/autoCommitStore.ts`
- Tracks pending file changes and time windows (`trackFileChange`).
- `shouldAutoCommit` enforces:
  - Triggers: after tool execution, on file change, after tests/builds, etc.
  - Minimum change count and rate limiting.

### 2) Commit execution
- `executeAutoCommit`:
  - Ensures a git repo exists for the project.
  - Creates a regular commit.
  - Optionally creates a conversation/auto branch when thresholds are met.
  - Verifies final branch.

### 3) Enhanced commit (LLM + diff)
- File: `src/lib/enhancedConversationCommitService.ts`
- Generates a detailed diff summary, LLM commit message, and statistics.
- Amends the git commit message with the LLM result when available.
- Updates `project.json` via the Generate API to keep metadata in sync.

### 4) Persist checkpoint and dispatch UI events
- Stores a checkpoint entry for the commit.
- Dispatches `autoCommitCreated` and `newBranchDetected` custom events to keep UI panels in sync.

### 5) Generate JSON and ensure GitHub is enabled
- After commit, `executeAutoCommit` calls `POST /api/projects/{projectId}/generate` to write `.kibitz/api/project.json`.
- Then it verifies GitHub is enabled; if not, it enables it via `POST /api/github-sync/config`.

### 6) Trigger GitHub sync
- Calls `POST /api/github-sync/trigger` with `{ immediate: true, force: true }`.
- Server route (`trigger/route.ts`) will:
  - Locate project path via `getProjectsBaseDir()` and `{projectId}_*` convention.
  - Ensure remote repo exists using GitHub REST and/or `gh` CLI.
  - If `origin` is missing: add remote, set branch to `main`, push.
  - Update `project.json` with `remoteUrl`, `syncStatus`, `lastSync`.

### 7) Push all relevant branches
- On successful sync, the client pushes conversation and auto branches via `pushAllBranches` (fallback), setting upstream for new branches.

---

## Manual commit and rollback (UI)

- Component: `src/components/CommitRollbackControls.tsx`
- **Create Commit**
  - Uses MCP `BashCommand` to `git add . && git commit -m "Manual commit: ..."`.
  - Reloads recent commits and triggers GitHub sync if the project has sync enabled.
- **Rollback**
  - Prompts for confirmation.
  - Performs `git reset --hard <commitHash>` to the selected commit.
  - Reloads commit list.

### Advanced rollback services
- The repository contains richer rollback abstractions (`rollbackIntegrationService.ts`, `rollbackSystem.ts`, `checkpointRollbackService.ts`) that support preview, stash/backup creation, and metadata updates. The current UI uses the simple `git reset --hard` path, but these services are available for a safer, more auditable rollback flow.

---

## GitHub sync internals

- **Toggle (UI)**: `src/components/GitHubSyncToggle.tsx`
  - Defaults ON; reads server config; writes via `POST /api/github-sync/config`.
  - Triggers an initial sync on enable.

- **Config route**: `src/app/api/github-sync/config/route.ts`
  - Input: `{ projectId, projectName?, enabled, remoteUrl?, syncBranches?, authentication? }`.
  - Locates or creates `{projectId}_{projectName}` directory.
  - Initializes `project.json` if missing and merges the GitHub config block.

- **Trigger route**: `src/app/api/github-sync/trigger/route.ts`
  - Input: `{ projectId, immediate?, force? }`.
  - Ensures repository exists (REST + `gh` CLI if available), adds remote, pushes.
  - `force: true` allows the very first sync before the toggle has propagated.

- **JSON manager**: `project-json-manager.js`
  - Safe read/write with file locking.
  - `updateGitHubConfig()` creates a default `project.json` if missing.
  - `getAllProjectsWithGitHub()` lists enabled projects for status/debug.

---

## LLM provider keys and models

- Provider keys are stored per‑project in the UI (not in env by default):
  - Anthropic: `anthropicApiKey`
  - OpenAI: `openaiApiKey`
  - OpenRouter: `openRouterApiKey`
- Commit message generation uses `src/lib/llmCommitMessageGenerator.ts` and project settings in the store (`src/stores/rootStore.ts`).

---

## Verifying your setup

- **Check env**
  - Confirm `GITHUB_TOKEN`/`GH_TOKEN`, `GITHUB_USERNAME`, `GIT_USER_NAME`, `GIT_USER_EMAIL`, and `PROJECT_WORKSPACE_PATH` are set.
  - Restart `npm run dev` after changes.

- **Check endpoints** (replace `<id>`):
  - GET `/api/github-sync/config?projectId=<id>` → `{ github.enabled: true }`
  - POST `/api/projects/<id>/generate` → success and writes `.kibitz/api/project.json`
  - POST `/api/github-sync/trigger` with `{ projectId: <id>, immediate: true }` → success, logs show push

- **Logs you want to see**
  - “✅ Repo created via REST” or “✅ GitHub CLI found ...”
  - “Remote origin added successfully” and “Push completed successfully!”
  - “Updated GitHub config for project: <id>”

---

## Troubleshooting

- **Sync says disabled**
  - Ensure the GitHub toggle is ON; or hit `POST /api/github-sync/config` with `{ enabled: true }`.

- **Repo create fails (‘Name already exists’)**
  - Normal if the repo was created earlier. The route falls back to `git remote add origin` → push.

- **Push fails (‘no upstream branch’)**
  - The client auto‑retries with `git push -u origin <branch>`.

- **No project.json found**
  - Call `POST /api/projects/<id>/generate` once. The config route will also auto‑initialize a minimal file now.

- **gh CLI missing**
  - REST ensure runs if token present. Install gh (`brew install gh`) and login (`gh auth login`) for the best experience.

---

## Deployment notes

- For Kinode or subpath deployments, set `NEXT_PUBLIC_BASE_PATH` and `NEXT_PUBLIC_DEFAULT_WS_URI` before `npm run build`.
- Example:
```bash
NEXT_PUBLIC_BASE_PATH=/kibitz:app:your.kino \
NEXT_PUBLIC_DEFAULT_WS_URI=/fwd-ws:app:your.kino \
npm run build
```

---

## Appendix: End‑to‑end flow (mermaid)

```mermaid
flowchart TD
  A[Change detected] --> B{shouldAutoCommit}
  B -- no --> Z[Exit]
  B -- yes --> C[executeAutoCommit]
  C --> D[Create git commit]
  D --> E[Optional: create auto/conv branch]
  E --> F[Enhanced commit (LLM + diff)]
  F --> G[Amend commit message]
  G --> H[POST /api/projects/:id/generate]
  H --> I{GitHub enabled?}
  I -- no --> J[POST /api/github-sync/config enabled:true]
  I -- yes --> K
  J --> K[POST /api/github-sync/trigger immediate:true]
  K --> L[Server ensures repo, adds remote, pushes]
  L --> M[Client pushAllBranches (upstream/force‑with‑lease as needed)]
  M --> N[Update project.json sync fields]
```




## Operational conventions and optimizations

### Branch naming — current state and recommendation

- Current patterns found in code:
  - Auto-commit branches: `auto/YYYYMMDD-HHMM[-rand]` (preferred) and `auto-commit-<conversationId>-<timestamp>` (legacy).
  - Conversation branches: `conv-<conversationId>-step-<N>` (incremental, base is previous step).
  - Sync patterns configured in multiple places: `['main', 'auto/*']`.

- What to standardize:
  - Use only `auto/` for auto branches. Drop the legacy `auto-commit-...` prefix.
  - Keep conversation branches as `conv-<id>-step-<N>`.
  - Expand sync patterns to include conversation branches: `['main', 'auto/*', 'conv-*']` so step branches are not skipped by background sync.

- Where the mixed patterns come from (for future cleanup if desired):
  - `auto/` generation: `src/stores/autoCommitStore.ts`, `src/lib/branchService.ts`, `src/lib/optimizedGitService.ts`.
  - Legacy `auto-commit-...`: `src/lib/gitIntegrationService.ts` and some tests/examples.

### GitHub operations used (end-to-end)

- Server sync (`/api/github-sync/trigger`):
  - Ensures a git repo (`git init`, first commit if needed).
  - Checks `origin`; if present, `git push origin --all`.
  - If missing: tries `gh repo create ... --remote=origin --push`; on failure, falls back to `git remote add origin <url>`, `git branch -M main`, `git push -u origin main`.
  - Updates `.kibitz/api/project.json` `github` fields.
- Client/library helpers:
  - `src/lib/gitService.ts`: commit creation, remote connect, push current branch, upstream handling, safe `--force-with-lease` fallback.
  - `git-executor.js`: `pushAllBranches(projectPath, [branches])` sequentially pushes a set of branches.

### LLM model configuration for commit messages

- Commit message generation uses provider-specific, fast defaults in `src/lib/llmCommitMessageGenerator.ts`:
  - Anthropic: `claude-3-5-haiku-20241022`.
  - OpenAI: `gpt-4o-mini`.
  - OpenRouter: `openai/gpt-4o-mini`.
- The provider is read from project settings (UI store). For commit messages, the code intentionally picks an optimized model regardless of any heavier default you might use for chat.
- Downgrading further is unnecessary; these are already the “mini/haiku” tiers. For latency, pick the provider with the lowest round-trip from your infra (often OpenAI `gpt-4o-mini`).

### API and sync performance tips

- Avoid pushing all branches unless needed:
  - Prefer pushing only the current branch or branches that changed. Use repository analysis to select branches and keep `--all` as a fallback.
- Add a simple sync throttle/lock:
  - Before doing network calls, check `project.json.sync.nextScheduled` and `github.syncStatus !== 'syncing'` to coalesce burst triggers.
- Only rename to `main` when required:
  - Check current default branch and skip `git branch -M main` if already `main`.
- Use environment-driven remote URL:
  - Build `remoteUrl` from `process.env.GITHUB_USERNAME` (not a hardcoded username) everywhere it’s constructed.
- Timeouts and buffer limits:
  - Use safe `exec`/`spawn` timeouts and `maxBuffer` to avoid hanging on large pushes; surface a clear `syncStatus` error.
- Cache `gh` availability/auth check for the process lifetime to avoid repeated CLI probes.

### Metadata completeness review (project.json)

Good today:
- Core git fields, repository summary, branches, conversations, GitHub config, global sync state.

Gaps and suggested additions:
- Record branch upstream state and last push per branch:
  - `branches[i].sync = { lastPushed: number|null, pushedHash: string|null, needsSync: boolean, syncError: string|null }` (persist already if present; ensure it’s kept up to date).
- Include conversation chain for `conv-*` branches:
  - `branches[i].baseBranch` and `branches[i].stepNumber` for easier validation and UI linking.
- Persist LLM provenance per commit (useful for analytics/audits):
  - For each commit entry captured by the enhanced commit service, add `{ llm: { provider, model, success: boolean } }`.
- Store policy knobs for clarity and tooling:
  - `metadata.branchNamingPolicy = { auto: 'auto/YYYYMMDD-HHmm[-rand]', conv: 'conv-<id>-step-<N>' }`.
- Add `github.auth` health indicators:
  - `github.authentication = { type: 'token'|'ssh'|'oauth', configured: boolean, lastValidated: number|null }` (already scaffolded; make sure it’s updated by the trigger route).

### Minimal changes if you want code to match this doc

- Standardize auto branch creation to `auto/…` (remove legacy `auto-commit-…`).
- Add `'conv-*'` to `syncBranches` in the config route, generate route, and client toggle initialization.
- Build `remoteUrl` from `GITHUB_USERNAME` everywhere.
- Add throttle/lock around the trigger route to avoid overlapping runs.
 
---
 
## Conversation data, persistence, and branch UX
 
### What is stored and where
 
- **Per‑project aggregate**: `.kibitz/api/project.json`
  - `conversations[]`: each with `conversationId`, `createdAt`, `branches[]`, and `currentBranch`.
  - `branches[]`: all branches with summary, including conversation branches. Each entry may include a `sync` block `{ lastPushed, pushedHash, needsSync, syncError }`.
  - `github`, `sync`, and repository stats as documented above.
 
- **Per‑conversation file**: `.kibitz/api/conversation_<conversationId>.json`
  - Written by `src/lib/conversationMetadataService.ts` via `saveConversationMetadata()`.
  - Includes the raw `metadata` captured by the UI, plus a `gitSnapshot` at the time of save.
 
- **Optional branch list cache**: `.kibitz/api/branches.json`
  - Read by `GET /api/projects/<id>/branches`; if missing, the API falls back to `project.json`.
 
- **Client‑side state (for continuity across reloads)**: IndexedDB (`src/lib/db.ts`)
  - Stores projects, settings, and `appState.activeProjectId` + `appState.activeConversationId`.
  - On app init, `src/stores/rootStore.ts` loads these to restore context.
 
### How the data is produced
 
- **Commit/branch flow**: `src/lib/enhancedConversationCommitService.ts` and `src/lib/conversationBranchService.ts`
  - When a conversation branch is created or a commit lands, `updateConversationJSON()` merges branch/commit info into `project.json` and sets the conversation’s `currentBranch`.
  - The Generate API can also reconstruct `conversations[]` by parsing existing `conv-*` branches when needed.
 
- **Conversation metadata capture**: `src/lib/conversationMetadataService.ts`
  - Builds a `gitSnapshot` and writes `.kibitz/api/conversation_<id>.json`.
  - Also updates `project.json` with repository/branches snapshots (v2 schema fields).
 
### How the UI reads and lets users interact
 
- **Fetching**
  - Project overview: `GET /api/projects/<id>` → returns `project.json`.
  - Branch list: `GET /api/projects/<id>/branches` → returns `branches.json` or `project.json` branches.
  - Current branch: `GET /api/projects/<id>/branches/current` → resolves from `git branch --show-current` (falls back to `.git/HEAD`).
 
- **Branch switching (user action)**
  - UI hook `src/components/LlmChat/hooks/useConversationBranches.ts` posts to `POST /api/projects/<id>/branches/switch`.
  - Store path `src/stores/branchStore.ts` performs a safe checkout through rollback helpers and, on success, updates in‑memory `currentBranch[projectId]`.
  - `ConversationWorkspaceManager` mirrors the branch switch at the workspace level so subsequent git ops run on the right branch.
 
- **Auto refresh and no‑reset UX**
  - On app start, `rootStore.initialize()` loads projects and `activeProjectId/activeConversationId` from IndexedDB, reconnects MCP servers, and hydrates the UI.
  - The branch managers start an auto‑refresh loop (every ~30s) that calls `GET /branches/current` to pick up the true git HEAD even if the server restarted.
  - `Checkpoint`/`Branch` components also fetch branches on mount to keep panels in sync.
 
### Invariants to rely on
 
- **Branch naming** (from earlier section):
  - `conv-<conversationId>-step-<N>` forms a chain; step N must base on step N‑1.
  - Auto branches use `auto/YYYYMMDD-HHmm[-rand]`.
  - Sync patterns should include `['main', 'auto/*', 'conv-*']` so conversation branches are not skipped.
 
- **Conversation tracking**
  - `project.json.conversations[].currentBranch` points to the most recent branch for that conversation.
  - `GET /branches/current` is the source of truth for live UI state; it checks the repo directly.
 
### Ensuring state survives restarts (no silent resets)
 
- **Server restarts**: data persists on disk in `.kibitz/api/*.json`. After restart, the UI rehydrates and confirms the live branch via `GET /branches/current`.
- **Client reloads**: active IDs come from IndexedDB; UI auto‑refreshes the current branch and repopulates the panels.
- **Recommended consistency check**: when switching a branch, also update `project.json.conversations[].currentBranch` to mirror the switch (the commit/branch services already do this when they own the change).
 
### Suggested improvements (non‑breaking)
 
- Persist `activeConversationId` and last `currentBranch` for each project into `project.json` under a small `ui` block, so headless consumers can restore context without IndexedDB.
- When handling `POST /branches/switch`, update the conversation entry’s `currentBranch` in `project.json` and append a small activity event for auditability.
- Add a `conversations[].branches[].stepNumber` and `baseBranch` consistently for easier UI linking.
- Extend `syncBranches` to include `'conv-*'` and mark each conversation branch with a `tags: ['conv']` for quick filtering in the UI.

---

## Instant, non‑blocking commits and remote provisioning

This section outlines how to reduce user‑visible latency by splitting work into an immediate local commit and a background enhancement/sync job. It also describes pre‑provisioning the GitHub remote and making LLM commit message amends safe and opportunistic.

### A) Make commits instant and non‑blocking

- Goal: return control to the UI as soon as the file changes are committed locally. All heavier work (LLM diff, amend, pushes) runs in the background.
- Proposed split in `src/stores/autoCommitStore.ts`:
  - `createLocalCommit(context) -> { commitHash, branchName? }`
    - Runs `git add . && git commit -m "Auto: <trigger>/<summary>"` (short, machine‑friendly message).
    - Updates store state: `lastCommitTimestamp`, `lastCommitHash`, clears `pendingChanges`.
    - Dispatches `autoCommitCreated` event so the UI updates immediately.
    - Returns quickly; no LLM, no network.
  - `enqueueEnhanceAndSync(context, { commitHash, branchName })`
    - Queues a background task to do: diff + LLM message → opportunistic amend → regenerate project.json → ensure GitHub → trigger sync → optional push.
    - Can reuse existing enhanced‑commit and sync code paths but run them off‑thread (setTimeout/micro‑queue) and without blocking the caller.

- Notes from current implementation:
  - Today `executeAutoCommit` awaits the enhanced commit flow and then triggers sync. To make it instant, call `createLocalCommit()` synchronously, then schedule `enqueueEnhanceAndSync()` with the same payload and exit.
  - Keep the existing event dispatching so panels update immediately.

### B) Pre‑provision the GitHub remote for new projects

- Goal: eliminate the “first push” penalty by creating the remote repository early.
- Where to integrate:
  - Keep `src/app/api/github-sync/config/route.ts` focused on config writes (fast I/O).
  - Immediately after config is saved (from project creation or first init), fire‑and‑forget a background call to `/api/github-sync/trigger` to ensure the remote exists. UI can show “Provisioning GitHub repo…”.
  - Trigger call should be tolerant: if repo exists, it simply adds remote and returns; if not, it creates and returns fast.
- Why not create in the config route directly?
  - Mixing long‑running network calls into the config write path makes the route slow and more failure‑prone. Keeping creation in the trigger route preserves separation of concerns and lets the UI manage retries and status.

### C) LLM amend: asynchronous and opportunistic

- Background job behavior (implemented inside `enqueueEnhanceAndSync()` and/or `enhancedConversationCommitService`):
  1) Generate diff and LLM message.
  2) HEAD safety check before amend:
     - Read `HEAD` hash just before attempting `git commit --amend`.
     - Only amend if `HEAD === originalCommitHash` and branch is not pushed yet.
     - If `HEAD` changed or the branch has been pushed, DO NOT amend; instead either:
       - Store the LLM message in `project.json` as provenance for the original commit, or
       - Create a tiny follow‑up commit: `chore: improve commit message` that includes the rich description in the body.
  3) Regenerate `.kibitz/api/project.json` to capture LLM provenance fields.
  4) Ensure GitHub enabled (config GET/POST as needed), then call `/api/github-sync/trigger` and, on success, optionally push current/changed branches.

- Where to hook this:
  - `src/lib/enhancedConversationCommitService.ts` should expose a non‑blocking entry (e.g., `enqueueEnhancedProcessing(request)`), which internally schedules `processEnhancedCommit()` and performs the HEAD‑checked amend.
  - `src/stores/autoCommitStore.ts` should call the enqueue function and return immediately to the UI after the local commit.

### What I disagree with or caution

- Amending after push can rewrite history and force a `--force-with-lease`. Avoid amending if the branch has upstream and a push already occurred; prefer the follow‑up “chore: improve commit message” commit or just store LLM text in metadata.
- Creating the remote inside the config route makes a configuration write path slow and brittle. Prefer calling the trigger route in the background right after the config write, or introduce an explicit “provision” endpoint.
- Pushing “all branches” on every background job can be expensive. Prefer pushing only current/changed branches and keep a fallback to batch push when needed.

---

## Roadmap and implemented items

Completed in code:
- Non‑blocking enhanced processing with HEAD‑safe amend helper (`enqueueEnhancedProcessing`).
- Config route schedules background GitHub provisioning and includes `'conv-*'` in default sync patterns.
- Generate route writes `'conv-*'` into `github.syncBranches` in `project.json`.
- Post‑sync push prefers current branch; falls back to batch push once.
- New helper APIs in `src/stores/autoCommitStore.ts`:
  - `createLocalCommit(context)` returns `{ commitHash, branchName, commitMessage }`.
  - `enqueueEnhanceAndSync(context, payload)` schedules background enhancement/sync.
- On project creation (`rootStore.createProject`), the app posts `/api/github-sync/config` (enabled: true) so pre‑provisioning begins in background.

Next minimal steps (optional):
- Refactor `executeAutoCommit` to call `createLocalCommit()` followed by `enqueueEnhanceAndSync()` directly (behaviorally already aligned, helpers added for clarity/tests).
- Persist LLM provenance explicitly when amend is skipped.
- Add a light in‑process throttle/lock inside `github-sync/trigger` to avoid overlapping runs.


## Performance and stability improvements (auto‑commit and git integration)

### What changed and why
- **Goal**: Cut commit latency and eliminate initialization storms without changing user‑visible behavior.
- **Result**: Local commits are near‑instant, repeated Initialize calls are deduped, and heavy JSON extraction runs in the background.

### Changes by area
- **MCP thread/session reuse and Initialize dedupe**
  - **Files**: `src/lib/gitService.ts`, `src/lib/projectPathService.ts`, `src/lib/projectDataExtractor.ts`, `src/lib/llmAgentGitHandler.ts`
  - **Details**:
    - Reuse one MCP `thread_id` per `(serverId, projectPath)`; cache and parse both “thread_id=…” and “Use thread_id=…”.
    - Deduplicate Initialize calls globally per `(serverId, projectPath)` so subsequent tool calls reuse the same session.
    - Prevents errors like “No saved bash state found for thread_id git-operations” and removes handshake overhead.

- **Commit pipeline simplification (fast path)**
  - **Files**: `src/lib/gitService.ts`, `src/stores/checkpointStore.ts`
  - **Details**:
    - Hot path reduced to: `git add -A` → `git commit -m …` → `git rev-parse HEAD`.
    - Per‑repo git user config is set once and cached; removed extra `ls`, repeated `status/diff` loops.
    - Push/JSON generation remains handled by existing background/sync flows so the commit returns immediately.

- **Change detection and auto‑branch creation**
  - **Files**: `src/lib/branchService.ts`, `src/stores/branchStore.ts`
  - **Details**:
    - Skip expensive `git diff` when the status only shows untracked files (`?? …`); use a small estimate instead.
    - Debounce `handleToolExecution` per project and limit eligible tools (skip internal bash noise) to prevent branching thrash.

- **UI init storms (ChatView)**
  - **File**: `src/components/LlmChat/ChatView.tsx`
  - **Details**:
    - Initialize the project’s git environment once per project per session; subsequent rerenders/fast refresh won’t re‑trigger initialization.

- **Defer heavy project extraction on first repo init**
  - **File**: `src/lib/gitAutoInitService.ts`
  - **Details**:
    - First‑time repo initialization now defers full project data extraction/JSON writing to a background tick, avoiding synchronous delays during setup.

### Impact
- **Commit latency**: Reduced to a few fast shell calls; UI resumes quickly after local commit.
- **Stability**: Eliminated repeated Initialize storms and thread_id mismatches across modules.
- **Change detection**: Lower CPU/I/O overhead when only new files are present.

### Verification checklist
- Make an edit that touches ≥1 file and observe:
  - Only one Initialize per `(serverId, projectPath)` appears in logs; subsequent git calls reuse the same `thread_id`.
  - Commit logs show a direct `add → commit → rev-parse` sequence without extra `ls`/duplicate status checks.
  - Auto‑branching triggers at most once within the debounce window on rapid UI activity.
  - First‑time initialization completes quickly; JSON extraction messages can appear slightly later (background).

### Backward compatibility
- No changes to API contracts or UI flows.
- Push and sync continue to run via existing background logic after commit; behavior is unchanged, just faster.

### Files touched in this optimization pass
- `src/lib/gitService.ts`
- `src/lib/projectPathService.ts`
- `src/lib/projectDataExtractor.ts`
- `src/lib/llmAgentGitHandler.ts`
- `src/stores/checkpointStore.ts`
- `src/lib/branchService.ts`
- `src/stores/branchStore.ts`
- `src/components/LlmChat/ChatView.tsx`
- `src/lib/gitAutoInitService.ts`

### Notes
- For very large repos, consider ignoring `.kibitz/` in your `.gitignore` to keep `git status` light (optional; not enforced by code changes).
