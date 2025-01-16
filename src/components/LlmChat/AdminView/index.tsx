"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useProjects } from '../context/ProjectContext';
import { ProjectSettings } from '../context/types';
import { McpServer } from '../types/mcp';
import { McpConfiguration } from './McpConfiguration';
import { ThemeToggle } from '../ThemeToggle';
import { useMcp } from '../context/McpContext';

export const AdminView = () => {
  const { projects, activeProjectId, updateProjectSettings } = useProjects();
  const { servers } = useMcp();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const activeProject = projects.find(p => p.id === activeProjectId);

  useEffect(() => {
    if (!activeProject) return;
    handleSettingsChange({
      mcpServers: servers.filter(s => (
        activeProject.settings.mcpServers.find(mcpS => mcpS.id === s.id)
      )) as McpServer[]
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, servers]);


  if (!activeProject) {
    return (
      <div className="text-center text-muted-foreground">
        Select a project to configure settings
      </div>
    );
  }

  const handleSettingsChange = (settings: Partial<ProjectSettings>) => {
    // Update to include settings in the correct nested structure
    updateProjectSettings(activeProject.id, {
      settings: {
        ...activeProject.settings,
        ...settings
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Floating theme toggle */}
      <div className="fixed right-4 bottom-4 z-50">
        <ThemeToggle />
      </div>

      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-medium mb-4">API Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                API Key
              </label>
              <Input
                type="password"
                value={activeProject.settings.apiKey}
                onChange={(e) => handleSettingsChange({
                  apiKey: e.target.value
                })}
                placeholder="Enter your Anthropic API key"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Model
              </label>
              <Input
                value={activeProject.settings.model}
                onChange={(e) => handleSettingsChange({
                  model: e.target.value
                })}
                placeholder="claude-3-5-sonnet-20241022"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                System Prompt
              </label>
              <Textarea
                value={activeProject.settings.systemPrompt}
                onChange={(e) => handleSettingsChange({
                  systemPrompt: e.target.value
                })}
                placeholder="Enter a system prompt..."
                className="min-h-[100px]"
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="elideToolResults"
                checked={activeProject.settings.elideToolResults ?? false}
                onChange={(e) => handleSettingsChange({
                  elideToolResults: e.target.checked
                })}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="elideToolResults" className="text-sm font-medium">
                Use Claude to elide tool results from previous messages
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <McpConfiguration
        servers={activeProject.settings.mcpServers}
        onServersChange={(mcpServers) => handleSettingsChange({ mcpServers })}
      />
      <Card className="mt-6">
        <CardContent className="p-6">
          <h3 className="text-lg font-medium mb-4">Advanced Settings</h3>
          <Button
            variant="destructive"
            onClick={() => setShowResetConfirm(true)}
          >
            Reset state
          </Button>

          {/* Reset state confirmation dialog */}
          <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset Application State</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to reset the application state? This will delete all projects, conversations, and settings. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    // Clear all IndexedDB databases
                    const clearAllIndexedDB = async () => {
                      const databases = await window.indexedDB.databases();
                      return Promise.all(
                        databases.map(db =>
                          new Promise<void>((resolve, reject) => {
                            const request = window.indexedDB.deleteDatabase(db.name!);
                            request.onsuccess = () => resolve();
                            request.onerror = () => reject(request.error);
                          })
                        )
                      );
                    };

                    try {
                      await clearAllIndexedDB();
                      window.location.reload();
                    } catch (error) {
                      console.error('Error clearing databases:', error);
                    }
                  }}
                >
                  Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
};
