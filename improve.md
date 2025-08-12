## Kibitz commit/push/rollback reliability improvements

### Purpose
- Capture how the commit → sync → push → rollback flows connect across the codebase.
- Summarize what your logs mean and where they come from.
- List key bottlenecks/race risks with 2–3 concrete, no‑code mitigation options each.

## End‑to‑end flow (high level)
- Commit gating: UI setting `minFilesForAutoCommitPush` (project‑level) gates all automatic commit/push initiators.
- Commit: `autoCommitStore` or UI calls `versionControl/commit` → local `git commit` via `gitService` (only if file‑count ≥ min).
- Background enhance: diff + LLM + JSON regen; ensure GitHub is enabled; trigger server orchestrator `/api/github-sync/trigger` (push only if file‑count ≥ min at server too).
- Push: prefer current branch push via `gitService.pushToRemote` with upstream/force‑with‑lease fallbacks; batch push only as a fallback. Client‑side push also honors the min‑files threshold.
- Rollback: UI uses `versionControl/rollback` to stash/backup (optional) and `git reset --hard <sha>`; later push goes through orchestrator with non‑FF lease fallback.

## Files and responsibilities (3–4 lines each)
- `src/stores/autoCommitStore.ts`
  Orchestrates auto‑commit after tool/file events. Enforces `minFilesForAutoCommitPush` before any auto‑commit. Creates local commits (optionally on `conv-<id>-step-N`), enqueues background “enhanced” processing (diff + LLM + JSON), ensures GitHub, triggers `/api/github-sync/trigger`, then may push current branch (fallback) if orchestrator is off.

- `src/lib/versionControl/commit.ts`
  Facade around commit: `prepareCommit` stages + computes diff/numstat + LLM message; `executeCommit` performs `git commit` via `gitService`. `pushCurrentBranch` resolves current branch and calls `gitService.pushToRemote`.

- `src/lib/versionControl/rollback.ts`
  Safe rollback to a target commit SHA. Optionally stashes work and creates a backup branch, then runs a hard reset. Used by the UI rollback control.

- `src/lib/gitService.ts`
  Low‑level git executor via MCP with thread reuse. `pushToRemote` guards on sync‑enabled and enforces `minFilesForAutoCommitPush`, ensures/auto‑adds `origin`, validates HEAD, pushes with upstream fallback; `pushAllBranches` batch‑pushes `conv-*` and `main` with `--force-with-lease` where needed. Also contains commit creation and setup helpers.

- `src/components/CommitRollbackControls.tsx`
  UI for manual commit/rollback. Uses the facade to prepare/execute commit and to rollback. Regenerates `.kibitz/api/project.json`. When GitHub sync is enabled, triggers orchestrator only if current changed‑file count ≥ `minFilesForAutoCommitPush`.

- `src/stores/rootStore.ts`
  MCP WebSocket plumbing. Normalizes BashCommand calls (always `action_json`), enforces workspace paths, and logs “MCP Response Details”. Holds project settings including `minFilesForAutoCommitPush` with default of 2. Triggers background branch/auto‑commit hooks after file edits.

- `src/lib/gitAutoInitService.ts`
  Ensures a workspace is a git repo once per project; defers heavy `.kibitz/api` JSON extraction to background. Caches init per `(projectId, path)` to avoid storms. Example check at line ~88: verifies `/.kibitz/api/project.json` exists before generating.

- `src/lib/enhancedConversationCommitService.ts`
  Background “enhanced commit”: generate diff + LLM text, update conversation/project JSON, and (only if HEAD unchanged) opportunistically amend the commit message. Non‑blocking and HEAD‑safe.

- `src/lib/gitDiffService.ts`
  Generates diffs and stats for commits (handles initial commit via empty‑tree) and provides summaries.

- `src/lib/branchService.ts`
  Lightweight change detection and branch metadata helpers. Writes `.kibitz/api/project.json` robustly; can suggest/prepare auto‑branches when thresholds are met.

- `src/lib/fastBranchService.ts`
  Fast, read‑optimized branch/repo snapshots for UI. Single‑command summaries for branch selector and counts.

- `src/lib/gitSnapshotService.ts`
  Manual snapshot helper: create branch, commit, optionally push. Useful for checkpoints outside the auto‑commit path.

- `src/lib/llmAgentGitHandler.ts`
  End‑of‑agent‑cycle: ensure repo, enforce `minFilesForAutoCommitPush` before committing, extract/save project JSON, then request server orchestrator to push.

- `src/lib/versionControl/git.ts`
  Thin wrapper re‑exporting `gitService` primitives (`executeGitCommand`, `createCommit`, `pushToRemote`) under a consistent facade.

- `src/lib/rollbackSystem.ts`
  Advanced branch‑based revert with preview, stash/backup, and metadata updates—richer than the simple hard‑reset path.

- `src/lib/rollbackIntegrationService.ts`
  Database‑backed records for commits/branches/rollback points; history, stats, and search APIs.

- `src/app/api/github-sync/*`
  Server routes to ensure/create remote and push branches; complement client push by provisioning/repairing `origin` and updating `project.json`. `/trigger` enforces `minFilesForAutoCommitPush` by reading `/.kibitz/api/project.json` (settings/github section) before pushing.

- `src/components/LlmChat/AdminView/index.tsx`
  Project settings UI. Adds a numeric field “Minimum Files Before Auto Commit/Push” that writes `settings.minFilesForAutoCommitPush` and becomes the authoritative threshold for all auto commit/push initiators.

- Docs: `KIBITZ_VERSION_CONTROL.md`, `KIBITZ_SETUP_AND_WORKFLOW.md`
  Architecture and E2E flows already reflect instant local commits and background enhancement/sync/push; map to files above.

## What the logs show and where they map
- HEAD resolution and `git status --porcelain -b` → `gitService.pushToRemote` preflight.
- Current branch `conv-p078g4-step-1` and “Executing: git push origin …” → `gitService.pushToRemote`.
- “Everything up‑to‑date” after JSON changes → JSON was regenerated post‑commit and not staged for that push (expected by design).
- “AUTO-PUSH AFTER SYNC: Push successful” → post‑sync push in `autoCommitStore`.
- “Skipping push: Below min files threshold (X < N)” → client `gitService.pushToRemote` or server orchestrator enforcing `minFilesForAutoCommitPush`.

## Storage model (where data lives, how it is stored and retrieved)
- Client state and conversations
  - Stored in browser IndexedDB `kibitz_db` (see `src/lib/db.ts`). Object stores: `projects`, `appState`, `mcpServers`, `workspaceMappings`, `conversationSettings`, `workspaceBackups`, `workspaceStats`, `autoCommitBranches`, `branchReverts`, `autoCommitAgentStatus`, `branchHistory`.
  - Read/write APIs: `loadState/saveState`, `loadMcpServers/saveMcpServers`, and specific helpers for workspaces/branches/reverts/history.
  - Data is sanitized before write: dates serialized to ISO, non‑serializable fields stripped, then rehydrated to `Date` on read.
- Repo metadata for UI and server
  - `.kibitz/api/project.json` and `.kibitz/api/branches.json` in the workspace (generated via `/api/projects/{id}/generate`, `branchService`, and commit/enhance paths). Server orchestrator also reads `project.json` for GitHub config and `minFilesForAutoCommitPush`.
- Git data
  - Real git repo on disk. All commit/diff/branch info comes from executing `git` via MCP. Orchestrator shells out directly.
- Runtime secrets
  - GitHub token/username are held in the client store and a server in‑memory vault (`/api/keys`). Server orchestrator pulls from the in‑memory vault when available.

## Why a server restarts may not show conversation or commit data
- Client‑only persistence
  - Conversations, projects, and UI state live in browser IndexedDB. The server has no database for these; on restart it cannot “fetch” them until the client rehydrates (user opens UI and `rootStore.initialize()` loads IndexedDB and reconnects MCP). Server APIs won’t reflect conversations by design.
- In‑memory server state loss
  - Orchestrator inflight cache and the in‑memory API keys vault are cleared on restart. Until the client resends keys or re‑enables sync, pushes can fail and logs show missing auth.
- Project JSON not generated yet
  - After restart, if `.kibitz/api/project.json` hasn’t been (re)generated, the orchestrator may miss `minFilesForAutoCommitPush` or other settings. Client usually POSTs `/projects/{id}/generate` after commits, but if no commit occurred yet the server lacks context.
- Path resolution race
  - `/api/github-sync/trigger` resolves project path by scanning `{projectId}_*`. If the path hasn’t been created or was moved, the route returns 404.
- Head/branch drift during rehydration
  - If the client commits during restart windows, server orchestrator may push a different head unless commit context is supplied.

Mitigations
- Persist server configuration and credentials to disk (not only memory) and reload on boot.
- On UI load, proactively POST `/api/projects/{id}/generate` and `/api/github-sync/config` to rehydrate server‑side JSON and sync config.
- Add a small “server health/config” fetch in the client and block push requests until the server reports `{ enabled, remoteUrl, authenticated }`.
- Consider optional server storage for branch/conversation summaries if server‑rendered views are needed.

## Bottlenecks/races and top mitigation options (no code)
1) Duplicate push initiators (client, server route, agent, snapshot)
   - Option A: Single push orchestrator with a per‑project in‑flight lock (memory + `project.json.sync.status`), all callers delegate.
   - Option B: Server‑first model; client never provisions/remotes, it only “requests push” (idempotent POST), server coalesces.
   - Option C: Client‑side push queue + dedupe key `{projectId|branch|head}` to drop duplicates during short windows.

2) Remote provisioning vs client auto‑add (`origin`)
   - Option A: Make the server the sole authority to add `origin`; client only pushes if `remoteUrl` exists in `project.json`.
   - Option B: Two‑phase check: if no `remoteUrl`, call trigger route; only on success attempt client push; never auto‑add in client.
   - Option C: Backoff + retry on “origin exists”/name conflicts; annotate `project.json.github.authentication.configured` before pushing.

3) Sync‑enabled defaulting to “true” when projectId cannot be parsed from path
   - Option A: Default to “disabled” on uncertainty; require `project.json.github.enabled === true` to push.
   - Option B: Resolve project context from `/.kibitz/api/project.json` rather than directory name parsing.
   - Option C: Have server expose `/api/github-sync/config?projectId=…` as the source of truth; client checks that before any push.

4) Non‑fast‑forward pushes after local rollback
   - Option A: Centralize fallback to `--force-with-lease` when local is behind and rollback flag is set in `project.json.sync`.
   - Option B: Mark a “diverged” state after rollback and require an explicit user acknowledge or a one‑time push with lease.
   - Option C: Prefer server‑route push for rollback recovery; it performs fetch/fast‑forward checks and reports clear status.

5) Branch switching concurrency (auto step‑branch vs other helpers)
   - Option A: Project‑level branch lock around `checkout` and post‑commit branch detection; only one switch at a time.
   - Option B: Single branch‑switch service; all switch/creation routes go through it; returns the final branch for callers to use.
   - Option C: After commit, re‑read `git branch --show-current` and carry that value through enhance/sync/push to avoid drift.

6) Timer window races (3s delayed sync/push while user interacts)
   - Option A: Carry `{commitHash, branchName}` from commit through the pipeline; only act if `HEAD === commitHash`.
   - Option B: Idempotent job keys for enhance/sync (e.g., `commitHash`); subsequent jobs for the same hash are no‑ops.
   - Option C: Push the branch captured at commit time; don’t re‑resolve branch at the moment of push unless HEAD changed.

7) Multiple remote URL builders (username/URL derivation scattered)
   - Option A: Single function on the server computes `remoteUrl` (from env/store); persist it in `project.json`, and reuse.
   - Option B: Client reads `remoteUrl` only; if missing, it calls the trigger route to provision rather than computing locally.
   - Option C: Add a small health check endpoint that returns `{ remoteUrl, enabled, authenticated }` for gating client pushes.

8) MCP thread reuse duplication across layers
   - Option A: Let `rootStore.executeTool` exclusively own Initialize/thread reuse; remove per‑module caches.
   - Option B: Pass a shared `thread_id` down (via context) rather than having each service resolve its own.
   - Option C: Add a lightweight “thread broker” that hands out the canonical `{serverId|projectPath} → thread_id` mapping.

9) No soft timeouts on client‑initiated pushes/syncs
   - Option A: Client uses soft deadlines (e.g., 15–30s) with user‑visible status; server retains its own hard timeouts.
   - Option B: Progressive backoff retries with bounded attempts; surface the last error into `project.json.syncStatus`.
   - Option C: Add cancel tokens to UI initiation points so aborted sessions don’t leave orphaned operations.

10) JSON regeneration vs commit ordering (“Everything up‑to‑date” after JSON changed)
   - Option A: Commit JSON before push on the next cycle: schedule “generate → stage → commit” prior to push (or document current behavior as expected).
   - Option B: Mark `.kibitz/api/project.json` as metadata not required to push immediately; push remains correct even if not staged.
   - Option C: If desired, auto‑stage `.kibitz/api/*.json` right before a push attempt when diff exists (configurable).

11) Branch naming standardization (`auto/…` vs legacy and `conv-*`)
   - Option A: Centralize naming rules/constants and update all producers to `auto/…` and `conv-*` only.
   - Option B: Ensure `syncBranches` includes `'conv-*'` everywhere (`config` and `generate` routes, client init) so step branches sync.
   - Option C: Add a one‑time migrator to rename legacy branch prefixes (optional, non‑blocking).

12) Sync trigger overlap and thrashing
   - Option A: Add a simple lock/throttle in `/api/github-sync/trigger` (e.g., skip if `syncStatus === 'syncing'` and recent).
   - Option B: Coalesce repeated triggers into a single job per `{projectId}`; subsequent requests return the in‑flight job status.
   - Option C: Store a `nextScheduled` timestamp in `project.json.sync` and skip early calls.

13) Path parsing for project resolution (fragile derivation from `…/{id}_name`)
   - Option A: Resolve project identity from `/.kibitz/api/project.json` when present; fall back to server lookup by cwd.
   - Option B: Keep a client‑side map `{projectPath → projectId}` in the store and update it on project creation/rename.
   - Option C: Expose `/api/projects/resolve?cwd=…` and cache the result on the client.

14) Threshold drift between client and server
   - Option A: Always persist `settings.minFilesForAutoCommitPush` to `/.kibitz/api/project.json` on change; server reads settings, not ad‑hoc.
   - Option B: Server exposes `/api/github-sync/config` with `minFilesForAutoCommitPush`; client and orchestrator both use it as source of truth.
   - Option C: Include `{ minFiles }` in orchestrator POST body; it validates against project.json and uses the stricter value.

## Operational safeguards and observability
- Record push/sync state per branch: `{ lastPushed, pushedHash, needsSync, syncError }` in `project.json` to guide decisions.
- Emit one structured log line per operation with IDs `{projectId, branch, head, jobId}` to connect client/server traces.
- Add a UI badge for “push in progress / syncing / diverged” to prevent confused repeat clicks.
- Log one uniform message when gating: `push-gate: below-min-files {changed}/{min}` at both client and server.

## Suggested implementation order (no code)
1) Guardrails first: single push orchestrator (or server‑first push) + per‑project in‑flight lock; centralize remote provisioning.
2) Make “sync enabled” authoritative: server config or `project.json`; default to disabled when uncertain.
3) Carry `{commitHash, branch}` through enhance/sync; gate amend/push on `HEAD === commitHash`.
4) Throttle/lock `/github-sync/trigger`; coalesce bursts.
5) Standardize branch naming and `syncBranches` coverage, then unify remote URL derivation on the server.
6) Persist and surface `minFilesForAutoCommitPush` on both client and server; add health endpoint and UI indicator.

## Acceptance checks
- Auto‑commit: when changed files ≥ min, one local commit, one enhance+sync job, one push (no dupes). When changed files < min, no commit/push occurs and logs show the gate.
- Rollback then push: non‑fast‑forward handled via lease fallback; UI shows a clear “diverged” state if it can’t push.
- Conversation branches: `conv-*` consistently included in sync; current branch pushed; batch push only as fallback.
- Toggles: disabling GitHub prevents any push/provision actions; re‑enabling resumes without manual steps.


## Top missed‑commit causes: why they’re bad, concrete examples, and solutions

### 1) Head/branch drift during the delay window (items 5/6)
Why it’s bad
- Background enhance/sync/push run a few seconds after the local commit. If a branch switch (or another auto step) happens in that window, HEAD no longer points to the intended commit/branch. The job may push a different branch or skip pushing the just‑created commit.

Example
- T0: Auto‑commit on `conv-A-step-3` creates commit C1. T0+1s: user switches to `main` (or auto creates `conv-A-step-4`). T0+3s: delayed push resolves current branch as `main` and pushes it. C1 remains local on `conv-A-step-3`, appears “missed”.

Solutions (all applicable)
- Carry commit context: propagate `{commitHash, branchName}` through enhance/sync/push and only act if `HEAD === commitHash`.
- Lock/serialize branch switches: a project‑level lock around `checkout` and post‑commit detection; only one switch while an enhance/push job for a fresh commit is pending.
- Idempotent jobs: key background jobs by `commitHash`; subsequent jobs with the same key are no‑ops; jobs abort if HEAD changed.

### 2) Non‑fast‑forward after rollback (item 4)
Why it’s bad
- A local rollback rewrites history. The next push is rejected as non‑fast‑forward unless handled. Some paths retry with `--force-with-lease`, others only log and stop, so the commit seems “not pushed”.

Example
- User rolls back `conv-B-step-2` to an older SHA R. Creates new commit C2. Push from one path logs “rejected (non‑fast‑forward)” and exits; another path doesn’t retry. Remote never sees C2.

Solutions (all applicable)
- Centralize push fallback: all push callers route through one helper that, on non‑fast‑forward, retries with `--force-with-lease` and records the event.
- Diverged state flag: after rollback, set a `diverged: true` marker and require either explicit user confirm for the lease push or one automatic lease push (with clear logs/UI state).
- Prefer server‑side push for recovery: the server route can `fetch`/compare and return explicit guidance; client calls it instead of attempting raw push.

### 3) Duplicate push initiators and overlapping sync (items 1/12)
Why it’s bad
- Multiple actors (client post‑sync push, server trigger push, agent end‑cycle push) can fire concurrently. They may race, exit early as “up‑to‑date”, or step on each other’s remotes. Net effect: the intended commit isn’t pushed in that cycle.

Example
- Commit lands; client schedules a push; meanwhile `/github-sync/trigger` provisions and pushes `--all`; agent also attempts a push. One returns “Everything up‑to‑date”, another fails on auth header differences, and the third never runs due to a temporary lock—leaving the perception that the commit never made it.

Solutions (all applicable)
- Single push orchestrator: per‑project in‑flight lock + queue; every push request funnels through it (dedupe key `{projectId|branch|head}`); returns unified status.
- Server‑first pushes: clients never add remotes or push directly; they request a push from the server (idempotent). The server coalesces overlapping requests.
- Trigger throttle/lock: `/github-sync/trigger` maintains a short lock and coalesces bursts; returns the status of the in‑flight job instead of starting new work.

