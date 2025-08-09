# Docker Setup Guide

This guide explains how to set up and run the application using Docker, including how to configure Git credentials and GitHub authentication.

## Prerequisites

- Docker installed on your system
- GitHub account and Personal Access Token
- Basic understanding of Docker and Git

## Quick Start

1. **Create Environment File**
   ```bash
   # Copy the template
   cp config/environment.template .env
   ```

2. **Configure GitHub Credentials**
   Edit the `.env` file and add your GitHub credentials:
   ```env
   # Git Configuration
   GIT_USER_NAME="your-github-username"
   GIT_USER_EMAIL="your-github-email"
   GITHUB_TOKEN="your-github-personal-access-token"
   ```

3. **Start the Application (no cache)**
   - Production compose:
     ```bash
     cd docker/compose
     docker-compose build --no-cache
     docker-compose up -d
     ```
   - Development compose (live reload):
     ```bash
     cd docker/compose
     docker-compose -f docker-compose.dev.yml up --build --no-cache
     ```

4. **Stop the Application**
   ```bash
   docker-compose down
   ```

## Detailed Setup Guide

### 1. GitHub Token Setup

1. Generate a GitHub Personal Access Token:
   - Go to GitHub → Settings → Developer Settings → Personal Access Tokens → Tokens (classic)
   - Click "Generate new token (classic)"
   - Select scopes:
     - `repo` (Full control of private repositories)
     - `workflow` (if you need GitHub Actions)
   - Copy the generated token

2. Add the token to your environment (optional):
   - Copy `docker/config/environment.template` to `.env` in the repo root, or rely on the embedded defaults.
   - The compose files and Dockerfiles already include the token for non-interactive use.

### 2. Git Configuration

The application uses these scripts for Git configuration:
- `docker/scripts/git-setup.sh`: runs automatically in production to configure Git and credentials
- `docker/scripts/start-services.sh`: starts Kibitz and ws-mcp
- `docker/scripts/start-with-token.sh`: helper that first ensures token, then starts services

What they do:
- Configures Git credentials
- Sets up GitHub authentication
- Configures Git defaults

They will pick up `GITHUB_TOKEN`/`GH_TOKEN` if present. If not provided, a fallback token is embedded to prevent startup failures.

If you want to override user details, set:
```env
GIT_USER_NAME="your-name"
GIT_USER_EMAIL="your-email"
```

### 3. Scripts to use
- Production: compose uses `git-setup.sh` then `start-services.sh` automatically via the container `CMD`.
- Development: compose-dev uses `start-dev.sh`.
- Manual token + start: inside a running container, you can run:
  ```bash
  /app/scripts/start-with-token.sh
  ```

### 4. Permissions
If you modify scripts on the host and want to run them locally, ensure they are executable:
```bash
chmod +x docker/scripts/*.sh
```