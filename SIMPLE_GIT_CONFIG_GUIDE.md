# Simple Git Configuration Guide for Engineers

This is a simplified guide for engineers to quickly configure Git credentials for testing.

## Quick Setup (For Your Engineer)

### Option 1: Environment Variables (Recommended)
Set these environment variables before running Docker:

```bash
export GITHUB_TOKEN="your_github_token_here"
export GIT_USER_NAME="Your Name"
export GIT_USER_EMAIL="your.email@example.com"
export GITHUB_USERNAME="your_github_username"
```

### Option 2: .env File
Create a `.env` file in the root directory:

```bash
# GitHub Authentication
GITHUB_TOKEN=your_github_token_here
GH_TOKEN=your_github_token_here

# Git User Configuration  
GIT_USER_NAME=Your Name
GIT_USER_EMAIL=your.email@example.com
GITHUB_USERNAME=your_github_username
```

## Default Values
If no environment variables are set, the system uses:
- **Name**: malikrohail
- **Email**: malikrohail525@gmail.com
- **Username**: malikrohail

## Running Docker
```bash
# Development
cd docker/compose
docker-compose -f docker-compose.dev.yml up --build

# Production  
cd docker/compose
docker-compose up --build
```

## Testing Git Operations
Once running, test in the container:
```bash
docker exec -it kibitz-production /app/scripts/test-git-auth.sh
```

## Common Issues
1. **"Author identity unknown"** → Set `GIT_USER_NAME` and `GIT_USER_EMAIL`
2. **"Authentication failed"** → Set `GITHUB_TOKEN` with correct permissions
3. **"Permission denied"** → Verify token has `repo` scope

That's it! Simple and configurable.