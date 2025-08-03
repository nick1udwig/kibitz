# Docker Git Credentials Setup Guide

This guide explains how to configure Git credentials for your Kibitz Docker container to enable GitHub operations like push, pull, and repository creation.

## Problem Summary

When running Kibitz in a Docker container, the container is isolated from your host machine's Git configuration and credentials. This causes Git operations to fail because the container cannot authenticate with GitHub.

## Solution Overview

We've implemented a comprehensive solution that includes:

1. **Git Credential Helper**: Custom script that uses environment variables for authentication
2. **Environment Variable Support**: Secure way to pass GitHub tokens to the container
3. **Automatic Git Configuration**: Docker container automatically configures Git on startup
4. **Development & Production Support**: Works in both dev and production Docker environments

## Setup Instructions

### Step 1: Get Your GitHub Personal Access Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Select scopes:
   - `repo` (Full control of private repositories)
   - `workflow` (Update GitHub Action workflows)
   - `write:packages` (Upload packages to GitHub Package Registry)
4. Copy the generated token (you won't see it again!)

### Step 2: Configure Environment Variables

#### Option A: Using .env file (Recommended)

1. Copy the environment template:
   ```bash
   cp docker/config/environment.template .env
   ```

2. Edit `.env` file and add your GitHub token:
   ```bash
   # Git and GitHub Configuration
   GITHUB_TOKEN=ghp_your_github_token_here
   GH_TOKEN=ghp_your_github_token_here  # Alternative for some tools
   GITHUB_USERNAME=your_github_username
   ```

#### Option B: Export environment variables

```bash
export GITHUB_TOKEN="ghp_your_github_token_here"
export GH_TOKEN="ghp_your_github_token_here"
export GITHUB_USERNAME="your_github_username"
```

### Step 3: Start Docker Container

#### For Development:
```bash
cd docker/compose
docker-compose -f docker-compose.dev.yml up --build
```

#### For Production:
```bash
cd docker/compose
docker-compose up --build
```

### Step 4: Verify Git Authentication

1. Access the running container:
   ```bash
   docker exec -it kibitz-production bash
   # or for development
   docker exec -it kibitz-development bash
   ```

2. Test Git authentication:
   ```bash
   # Test if Git can authenticate with GitHub
   git ls-remote https://github.com/octocat/Hello-World.git
   
   # Check Git configuration
   git config --global --list | grep credential
   ```

## How It Works

### Git Credential Helper

The custom credential helper (`docker/scripts/git-credential-helper.sh`) intercepts Git authentication requests and provides credentials from environment variables:

- Responds to Git credential requests for `github.com`
- Uses `GITHUB_TOKEN` or `GH_TOKEN` environment variables
- Logs authentication attempts for debugging

### Git Configuration

The Docker container automatically configures Git with:

```bash
git config --global credential.helper "/app/scripts/git-credential-helper.sh"
git config --global user.name "Kibitz Agent"
git config --global user.email "agent@kibitz.ai"
git config --global init.defaultBranch main
git config --global pull.rebase false
```

### Environment Variable Flow

1. Host `.env` file or environment variables
2. Docker Compose passes to container
3. Git credential helper reads from container environment
4. Git operations authenticate successfully

## Troubleshooting

### Common Issues

1. **"Authentication failed" errors**
   - Check if `GITHUB_TOKEN` is set correctly
   - Verify token has correct permissions
   - Check token hasn't expired

2. **"Permission denied" errors**
   - Ensure token has `repo` scope
   - Check if you have access to the repository

3. **"Credential helper not found" errors**
   - Verify `/app/scripts/git-credential-helper.sh` is executable
   - Check Docker build completed successfully

### Debug Commands

```bash
# Check environment variables in container
docker exec -it kibitz-production env | grep GITHUB

# Check Git configuration
docker exec -it kibitz-production git config --global --list

# Test credential helper directly
docker exec -it kibitz-production /app/scripts/git-credential-helper.sh get

# Check script permissions
docker exec -it kibitz-production ls -la /app/scripts/git-credential-helper.sh
```

### Manual Testing

To test Git operations manually in the container:

```bash
# Enter container
docker exec -it kibitz-production bash

# Test cloning a repository
cd /tmp
git clone https://github.com/octocat/Hello-World.git

# Test authentication with your own repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
```

## Security Notes

1. **Token Security**: Never commit tokens to version control
2. **Environment Files**: Add `.env` to `.gitignore`
3. **Token Scope**: Use minimum required permissions
4. **Token Rotation**: Regularly rotate GitHub tokens
5. **Container Logs**: Tokens are not logged in credential helper

## Integration with Kibitz Features

After setup, the following Kibitz features will work in Docker:

- ✅ Auto-commit and branch management
- ✅ GitHub repository creation
- ✅ Push/pull operations
- ✅ GitHub sync functionality
- ✅ Rollback and checkpoint features

## Files Modified

- `docker/Dockerfile` - Added Git configuration
- `docker/scripts/git-credential-helper.sh` - New credential helper
- `docker/config/environment.template` - Added Git environment variables
- `docker/compose/docker-compose.yml` - Added environment variable mapping
- `docker/compose/docker-compose.dev.yml` - Added environment variable mapping

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review Docker container logs: `docker logs kibitz-production`
3. Test Git operations manually in the container
4. Verify environment variables are set correctly