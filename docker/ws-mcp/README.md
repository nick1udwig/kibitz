## ws-mcp Docker setup for Kibitz

This folder contains the containerization for the Workspace MCP server used by Kibitz. It runs the MCP server in Docker and bind-mounts your local projects directory so commands sent by Kibitz operate on your files.

The goal: Kibitz (Next.js app) generates absolute host paths for projects and sends shell commands to ws-mcp. The container must see the exact same paths via bind mounts.


### 1) Choose your projects base directory (host)

- Pick a directory on your host that will hold all Kibitz projects. Examples:
  - macOS: `/ABS/PATH/TO/PROJECTS` (e.g., `/Users/yourname/Projects/workspaces`)
- Create the directory if it does not exist.


### 2) Configure the Kibitz app (.env.local)

Create or edit `.env.local` at the Kibitz repo root. Set all three so both server and client agree on the same base path, and set an encryption secret for secure persistence of settings.

```
PROJECT_WORKSPACE_PATH=/ABS/PATH/TO/PROJECTS
USER_PROJECTS_PATH=/ABS/PATH/TO/PROJECTS

# Enables encrypted persistence of minimal server config (GitHub creds, projectsBaseDir)
# Generate a strong random string (examples below)
KIBITZ_CONFIG_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
```

Generate a secret:

```
openssl rand -base64 48
# or
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

After editing, restart the Kibitz app (dev server or production process).


### 3) Configure Docker bind mounts

This compose file binds your host projects directory into the container in two ways:

1) At `/workspace` (generic mount some tools expect)
2) At the identical absolute path as on the host (so no path translation is needed)

Edit `docker-compose.yml` and replace the hardcoded path with your chosen base path in both lines below:

```yaml
services:
  ws-mcp:
    volumes:
      - "/ABS/PATH/TO/PROJECTS:/workspace:rw"
      - "/ABS/PATH/TO/PROJECTS:/ABS/PATH/TO/PROJECTS:rw"
```

Notes:
- These two mounts are intentionally redundant. Kibitz will pass absolute host paths; mapping the identical path ensures the container can access them without rewriting. The `/workspace` mount is kept for tools that expect that path.
- If you prefer to parameterize, you can create a Compose `.env` file with `PROJECTS_HOST_DIR=/ABS/PATH/TO/PROJECTS` and change the lines to `- "${PROJECTS_HOST_DIR}:${PROJECTS_HOST_DIR}:rw"` and `- "${PROJECTS_HOST_DIR}:/workspace:rw"`.


### 4) Build and run the container

From the Kibitz repo root (or this folder), run:

```
docker compose -f docker/ws-mcp/docker-compose.yml up -d --build
```

Verify mounts inside the container:

```
docker exec -it ws-mcp-server bash -lc 'test -d /ABS/PATH/TO/PROJECTS && echo OK || echo MISSING'
```

You should see `OK`.


### 5) Configure in-app settings (UI)

Open Kibitz → API Settings page.

- Projects Base Directory: set to your exact `/ABS/PATH/TO/PROJECTS` and click Save.
  - With `KIBITZ_CONFIG_SECRET` set, this value is stored encrypted in `data/server-config.json.enc`.
  - This also sets an in-memory override immediately; Kibitz uses it without restart.
- Provider API keys (e.g., Anthropic/OpenAI/Groq): paste keys and Save.
- GitHub settings (token, username, email) as needed.

Security note: The UI submits to the app’s `/api/keys/config` endpoint. To protect secrets in transit, access the UI over HTTPS (see Section 7). The server stores minimal config encrypted at rest using your `KIBITZ_CONFIG_SECRET`.


### 6) How path resolution works (and where defaults exist)

- Client/server compute the base dir via:
  - `src/lib/server/pathConfigServer.ts` (server)
  - `src/lib/pathConfig.ts` (client)
- Precedence: `PROJECT_WORKSPACE_PATH` or `USER_PROJECTS_PATH` → in-memory/persisted override (UI Save) → `NEXT_PUBLIC_PROJECTS_DIR` → a development fallback.



```
# Build and start ws-mcp
docker compose -f docker/ws-mcp/docker-compose.yml up -d --build

# View logs
docker logs -f ws-mcp-server

# Exec into container
docker exec -it ws-mcp-server bash

# Recreate after changing compose
docker compose -f docker/ws-mcp/docker-compose.yml up -d --force-recreate
```

### 10) File index (relevant bits)

- `docker/ws-mcp/Dockerfile` — image build for the MCP server
- `docker/ws-mcp/docker-compose.yml` — container service with bind mounts
- `data/server-config.json.enc` — encrypted persisted config (created after you Save in UI with `KIBITZ_CONFIG_SECRET` set)
- `src/lib/server/pathConfigServer.ts`, `src/lib/pathConfig.ts` — base-dir resolution logic (envs/UI override → fallback)


### 11) Security notes

- Do not commit real secrets. Use `.env.local` (ignored by VCS) and the UI Save (which stores encrypted at rest).
- Use HTTPS for the UI/API in any shared or production environment.

---

If you customize paths or ports, update both the `.env.local` and UI. Always prefer absolute paths and keep the host and container paths identical to avoid path translation.


