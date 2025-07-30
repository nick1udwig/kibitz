# Kibitz Docker Setup

This directory contains a complete containerized setup for Kibitz LLM Chat + ws-mcp WebSocket service, following industry best practices for Docker deployment.

## 🚀 Quick Start

### Prerequisites

- Docker 20.10+ installed
- Docker Compose 2.0+ (optional, for compose setup)
- At least 8GB RAM available
- 4+ CPU cores recommended

### Basic Usage

1. **Build the production image:**
   ```bash
   ./docker/scripts/build.sh --prod
   ```

2. **Create projects directory:**
   ```bash
   mkdir -p user/gitrepo/projects
   ```

3. **Run production container:**
   ```bash
   ./docker/scripts/run-prod.sh --detached
   ```

4. **Access Kibitz:**
   - Frontend: http://localhost:3000
   - WebSocket MCP: ws://localhost:10125

## 📁 Directory Structure

```
docker/
├── compose/                    # Docker Compose configurations
│   ├── docker-compose.yml     # Production setup
│   └── docker-compose.dev.yml # Development setup
├── config/                     # Configuration files
│   ├── ws-mcp-config.json     # WebSocket MCP configuration
│   └── environment.template   # Environment variables template
├── scripts/                    # Automation scripts
│   ├── build.sh              # Build Docker images
│   ├── run-prod.sh           # Run production container
│   ├── run-dev.sh            # Run development container
│   ├── start-services.sh     # Production startup script
│   └── start-dev.sh          # Development startup script
├── volumes/                    # Persistent data (created automatically)
│   ├── data/                 # Database and app data
│   └── logs/                 # Application logs
├── Dockerfile                  # Production multi-stage build
├── Dockerfile.dev             # Development optimized build
├── .dockerignore              # Build optimization
└── README.md                  # This file
```

## 🛠️ Build Options

### Production Build
```bash
# Standard production build
./docker/scripts/build.sh --prod

# Build with no cache (clean build)
./docker/scripts/build.sh --prod --no-cache

# Quiet build (minimal output)
./docker/scripts/build.sh --prod --quiet
```

### Development Build
```bash
# Development build with debugging tools
./docker/scripts/build.sh --dev

# Development build with no cache
./docker/scripts/build.sh --dev --no-cache
```

## 🔧 Running Containers

### Production Environment

```bash
# Run in detached mode (recommended)
./docker/scripts/run-prod.sh --detached

# Run with custom ports
./docker/scripts/run-prod.sh --port 8080 --ws-port 8081

# Run with custom projects directory
./docker/scripts/run-prod.sh --projects-dir /path/to/your/projects

# Run in foreground (for debugging)
./docker/scripts/run-prod.sh
```

### Development Environment

```bash
# Run development container with live reloading
./docker/scripts/run-dev.sh --detached

# Run with ws-mcp development
./docker/scripts/run-dev.sh --ws-mcp-dir /path/to/ws-mcp

# Run with debugging port
./docker/scripts/run-dev.sh --debug-port 9230
```

## 🐳 Docker Compose Usage

### Production with Docker Compose

1. **Navigate to compose directory:**
   ```bash
   cd docker/compose
   ```

2. **Copy environment template:**
   ```bash
   cp ../config/environment.template .env
   # Edit .env with your settings
   ```

3. **Start services:**
   ```bash
   docker-compose up -d
   ```

4. **View logs:**
   ```bash
   docker-compose logs -f
   ```

5. **Stop services:**
   ```bash
   docker-compose down
   ```

### Development with Docker Compose

```bash
cd docker/compose
docker-compose -f docker-compose.dev.yml up -d
```

## 🔒 Security Features

The Docker setup includes several security best practices:

- **Non-root user**: Containers run as unprivileged user
- **Capability dropping**: Only essential capabilities retained
- **No new privileges**: Prevents privilege escalation
- **Read-only mounts**: Configuration files mounted read-only
- **Resource limits**: CPU and memory constraints
- **Network isolation**: Custom bridge network

## 📂 Volume Management

### Persistent Data

- **Database**: `docker/volumes/data/` - Contains SQLite databases
- **Logs**: `docker/volumes/logs/` - Application and service logs
- **Projects**: `user/gitrepo/projects/` - LLM workspace (configurable)

### Development Volumes

- **Source code**: Live mounted for hot reloading
- **Node modules**: Cached volume for faster restarts
- **Configuration**: Live mounted configuration files

## 🔍 Monitoring & Debugging

### View Logs

```bash
# Production container logs
docker logs -f kibitz-production

# Development container logs
docker logs -f kibitz-development

# Real-time log following
docker logs --tail 100 -f <container-name>
```

### Health Checks

```bash
# Check container health
docker ps --filter "name=kibitz"

# Inspect health status
docker inspect --format='{{.State.Health.Status}}' kibitz-production
```

### Node.js Debugging (Development)

1. Start development container with debugging enabled
2. Open Chrome and navigate to `chrome://inspect`
3. Click "Open dedicated DevTools for Node"
4. Connect to `localhost:9229`

## 🌐 WebSocket Configuration

The ws-mcp service provides WebSocket endpoints for MCP (Model Context Protocol) integration. Configuration is handled via `docker/config/ws-mcp-config.json`.

### Default Configuration

- **Host**: `0.0.0.0` (all interfaces)
- **Port**: `10125`
- **Workspace**: `/app/projects`
- **CORS**: Enabled for all origins (development)

### Custom Configuration

Edit `docker/config/ws-mcp-config.json` to customize:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/app/projects"]
    }
  },
  "server": {
    "host": "0.0.0.0",
    "port": 10125
  }
}
```

## 🚀 Performance Optimization

### Resource Allocation

Default production limits:
- **CPU**: 4 cores (limit), 2 cores (reservation)
- **Memory**: 8GB (limit), 4GB (reservation)

Adjust in docker-compose.yml or via environment variables:

```yaml
deploy:
  resources:
    limits:
      cpus: '6'
      memory: 12G
    reservations:
      cpus: '4'
      memory: 8G
```

### Build Optimization

- Multi-stage builds reduce final image size
- Layer caching optimizes rebuild times
- `.dockerignore` excludes unnecessary files
- Production builds exclude development dependencies

## 🛠️ Troubleshooting

### Common Issues

1. **Port conflicts**:
   ```bash
   # Check what's using ports
   lsof -i :3000
   lsof -i :10125
   
   # Use different ports
   ./docker/scripts/run-prod.sh --port 3001 --ws-port 10126
   ```

2. **Permission issues with mounted volumes**:
   ```bash
   # Fix ownership
   sudo chown -R $USER:$USER user/gitrepo/projects
   ```

3. **Out of disk space**:
   ```bash
   # Clean up Docker resources
   docker system prune -a
   docker volume prune
   ```

4. **WebSocket connection issues**:
   - Check firewall settings for port 10125
   - Verify ws-mcp configuration
   - Check container logs for errors

### Debug Commands

```bash
# Container inspection
docker inspect kibitz-production

# Execute commands in running container
docker exec -it kibitz-production bash

# Check resource usage
docker stats kibitz-production

# Network debugging
docker network ls
docker network inspect kibitz-network
```

## 🔄 Updates & Maintenance

### Updating Images

```bash
# Rebuild with latest changes
./docker/scripts/build.sh --prod --no-cache

# Stop and restart containers
docker stop kibitz-production
./docker/scripts/run-prod.sh --detached
```

### Backup Data

```bash
# Backup database
cp docker/volumes/data/kibitz.db backup/kibitz-$(date +%Y%m%d).db

# Backup logs
tar -czf backup/logs-$(date +%Y%m%d).tar.gz docker/volumes/logs/
```

## 📚 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KIBITZ_PORT` | `3000` | Kibitz frontend port |
| `WS_MCP_PORT` | `10125` | WebSocket MCP port |
| `USER_PROJECTS_PATH` | `./user/gitrepo/projects` | Projects directory |
| `NODE_ENV` | `production` | Node.js environment |
| `SECURE_MODE` | `true` | Enable security features |
| `DATABASE_PATH` | `/app/kibitz/data/kibitz.db` | Database file path |
| `LOGS_PATH` | `/app/logs` | Logs directory |

## 🤝 Contributing

When modifying the Docker setup:

1. Test both production and development builds
2. Update documentation for any new features
3. Follow security best practices
4. Test volume mounts and networking
5. Verify cross-platform compatibility

## 📄 License

This Docker configuration follows the same license as the main Kibitz project. 