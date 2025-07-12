/**
 * Recovery Panel Component
 * 
 * Provides UI for managing the local persistence recovery system
 */

import React, { useState, useEffect } from 'react';
import { AppRecoveryService } from '../lib/appRecoveryService';
import { AppInitializationService } from '../lib/appInitializationService';
import { useEnhancedCheckpointStore } from '../stores/enhancedCheckpointStore';
import { useStore } from '../stores/rootStore';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Spinner } from './ui/spinner';

interface RecoveryHealth {
  appInitialized: boolean;
  recoveryAvailable: boolean;
  projectsWithPersistence: number;
  projectsNeedingRecovery: number;
  healthy: string[];
  needsRecovery: Array<{ projectId: string; reason: string }>;
  errors: Array<{ projectId: string; error: string }>;
}

export const RecoveryPanel: React.FC = () => {
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryHealth, setRecoveryHealth] = useState<RecoveryHealth | null>(null);
  const [lastRecoveryTime, setLastRecoveryTime] = useState<Date | null>(null);
  const [recoveryLog, setRecoveryLog] = useState<string[]>([]);
  
  const rootStore = useStore();
  const enhancedCheckpointStore = useEnhancedCheckpointStore();
  
  // Load recovery health on component mount
  useEffect(() => {
    loadRecoveryHealth();
  }, []);
  
  const loadRecoveryHealth = async () => {
    try {
      const [healthStatus, initHealth] = await Promise.all([
        AppRecoveryService.getRecoveryHealthStatus(),
        AppInitializationService.getInitializationHealth()
      ]);
      
      setRecoveryHealth({
        ...initHealth,
        ...healthStatus
      });
    } catch (error) {
      console.error('Failed to load recovery health:', error);
      addToLog(`❌ Failed to load recovery health: ${error}`);
    }
  };
  
  const addToLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setRecoveryLog(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)]); // Keep last 50 entries
  };
  
  const performFullRecovery = async () => {
    setIsRecovering(true);
    addToLog('🚀 Starting full recovery...');
    
    try {
      const result = await AppInitializationService.initializeWithRecovery({
        enableRecovery: true,
        forceRebuild: false
      });
      
      if (result.success) {
        addToLog(`✅ Recovery completed in ${result.duration}ms`);
        if (result.recoveryStats) {
          addToLog(`📊 Recovered ${result.recoveryStats.projectsRecovered} projects, ${result.recoveryStats.checkpointsRecovered} checkpoints`);
        }
      } else {
        addToLog(`❌ Recovery failed: ${result.errors.join(', ')}`);
      }
      
      setLastRecoveryTime(new Date());
      await loadRecoveryHealth();
      
    } catch (error) {
      addToLog(`❌ Recovery error: ${error}`);
    } finally {
      setIsRecovering(false);
    }
  };
  
  const performForceRebuild = async () => {
    setIsRecovering(true);
    addToLog('🔄 Starting force rebuild from Git...');
    
    try {
      const result = await AppInitializationService.initializeWithRecovery({
        enableRecovery: true,
        forceRebuild: true
      });
      
      if (result.success) {
        addToLog(`✅ Force rebuild completed in ${result.duration}ms`);
        if (result.recoveryStats) {
          addToLog(`📊 Rebuilt ${result.recoveryStats.projectsRecovered} projects, ${result.recoveryStats.checkpointsRecovered} checkpoints`);
        }
      } else {
        addToLog(`❌ Force rebuild failed: ${result.errors.join(', ')}`);
      }
      
      setLastRecoveryTime(new Date());
      await loadRecoveryHealth();
      
    } catch (error) {
      addToLog(`❌ Force rebuild error: ${error}`);
    } finally {
      setIsRecovering(false);
    }
  };
  
  const recoverSpecificProjects = async () => {
    if (!recoveryHealth?.needsRecovery.length) return;
    
    setIsRecovering(true);
    const projectIds = recoveryHealth.needsRecovery.map(item => item.projectId);
    addToLog(`🔄 Recovering ${projectIds.length} specific projects...`);
    
    try {
      const result = await AppInitializationService.recoverSpecificProjects(projectIds);
      
      const successCount = result.results.filter(r => r.success).length;
      addToLog(`✅ Recovered ${successCount}/${projectIds.length} projects`);
      
      result.results.forEach(res => {
        if (res.success) {
          addToLog(`  ✓ ${res.projectId}`);
        } else {
          addToLog(`  ❌ ${res.projectId}: ${res.error}`);
        }
      });
      
      await loadRecoveryHealth();
      
    } catch (error) {
      addToLog(`❌ Specific recovery error: ${error}`);
    } finally {
      setIsRecovering(false);
    }
  };
  
  const initializePersistenceForAll = async () => {
    setIsRecovering(true);
    addToLog('🔧 Initializing persistence for all projects...');
    
    try {
      // Limit to last 5 projects for testing
      const recentProjects = rootStore.projects
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5);
      
      addToLog(`📋 Focusing on ${recentProjects.length} most recent projects for testing...`);
      
      for (const project of recentProjects) {
        const result = await enhancedCheckpointStore.initializeProjectPersistence(project.id);
        
        if (result.success) {
          addToLog(`  ✓ ${project.name} (${project.id})`);
          
          // Try to rebuild from Git history for this project
          const rebuildResult = await enhancedCheckpointStore.rebuildFromGit(project.id);
          if (rebuildResult.success) {
            addToLog(`    🔨 Rebuilt from Git history`);
          }
        } else {
          addToLog(`  ❌ ${project.name}: ${result.error}`);
        }
      }
      
      addToLog('✅ Recent projects persistence initialization complete');
      await loadRecoveryHealth();
      
    } catch (error) {
      addToLog(`❌ Persistence initialization error: ${error}`);
    } finally {
      setIsRecovering(false);
    }
  };
  
  const clearLog = () => {
    setRecoveryLog([]);
  };
  
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">🔧 Recovery & Persistence Status</h3>
        
        {recoveryHealth ? (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-sm text-gray-600">App Status</div>
              <div className={`font-medium ${recoveryHealth.appInitialized ? 'text-green-600' : 'text-red-600'}`}>
                {recoveryHealth.appInitialized ? '✅ Initialized' : '❌ Not Initialized'}
              </div>
            </div>
            
            <div>
              <div className="text-sm text-gray-600">Recovery Available</div>
              <div className={`font-medium ${recoveryHealth.recoveryAvailable ? 'text-green-600' : 'text-red-600'}`}>
                {recoveryHealth.recoveryAvailable ? '✅ Available' : '❌ No MCP Servers'}
              </div>
            </div>
            
            <div>
              <div className="text-sm text-gray-600">Projects with Persistence</div>
              <div className="font-medium text-blue-600">
                📦 {recoveryHealth.projectsWithPersistence}
              </div>
            </div>
            
            <div>
              <div className="text-sm text-gray-600">Projects Needing Recovery</div>
              <div className={`font-medium ${recoveryHealth.projectsNeedingRecovery > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                {recoveryHealth.projectsNeedingRecovery > 0 ? `⚠️ ${recoveryHealth.projectsNeedingRecovery}` : '✅ 0'}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <Spinner />
            <div className="text-sm text-gray-600 mt-2">Loading recovery status...</div>
          </div>
        )}
        
        {lastRecoveryTime && (
          <div className="text-xs text-gray-500 mb-4">
            Last recovery: {lastRecoveryTime.toLocaleString()}
          </div>
        )}
      </Card>
      
      <Card className="p-4">
        <h4 className="text-md font-semibold mb-3">Recovery Actions</h4>
        
        <div className="flex flex-wrap gap-2 mb-4">
          <Button
            onClick={performFullRecovery}
            disabled={isRecovering}
            variant="default"
          >
            {isRecovering ? <Spinner /> : '🔄'}
            Full Recovery
          </Button>
          
          <Button
            onClick={performForceRebuild}
            disabled={isRecovering}
            variant="outline"
          >
            {isRecovering ? <Spinner /> : '🔨'}
            Force Rebuild from Git
          </Button>
          
          {recoveryHealth?.needsRecovery && recoveryHealth.needsRecovery.length > 0 && (
            <Button
              onClick={recoverSpecificProjects}
              disabled={isRecovering}
              variant="outline"
            >
              {isRecovering ? <Spinner /> : '🎯'}
              Recover Specific Projects ({recoveryHealth.needsRecovery.length})
            </Button>
          )}
          
          <Button
            onClick={initializePersistenceForAll}
            disabled={isRecovering}
            variant="outline"
          >
            {isRecovering ? <Spinner /> : '🔧'}
            Initialize Top 5 Projects
          </Button>
          
          <Button
            onClick={async () => {
              setIsRecovering(true);
              addToLog('🧪 Testing single project initialization...');
              
              try {
                // Get the most recent project
                const recentProjects = rootStore.projects
                  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
                
                if (recentProjects.length === 0) {
                  addToLog('❌ No projects found');
                  return;
                }
                
                const testProject = recentProjects[0];
                addToLog(`🎯 Testing: ${testProject.name} (${testProject.id.substring(0, 8)}...)`);
                
                // Initialize persistence
                const initResult = await enhancedCheckpointStore.initializeProjectPersistence(testProject.id);
                
                if (initResult.success) {
                  addToLog(`  ✅ Persistence initialized`);
                  
                  // Try to rebuild from Git
                  const rebuildResult = await enhancedCheckpointStore.rebuildFromGit(testProject.id);
                  if (rebuildResult.success) {
                    addToLog(`  🔨 Rebuilt from Git history`);
                  } else {
                    addToLog(`  ℹ️ No Git history to rebuild`);
                  }
                  
                  // Load checkpoints
                  const checkpoints = await enhancedCheckpointStore.loadProjectCheckpoints(testProject.id);
                  addToLog(`  📦 Found ${checkpoints.length} checkpoints`);
                  
                  // Create a test checkpoint
                  const checkpointResult = await enhancedCheckpointStore.createProjectCheckpoint(testProject.id, {
                    description: "Test checkpoint from Recovery Panel",
                    type: 'manual',
                    tags: ['test', 'recovery-panel']
                  });
                  
                  if (checkpointResult.success) {
                    addToLog(`  💾 Created test checkpoint: ${checkpointResult.checkpoint?.id}`);
                  }
                  
                  addToLog(`✅ Test completed successfully!`);
                } else {
                  addToLog(`  ❌ Initialization failed: ${initResult.error}`);
                }
                
              } catch (error) {
                addToLog(`❌ Test error: ${error}`);
              } finally {
                setIsRecovering(false);
              }
            }}
            disabled={isRecovering}
            variant="outline"
            className="bg-blue-50 border-blue-300"
          >
            {isRecovering ? <Spinner /> : '🧪'}
            Test Most Recent Project
          </Button>
          
          <Button
            onClick={async () => {
              setIsRecovering(true);
              addToLog('📋 Listing all project IDs...');
              
              try {
                const allProjects = rootStore.projects
                  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
                
                addToLog(`📊 Total projects: ${allProjects.length}`);
                addToLog('📋 Project IDs (most recent first):');
                
                allProjects.forEach((project, index) => {
                  const lastUpdated = new Date(project.updatedAt).toLocaleDateString();
                  addToLog(`  ${index + 1}. ${project.id} - "${project.name}" (${lastUpdated})`);
                });
                
                if (allProjects.length >= 5) {
                  addToLog('🏆 Top 5 for testing:');
                  allProjects.slice(0, 5).forEach((project, index) => {
                    addToLog(`  ${index + 1}. ${project.id}`);
                  });
                }
                
              } catch (error) {
                addToLog(`❌ Error listing projects: ${error}`);
              } finally {
                setIsRecovering(false);
              }
            }}
            disabled={isRecovering}
            variant="ghost"
          >
            📋 List Project IDs
          </Button>
          
          <Button
            onClick={loadRecoveryHealth}
            disabled={isRecovering}
            variant="ghost"
          >
            🔄 Refresh Status
          </Button>
        </div>
        
        {recoveryHealth?.needsRecovery && recoveryHealth.needsRecovery.length > 0 && (
          <div className="mb-4">
            <h5 className="text-sm font-medium mb-2">Projects Needing Recovery:</h5>
            <div className="text-xs space-y-1">
              {recoveryHealth.needsRecovery.map(item => (
                <div key={item.projectId} className="text-orange-600">
                  • {item.projectId}: {item.reason}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {recoveryHealth?.errors && recoveryHealth.errors.length > 0 && (
          <div className="mb-4">
            <h5 className="text-sm font-medium mb-2">Projects with Errors:</h5>
            <div className="text-xs space-y-1">
              {recoveryHealth.errors.map(item => (
                <div key={item.projectId} className="text-red-600">
                  • {item.projectId}: {item.error}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
      
      <Card className="p-4">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-md font-semibold">Recovery Log</h4>
          <Button onClick={clearLog} variant="ghost" size="sm">
            Clear
          </Button>
        </div>
        
        <div className="bg-black text-green-400 p-3 rounded font-mono text-xs max-h-48 overflow-y-auto">
          {recoveryLog.length > 0 ? (
            recoveryLog.map((entry, index) => (
              <div key={index} className="mb-1">
                {entry}
              </div>
            ))
          ) : (
            <div className="text-gray-500">No recovery operations yet...</div>
          )}
        </div>
      </Card>
    </div>
  );
}; 