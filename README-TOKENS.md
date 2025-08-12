## Token and Identity Setup (for Commit/Push Testing)

Use this short guide to configure your local environment for commits and GitHub pushes. This file is separate from the main `README.md`.

### What you need
- A GitHub Personal Access Token (repo scope)
- Your GitHub username
- Your git identity (name and email)
- An absolute path on disk for project workspaces

### Steps
1) Create a file named `.env.local` at the repo root (this file is git‑ignored).
2) Copy the template below with all values empty, then fill in your own values.
3) Save, then restart the dev server (`npm run dev`).
4) In the app, open Settings → Keys to confirm credentials, enable GitHub Sync, make a small change, commit, and verify the push.

### .env.local template (fill your values)

```
# Workspace (absolute path)
PROJECT_WORKSPACE_PATH=
USER_PROJECTS_PATH=

# Git identity
GIT_USER_NAME=
GIT_USER_EMAIL=

# GitHub auth (set at least one token)
GITHUB_TOKEN=
GH_TOKEN=
GITHUB_USERNAME=

# Optional: UI hint for projects directory (display only)
NEXT_PUBLIC_PROJECTS_DIR=
```

Notes
- The server reads `GITHUB_TOKEN` first, then `GH_TOKEN`.
- Do not commit `.env.local` (it is already git‑ignored).
- Workspace path resolution priority is: `PROJECT_WORKSPACE_PATH`, then `USER_PROJECTS_PATH`, then `NEXT_PUBLIC_PROJECTS_DIR` (UI hint), otherwise a local default.


