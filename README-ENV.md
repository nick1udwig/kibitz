Environment configuration (single source of truth)

Where to set variables
- Place all local settings in `.env.local` at the repo root. This file is git-ignored and overrides `.env`.

Required
- PROJECT_WORKSPACE_PATH: Absolute path where Kibitz creates project workspaces.
- GH_TOKEN, GITHUB_TOKEN: GitHub personal access token (either is fine; the server reads GITHUB_TOKEN || GH_TOKEN).
- GITHUB_USERNAME: GitHub username used for repository creation.
- GIT_USER_NAME, GIT_USER_EMAIL: Git identity for local commits.

Optional (UI only)
- NEXT_PUBLIC_PROJECTS_DIR: Shown in the frontend; doesn’t affect server operations.

Example .env.local
```
PROJECT_WORKSPACE_PATH=/Users/test/Downloads/shim
NEXT_PUBLIC_PROJECTS_DIR=/Users/test/Downloads/shim

GH_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
GITHUB_USERNAME=your_username
GIT_USER_NAME=Your Name
GIT_USER_EMAIL=you@example.com
```

How it’s used
- All project paths are resolved via `src/lib/pathConfig.ts` (single source of truth).
- GitHub sync in `src/app/api/github-sync/trigger/route.ts` ensures the remote repo exists (via GitHub REST using GITHUB_TOKEN), sets the origin, and pushes.
- UI toggle `src/components/GitHubSyncToggle.tsx` defaults to ON and will auto-configure and trigger sync on load.

Notes
- After changing `.env.local`, restart the dev server.
- If gh CLI is available, it may be used; otherwise REST fallback is used. Errors will surface as HTTP 500 from the sync API instead of reporting success.


Server credential persistence
- Set `KIBITZ_CONFIG_SECRET` to enable AES-256-GCM encryption for persisted server credentials.
- On save via `/api/keys`, the server writes `data/server-config.json.enc` (or `KIBITZ_SERVER_CONFIG_PATH`).
- On boot, the server restores credentials using precedence: environment > in-memory vault > persisted file.
- Optional overrides:
  - `KIBITZ_SERVER_CONFIG_PATH`: absolute path to encrypted file
  - `KIBITZ_DATA_DIR`: base directory for data files (default: `<repo>/data` if present)


