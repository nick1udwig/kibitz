# Docker Setup Guide

This guide explains how to set up and run the application using Docker, including how to configure Git credentials and GitHub authentication.

## Prerequisites

- Docker installed on your system
- GitHub account and Personal Access Token


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

3. **Start the Application**
   ```bash
   cd docker/compose
   docker-compose up --build
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

2. Add the token to your environment:
   - Open/create `.env` file in the `docker/config` directory
   - Add your GitHub token:
     ```env
     GITHUB_TOKEN=your_token_here
     ```

### 2. Git Configuration

The application uses a custom Git configuration script (`git-setup.sh`) that:
- Configures Git credentials
- Sets up GitHub authentication
- Configures Git defaults

Required environment variables:
```env
GIT_USER_NAME="your-name"
GIT_USER_EMAIL="your-email"
GITHUB_TOKEN="your-github-token"
```

### 3. Docker Commands

docker-compose up --build
