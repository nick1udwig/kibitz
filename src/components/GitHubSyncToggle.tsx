import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Switch } from '@/components/ui/switch';
import { useStore } from '@/stores/rootStore';
import { Github, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface GitHubSyncToggleProps {
  className?: string;
}

export function GitHubSyncToggle({ className = '' }: GitHubSyncToggleProps) {
  const { activeProjectId, projects, updateProjectSettings } = useStore();
  const [syncEnabled, setSyncEnabled] = useState(true); // Default true as requested
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'success'>('idle');
  const [isLoading, setIsLoading] = useState(false);
  const initBusyRef = useRef(false);

  // Get active project
  const activeProject = projects.find(p => p.id === activeProjectId);

  // Trigger manual sync
  const triggerSync = useCallback(async () => {
    if (!activeProjectId) return;

    try {
      setSyncStatus('syncing');
      
      // Use Next.js API route, not background service directly
      const response = await fetch('/api/github-sync/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: activeProjectId,
          immediate: true,
          // Force allows a manual sync even if server hasn't yet persisted enabled flag
          force: true
        }),
      });

      if (response.ok) {
        setSyncStatus('success');
        setTimeout(() => setSyncStatus('idle'), 3000); // Reset after 3 seconds
      } else {
        setSyncStatus('error');
      }
    } catch (error) {
      console.error('❌ Failed to trigger sync:', error);
      setSyncStatus('error');
    }
  }, [activeProjectId]);

  // Handle toggle change
  const handleToggleChange = useCallback(async (enabled: boolean) => {
    if (!activeProjectId || !activeProject) return;
    if (enabled === syncEnabled && syncStatus !== 'error') return; // no-op if state is already correct

    try {
      setIsLoading(true);
      setSyncEnabled(enabled);

      // Update project GitHub config via Next.js API
      const updateResponse = await fetch('/api/github-sync/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: activeProjectId,
          projectName: activeProject.name,
          enabled,
          syncBranches: ['main', 'conv-*'],
          authentication: {
            type: 'token',
            configured: enabled
          }
        }),
      });

      if (updateResponse.ok) {
        console.log('✅ GitHub sync updated:', enabled ? 'enabled' : 'disabled');
        
        // 🔧 UPDATE PROJECT SETTINGS IN STORE (after success to avoid effect loops)
        updateProjectSettings(activeProjectId, {
          settings: {
            ...activeProject.settings,
            enableGitHub: enabled
          }
        });
        
        // If enabling, trigger initial sync
        if (enabled) {
          await triggerSync();
        }
      } else {
        throw new Error('Failed to update GitHub config');
      }
    } catch (error) {
      console.error('❌ Failed to update GitHub sync:', error);
      // Revert toggle state
      setSyncEnabled(!enabled);
      setSyncStatus('error');
    } finally {
      setIsLoading(false);
    }
  }, [activeProjectId, activeProject, syncEnabled, syncStatus, updateProjectSettings, triggerSync]);

  // Load GitHub sync status when project changes (single run per project)
  useEffect(() => {
    const load = async () => {
      if (!activeProjectId || !activeProject || initBusyRef.current) return;
      initBusyRef.current = true;
      try {
        setIsLoading(true);
        // Server truth
        let serverEnabled: boolean | undefined = undefined;
        try {
          const res = await fetch(`/api/github-sync/config?projectId=${activeProjectId}`);
          if (res.ok) {
            const data = await res.json();
            serverEnabled = data.github?.enabled;
            if (data.github?.syncStatus) setSyncStatus(data.github.syncStatus);
          }
        } catch {}

        const desiredEnabled = activeProject.settings.enableGitHub ?? true; // default ON

        if (serverEnabled === undefined) {
          // No server config yet → apply desired state once
          if (desiredEnabled !== syncEnabled) await handleToggleChange(desiredEnabled);
          else if (desiredEnabled) await handleToggleChange(true);
        } else {
          setSyncEnabled(serverEnabled);
          if (serverEnabled !== desiredEnabled) {
            await handleToggleChange(desiredEnabled);
          }
        }
      } finally {
        setIsLoading(false);
        initBusyRef.current = false;
      }
    };
    load();
    // Only re-run when projectId changes to avoid loops
  }, [activeProjectId, activeProject, syncEnabled, handleToggleChange]);

  // Get status icon and color
  const getStatusIcon = () => {
    if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
    
    switch (syncStatus) {
      case 'syncing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Github className="h-4 w-4" />;
    }
  };

  const getStatusText = () => {
    switch (syncStatus) {
      case 'syncing':
        return 'Syncing...';
      case 'success':
        return 'Synced!';
      case 'error':
        return 'Sync failed';
      default:
        return syncEnabled ? 'GitHub sync enabled' : 'GitHub sync disabled';
    }
  };

  if (!activeProject) {
    return null;
  }

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      {/* GitHub Icon with Status */}
      <div className="flex items-center space-x-2">
        {getStatusIcon()}
        <span className="text-sm font-medium">
          GitHub
        </span>
      </div>

      {/* Toggle Switch */}
      <Switch
        checked={syncEnabled}
        onCheckedChange={handleToggleChange}
        disabled={isLoading}
        className="data-[state=checked]:bg-green-600"
      />

      {/* Status Text */}
      <span className="text-xs text-muted-foreground">
        {getStatusText()}
      </span>

      {/* Manual Sync Button (when enabled) */}
      {syncEnabled && syncStatus !== 'syncing' && (
        <button
          onClick={triggerSync}
          className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          disabled={isLoading}
        >
          Sync Now
        </button>
      )}
    </div>
  );
} 