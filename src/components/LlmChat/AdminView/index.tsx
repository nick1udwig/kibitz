"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ProjectSettings, ProviderType } from '../context/types';
import { getProviderModels } from '../types/provider';
import { McpConfiguration } from './McpConfiguration';
import { ThemeToggle } from '../ThemeToggle';
import { useStore } from '@/stores/rootStore';

export const AdminView = () => {
  const { projects, activeProjectId, updateProjectSettings, servers } = useStore();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const activeProject = projects.find(p => p.id === activeProjectId);

  useEffect(() => {
    if (!activeProject) return;

    // Only update if server connections have changed to maintain ID references
    const projectServerIds = activeProject.settings.mcpServerIds || [];
    const activeServerIds = servers
      .filter(s => s.status === 'connected')
      .map(s => s.id);

    const shouldUpdate = !projectServerIds.every(id =>
      activeServerIds.includes(id)) ||
      !activeServerIds.every(id => projectServerIds.includes(id));

    if (shouldUpdate) {
      handleSettingsChange({
        mcpServerIds: activeServerIds
      });
    }
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
    // Special handling for provider changes to preserve API keys
    if (settings.provider !== undefined && settings.provider !== activeProject.settings.provider) {
      // When changing provider, ensure we preserve both API keys
      updateProjectSettings(activeProject.id, {
        settings: {
          ...activeProject.settings,
          ...settings,
          // Preserve the API keys when switching providers
          anthropicApiKey: activeProject.settings.anthropicApiKey || activeProject.settings.apiKey,
          openRouterApiKey: activeProject.settings.openRouterApiKey || '',
          // Keep legacy apiKey in sync with anthropicApiKey
          apiKey: settings.provider === 'anthropic'
            ? (activeProject.settings.anthropicApiKey || activeProject.settings.apiKey)
            : activeProject.settings.apiKey
        }
      });
    } else {
      // For non-provider changes, proceed normally
      updateProjectSettings(activeProject.id, {
        settings: {
          ...activeProject.settings,
          ...settings
        }
      });
    }
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
                Provider
              </label>
              <select
                value={activeProject.settings.provider || 'anthropic'}
                onChange={(e) => handleSettingsChange({
                  provider: e.target.value as ProviderType
                })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openrouter">OpenRouter (Coming Soon)</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>

            {(activeProject.settings.provider === 'openrouter' || activeProject.settings.provider === 'openai') && (
              <Alert>
                <AlertDescription>
                  {activeProject.settings.provider === 'openrouter'
                    ? "OpenRouter support is coming soon. Please use Anthropic for now."
                    : "OpenAI support is coming soon. Please use Anthropic for now."}
                </AlertDescription>
              </Alert>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">
                API Key <span className="text-red-500">*</span>
              </label>
              <p className="text-sm text-muted-foreground mb-2">
                Required to chat. Get yours at{' '}
                {(() => {
                  switch(activeProject.settings.provider) {
                    case 'openrouter':
                      return (
                        <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                          openrouter.ai
                        </a>
                      );
                    case 'openai':
                      return (
                        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                          platform.openai.com
                        </a>
                      );
                    default:
                      return (
                        <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                          console.anthropic.com
                        </a>
                      );
                  }
                })()}
              </p>
              <Input
                type="password"
                value={
                  activeProject.settings.provider === 'openrouter'
                    ? activeProject.settings.openRouterApiKey || ''
                    : activeProject.settings.provider === 'openai'
                    ? activeProject.settings.openaiApiKey || ''
                    : activeProject.settings.anthropicApiKey || activeProject.settings.apiKey || ''  // Fallback for backward compatibility
                }
                onChange={(e) => {
                  const value = e.target.value.trim();
                  switch(activeProject.settings.provider) {
                    case 'openrouter':
                      handleSettingsChange({
                        openRouterApiKey: value
                      });
                      break;
                    case 'openai':
                      handleSettingsChange({
                        openaiApiKey: value
                      });
                      break;
                    default:
                      handleSettingsChange({
                        anthropicApiKey: value,
                        apiKey: value  // Keep apiKey in sync for backward compatibility
                      });
                  }
                }}
                placeholder={
                  activeProject.settings.provider === 'openrouter'
                    ? "⚠️ OpenRouter support coming soon"
                    : activeProject.settings.provider === 'openai'
                    ? "⚠️ OpenAI support coming soon"
                    : "⚠️ Enter your Anthropic API key to use the chat"
                }
                className={
                  activeProject.settings.provider === 'openrouter'
                    ? ""
                    : (!activeProject.settings.anthropicApiKey?.trim() && !activeProject.settings.apiKey?.trim())
                    ? "border-red-500 dark:border-red-400 placeholder:text-red-500/90 dark:placeholder:text-red-400/90 placeholder:font-medium"
                    : ""
                }
                disabled={activeProject.settings.provider === 'openrouter' || activeProject.settings.provider === 'openai'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Model
              </label>
              <select
                value={activeProject.settings.model}
                onChange={(e) => handleSettingsChange({
                  model: e.target.value
                })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {getProviderModels(activeProject.settings.provider || 'anthropic').map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
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
        serverIds={activeProject.settings.mcpServerIds || []}
        onServerIdsChange={(mcpServerIds) => handleSettingsChange({ mcpServerIds })}
      />
      <Card className="mt-6">
        <CardContent className="p-6">
          <h3 className="text-lg font-medium mb-4">Advanced Settings</h3>
          <div className="text-xs text-muted-foreground mb-4">Database Version: 5</div>
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
