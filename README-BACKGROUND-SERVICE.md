# GitHub Background Sync Service

A comprehensive background service for automatically syncing your projects to GitHub with queue management, API control, and persistent storage.

## 🚀 **Overview**

This system provides:
- **Background Scheduler**: Continuously monitors projects and syncs changes
- **REST API**: Full control over sync operations from your frontend
- **Persistent Queue**: Survives service restarts with SQLite storage
- **Concurrency Control**: Handles multiple syncs simultaneously with limits
- **Error Handling**: Exponential backoff retry logic with GitHub rate limiting
- **Real-time Monitoring**: Track sync status, history, and performance

## 📦 **Components**

### Core Services
- `github-sync-scheduler.js` - Background sync scheduler with queue management
- `github-sync-api.js` - REST API server for frontend control
- `github-sync-manager.js` - Main sync orchestrator (from previous chunk)
- `project-json-manager.js` - Project metadata management (from previous chunk)
- `sync-detection-service.js` - Change detection and project scanning (from previous chunk)
- `git-executor.js` - Git/GitHub command execution via MCP (from previous chunk)

### Testing & Demos
- `test-background-service.js` - Comprehensive test suite
- `demo-background-service.js` - Interactive demo and examples
- `test-project-creation-v2.js` - Schema integration verification

## 🛠️ **Installation**

### Prerequisites
```bash
npm install better-sqlite3 express cors
```

### Dependencies
All modules from previous chunks:
- Project JSON Manager (v2 schema support)
- Sync Detection Service
- Git Executor
- GitHub Sync Manager

### Setup
1. Ensure your projects use v2 schema (automatic for new projects)
2. Configure GitHub authentication
3. Start the background service

## ⚙️ **Configuration**

### Basic Configuration
```javascript
const config = {
  // API Server
  port: 3001,
  host: 'localhost',
  corsOrigin: 'http://localhost:3000',
  
  // Scheduler Options
  schedulerOptions: {
    scanInterval: 300000,      // 5 minutes between scans
    maxConcurrentSyncs: 3,     // Max simultaneous syncs
    maxRetries: 3,             // Retry failed syncs
    retryDelay: 30000,         // 30 seconds base retry delay
    rateLimitDelay: 60000,     // 1 minute for rate limits
    dbPath: './data/sync-queue.db'  // Queue persistence
  }
};
```

### Project Configuration
Enable GitHub sync for projects:
```javascript
import { updateGitHubConfig } from './project-json-manager.js';

await updateGitHubConfig(projectPath, {
  enabled: true,
  remoteUrl: 'https://github.com/user/repo.git',
  syncBranches: ['main', 'auto/*'],
  authentication: {
    type: 'token',
    configured: true
  }
});
```

## 🚀 **Usage**

### 1. Start the Service

#### Programmatic Start
```javascript
import { createSyncAPI } from './github-sync-api.js';

// Start API server (includes scheduler)
const api = await createSyncAPI(mcpClient, {
  port: 3001,
  schedulerOptions: {
    scanInterval: 300000,  // 5 minutes
    maxConcurrentSyncs: 3
  }
});

// Start the sync scheduler
await fetch('http://localhost:3001/api/sync/start', { method: 'POST' });
```

#### Command Line Demo
```bash
# Run interactive demo
node demo-background-service.js

# Test the complete system
node test-background-service.js

# Run performance tests
node test-background-service.js --performance
```

### 2. Control via API

#### Service Control
```javascript
// Start sync service
const start = await fetch('http://localhost:3001/api/sync/start', {
  method: 'POST'
});

// Get service status
const status = await fetch('http://localhost:3001/api/sync/status');
const data = await status.json();
console.log('Queue size:', data.status.scheduler.stats.queueSize);

// Stop service
const stop = await fetch('http://localhost:3001/api/sync/stop', {
  method: 'POST'
});
```

#### Trigger Syncs
```javascript
// Trigger scan for all projects
const triggerAll = await fetch('http://localhost:3001/api/sync/trigger', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ immediate: true })
});

// Trigger specific project sync
const triggerProject = await fetch('http://localhost:3001/api/sync/trigger/projectId', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ immediate: true, priority: 10 })
});
```

#### Monitor Activity
```javascript
// Get current queue
const queue = await fetch('http://localhost:3001/api/sync/queue');
const queueData = await queue.json();
console.log('Active syncs:', queueData.stats.activeSyncs);

// Get sync history
const history = await fetch('http://localhost:3001/api/sync/history?limit=10');
const historyData = await history.json();

// Get projects with sync status
const projects = await fetch('http://localhost:3001/api/sync/projects');
const projectData = await projects.json();
```

### 3. Frontend Integration

#### React Hook Example
```javascript
// Custom hook for sync service integration
import { useState, useEffect } from 'react';

function useSyncService() {
  const [status, setStatus] = useState(null);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    const fetchStatus = async () => {
      const response = await fetch('http://localhost:3001/api/sync/status');
      const data = await response.json();
      setStatus(data.status);
    };

    const fetchProjects = async () => {
      const response = await fetch('http://localhost:3001/api/sync/projects');
      const data = await response.json();
      setProjects(data.projects);
    };

    fetchStatus();
    fetchProjects();

    // Poll for updates
    const interval = setInterval(() => {
      fetchStatus();
      fetchProjects();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const triggerSync = async (projectId) => {
    await fetch(`http://localhost:3001/api/sync/trigger/${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ immediate: true })
    });
  };

  return { status, projects, triggerSync };
}
```

#### Component Example
```javascript
function SyncDashboard() {
  const { status, projects, triggerSync } = useSyncService();

  return (
    <div>
      <h2>GitHub Sync Status</h2>
      
      {/* Service Status */}
      <div>
        <p>Service: {status?.serviceRunning ? '🟢 Running' : '🔴 Stopped'}</p>
        <p>Queue: {status?.scheduler?.stats?.queueSize || 0} items</p>
        <p>Active: {status?.scheduler?.stats?.activeSyncs || 0} syncs</p>
      </div>

      {/* Project List */}
      <div>
        <h3>Projects</h3>
        {projects.map(project => (
          <div key={project.projectId}>
            <span>{project.projectName}</span>
            <span>{project.github?.enabled ? '✅' : '❌'}</span>
            {project.hasPendingChanges && <span>🔄 Pending</span>}
            <button onClick={() => triggerSync(project.projectId)}>
              Sync Now
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## 📊 **API Reference**

### Service Control
- `POST /api/sync/start` - Start sync service
- `POST /api/sync/stop` - Stop sync service  
- `GET /api/sync/status` - Get service status

### Sync Operations
- `POST /api/sync/trigger` - Trigger full scan
- `POST /api/sync/trigger/:projectId` - Trigger project sync
- `GET /api/sync/queue` - Get current queue status

### Monitoring
- `GET /api/sync/history` - Get sync history
- `GET /api/sync/history/:projectId` - Get project history
- `DELETE /api/sync/history` - Cleanup old history

### Configuration
- `GET /api/sync/config` - Get current configuration
- `PUT /api/sync/config` - Update configuration

### Projects
- `GET /api/sync/projects` - Get all projects with sync status

### Health
- `GET /health` - API health check

## 🔧 **Advanced Features**

### Priority Queuing
Projects are automatically prioritized based on:
- Recent activity (higher priority)
- Main branch changes (higher priority)
- Number of pending commits (higher priority)

### Error Handling
- **Exponential Backoff**: Failed syncs retry with increasing delays
- **Rate Limit Detection**: Special handling for GitHub API limits
- **Max Retries**: Configurable retry attempts before giving up
- **Error Tracking**: All failures logged to history

### Performance Optimization
- **Concurrency Control**: Limit simultaneous syncs to avoid overwhelming
- **Batch Processing**: Efficient queue processing
- **Database Persistence**: Fast SQLite storage for queue and history
- **Memory Management**: Automatic cleanup of old records

### Monitoring & Observability
- **Real-time Status**: Live sync activity monitoring
- **Historical Data**: Complete sync history with metrics
- **Performance Metrics**: Track success rates, durations, throughput
- **Health Checks**: Service and component health monitoring

## 🧪 **Testing**

### Run Tests
```bash
# Full test suite
node test-background-service.js

# Performance tests
node test-background-service.js --performance

# Integration tests
node test-background-service.js --integration

# All tests
node test-background-service.js --all
```

### Test Coverage
- ✅ Scheduler initialization and operations
- ✅ Queue management and persistence
- ✅ API endpoints and error handling
- ✅ Configuration management
- ✅ Project discovery and sync triggering
- ✅ Error handling and edge cases
- ✅ Graceful shutdown procedures

## 🛡️ **Production Deployment**

### Environment Setup
```bash
# Production environment variables
export NODE_ENV=production
export SYNC_API_PORT=3001
export SYNC_DB_PATH=/var/lib/github-sync/queue.db
export SYNC_SCAN_INTERVAL=300000
export SYNC_MAX_CONCURRENT=3
```

### Process Management
```javascript
// pm2 ecosystem file
module.exports = {
  apps: [{
    name: 'github-sync-service',
    script: './start-sync-service.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      SYNC_API_PORT: 3001
    }
  }]
};
```

### Docker Deployment
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3001
CMD ["node", "start-sync-service.js"]
```

### Health Monitoring
```bash
# Health check script
curl -f http://localhost:3001/health || exit 1

# Service monitoring
curl -f http://localhost:3001/api/sync/status || exit 1
```

## 🔍 **Troubleshooting**

### Common Issues

#### Service Won't Start
```bash
# Check port availability
lsof -i :3001

# Check database permissions
ls -la data/sync-queue.db

# Check MCP client connection
# Ensure your MCP client is properly initialized
```

#### Syncs Not Triggering
```bash
# Check project configuration
node -e "
  import('./project-json-manager.js').then(async (m) => {
    const projects = await m.getAllProjectsWithGitHub();
    console.log(projects.filter(p => p.github?.enabled));
  });
"

# Manually trigger scan
curl -X POST http://localhost:3001/api/sync/trigger
```

#### Queue Stuck
```bash
# Check queue status
curl http://localhost:3001/api/sync/queue

# Restart service
curl -X POST http://localhost:3001/api/sync/stop
curl -X POST http://localhost:3001/api/sync/start
```

### Debug Mode
```bash
# Enable debug logging
DEBUG=1 node demo-background-service.js
```

### Logs Analysis
```javascript
// Get recent failures
const history = await fetch('http://localhost:3001/api/sync/history?limit=20');
const data = await history.json();
const failures = data.history.filter(h => h.status === 'failed');
console.log('Recent failures:', failures);
```

## 🚦 **Next Steps**

### Immediate Actions
1. **Test with Your Projects**: Run `node demo-background-service.js`
2. **Configure GitHub Auth**: Set up authentication tokens
3. **Enable Projects**: Use `updateGitHubConfig()` to enable sync
4. **Start Service**: Integrate with your main application

### Integration Path
1. **Add to Main App**: Import and start the sync API
2. **Frontend Components**: Build sync dashboard UI
3. **Monitoring**: Set up alerts and health checks
4. **Production Deploy**: Use PM2 or Docker containers

### Future Enhancements
- **Webhook Support**: Real-time GitHub webhook integration
- **Multi-Remote**: Support for multiple Git remotes
- **Advanced Scheduling**: Custom sync schedules per project
- **Metrics Dashboard**: Real-time analytics and reporting
- **Team Collaboration**: Multi-user sync coordination

## 📝 **Summary**

You now have a **production-ready GitHub background sync service** with:

✅ **Automated Background Syncing** - Continuous monitoring and syncing  
✅ **REST API Control** - Full frontend integration capability  
✅ **Persistent Queue** - Survives restarts and handles failures  
✅ **Error Recovery** - Robust retry logic with rate limiting  
✅ **Real-time Monitoring** - Complete visibility into sync operations  
✅ **Production Ready** - Tested, documented, and deployment-ready  

**Your system is ready for production use!** 🎉

---

## 📞 **Support**

For issues or questions:
1. Check the troubleshooting section
2. Run the test suite: `node test-background-service.js`
3. Enable debug mode: `DEBUG=1 node demo-background-service.js`
4. Review the API logs and sync history 