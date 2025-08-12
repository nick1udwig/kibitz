## Kibitz MVP Checkpoint and Enhancement Plan

### Purpose
Baseline snapshot of the MVP state to anchor future enhancements. Use this as the reference document for next steps and verification. For deeper architecture and operations, see `KIBITZ_SETUP_AND_WORKFLOW.md`.

---

## MVP Scope (completed)

- Project workspace detection and path resolution
- Local Git repo init, commit, branch management (auto and conversation)
- Background GitHub provisioning and sync
- Non-blocking auto-commit pipeline with background enhancement and JSON generation
- Conversation metadata persistence and branch UX

---

## Operational Flows (MVP)

- Commit
  - Local commit created immediately (fast path)
  - Background job generates diff, LLM message, updates project JSON, opportunistic amend
  - Optional GitHub sync and push after JSON is generated

- Rollback
  - UI path uses safe `git reset --hard <hash>` for selected commit
  - Advanced rollback services are available but not wired by default (preview/stash/backup)

---

## Known Issues and Fix Plan

- LLM commit message not appearing in Git history or UI
  - Root causes:
    - Opportunistic amend is skipped when HEAD moves (expected with non-blocking pipeline)
    - Project JSON update endpoint receives `projectId = unknown` in enhanced processing, so LLM metadata is not saved to `project.json`
    - Provider API key missing or provider unset results in fallback messages
  - Fix plan:
    - Include real `projectId` in the enhanced processing request so the server route updates the correct `project.json`
    - Add a safe fallback when amend is skipped: create a small follow-up commit with the LLM message, or persist it in metadata and surface in UI
    - Defer first push briefly or throttle background commits to increase amend success rate
    - Add clear health checks and user-visible indicators for provider/config state

---

## Verification Checklist

1) Environment and provider
- Confirm `GITHUB_TOKEN`/`GH_TOKEN`, `GITHUB_USERNAME`, `GIT_USER_NAME`, `GIT_USER_EMAIL`, and `PROJECT_WORKSPACE_PATH`
- Set per-project provider and API key in the UI settings (Anthropic/OpenAI/OpenRouter)

2) Auto-commit
- Make an edit; observe immediate local commit
- Background enhancement logs: diff generated → LLM message generated → JSON update enqueued

3) LLM commit message
- If HEAD unchanged before background job completes, commit is amended with the LLM message
- Otherwise: verify message appears in `project.json` and UI. If not, ensure enhanced processing posts to the correct `/api/projects/<id>/enhanced-commit`

4) GitHub sync
- After commit and JSON generation, trigger sync and verify remote creation/push

---

## Enhancement Backlog (prioritized)

1) LLM amend resiliency
- Add follow-up commit fallback when amend is skipped
- Short defer/throttle to improve amend probability

2) Enhanced processing request integrity
- Pass `projectId` in enqueue request; type-check on both sides
- Add guardrails: if `projectId` missing, buffer under the real id or block post

3) Provider/Model UX
- Surface provider/key/model health in the UI and in logs
- Make minimal “mini/haiku” commit-model choice explicit and configurable

4) Sync robustness
- In-process throttle/lock for `/api/github-sync/trigger`
- Prefer pushing only current/changed branches with a single batch fallback

5) Metadata completeness
- Persist per-branch upstream state, last push, and conversation chain info
- Capture LLM provenance per commit in `project.json`

---

## Quick Commands and Endpoints

- Generate `project.json`: POST `/api/projects/<id>/generate`
- GitHub config: POST `/api/github-sync/config` (enabled true); GET `/api/github-sync/config?projectId=<id>`
- Trigger sync: POST `/api/github-sync/trigger` with `{ projectId, immediate: true }`
- Enhanced commit update: POST `/api/projects/<id>/enhanced-commit` with `{ branchName, commitInfo }`

---

## MVP Exit Criteria (for changes post-checkpoint)

- Local commit remains instant; background job stability at or above 95% success on LLM generation
- LLM commit message appears in either Git (amend or follow-up) or project metadata consistently
- GitHub sync completes for `main`, `auto/*`, and `conv-*` branches


