"use client";

import { useEffect, useState } from 'react';
import { DB_VERSION } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SaveIcon, ChevronDownIcon, Trash2Icon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectSettings, ProviderType, LegacyProviderType } from '../context/types';
import { getProviderModels } from '../types/provider';
import { McpConfiguration } from './McpConfiguration';
import ToolsView from './ToolsView';
import { ThemeToggle } from '../ThemeToggle';
import { useStore } from '@/stores/rootStore';
import { getDefaultModelForProvider } from '@/stores/rootStore';
import { convertLegacyToProviderConfig } from '../../../components/LlmChat/types/provider';


export const AdminView = () => {
  const { projects, activeProjectId, updateProjectSettings, servers } = useStore();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState('config');
  const [showSavePromptDialog, setShowSavePromptDialog] = useState(false);
  const [newPromptName, setNewPromptName] = useState('');

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
    console.log("handleSettingsChange - settings received:", settings);
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
            : activeProject.settings.apiKey,
          // **[FIX] Update model to default for new provider**
          model: getDefaultModelForProvider(settings.provider)
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

      <div className="mb-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="tools">Tools</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {activeTab === 'tools' ? (
        <ToolsView />
      ) : (

        <>
          <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-medium mb-4">API Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Provider
              </label>
              <select
                value={activeProject.settings.providerConfig?.type ?? activeProject.settings.provider ?? 'anthropic'}
                onChange={(e) => {
                  const newProvider = e.target.value as LegacyProviderType;
                  handleSettingsChange({
                    provider: newProvider, // This will trigger model update in handleSettingsChange
                    providerConfig: convertLegacyToProviderConfig(newProvider, activeProject.settings)
                  });
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
                <option value="gemini">Google Gemini</option> {/* Added Gemini */}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                API Key <span className="text-red-500">*</span>
              </label>
              <p className="text-sm text-muted-foreground mb-2">
                Required to chat. Get yours at{' '}
                {(() => {
                  const currentProvider = activeProject.settings.providerConfig?.type ?? activeProject.settings.provider;
                  switch (currentProvider) {
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
                    case 'gemini': // Added Gemini link
                      return (
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                          aistudio.google.com
                        </a>
                      );
                    default: // Anthropic
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
                  (() => {
                    const providerType = activeProject.settings.providerConfig?.type ?? activeProject.settings.provider;
                    const configSettings = activeProject.settings.providerConfig?.settings;
                    switch (providerType) {
                      case 'openrouter': return configSettings?.apiKey || activeProject.settings.openRouterApiKey || '';
                      case 'openai': return configSettings?.apiKey || activeProject.settings.openaiApiKey || '';
                      case 'gemini': return configSettings?.apiKey || activeProject.settings.geminiApiKey || ''; // Added Gemini
                      case 'anthropic':
                      default:
                        return configSettings?.apiKey || activeProject.settings.anthropicApiKey || activeProject.settings.apiKey || '';
                    }
                  })()
                }
                onChange={(e) => {
                  const value = e.target.value; // No trim here, allow spaces if user wants
                  const providerType = activeProject.settings.providerConfig?.type ?? activeProject.settings.provider;
                  let keyUpdate: Partial<ProjectSettings> = {};
                  switch (providerType) {
                    case 'openrouter': keyUpdate = { openRouterApiKey: value }; break;
                    case 'openai': keyUpdate = { openaiApiKey: value }; break;
                    case 'gemini': keyUpdate = { geminiApiKey: value }; break; // Added Gemini
                    default: // Anthropic
                      keyUpdate = { anthropicApiKey: value, apiKey: value };
                  }
                   // Also update the providerConfig
                  if (activeProject.settings.providerConfig) {
                    keyUpdate.providerConfig = {
                      ...activeProject.settings.providerConfig,
                      settings: {
                        ...activeProject.settings.providerConfig.settings,
                        apiKey: value
                      }
                    };
                  }
                  handleSettingsChange(keyUpdate);
                }}
                placeholder={
                  (() => {
                    const providerType = activeProject.settings.providerConfig?.type ?? activeProject.settings.provider;
                     switch (providerType) {
                        case 'openai': return "⚠️ Enter your OpenAI API key";
                        case 'openrouter': return "⚠️ Enter your OpenRouter API key";
                        case 'gemini': return "⚠️ Enter your Google Gemini API key"; // Added Gemini
                        default: return "⚠️ Enter your Anthropic API key";
                      }
                  })()
                }
                className={
                  (() => {
                     const providerType = activeProject.settings.providerConfig?.type ?? activeProject.settings.provider;
                     const currentApiKey = activeProject.settings.providerConfig?.settings.apiKey;
                     return !currentApiKey?.trim()
                      ? "border-red-500 dark:border-red-400 placeholder:text-red-500/90 dark:placeholder:text-red-400/90 placeholder:font-medium"
                      : "";
                  })()
                }
              />
            </div>

            {/* Conditional Base URL for OpenRouter and OpenAI */}
            {(activeProject.settings.providerConfig?.type === 'openrouter' || activeProject.settings.providerConfig?.type === 'openai') && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Base URL (Optional)
                </label>
                <Input
                  type="text"
                  value={activeProject.settings.providerConfig?.settings.baseUrl || ''}
                  onChange={(e) => {
                    const value = e.target.value.trim();
                    handleSettingsChange({
                       providerConfig: {
                        ...activeProject.settings.providerConfig!,
                        settings: {
                            ...activeProject.settings.providerConfig!.settings,
                            baseUrl: value
                        }
                       }
                    });
                  }}
                  placeholder={
                    activeProject.settings.providerConfig?.type === 'openrouter'
                      ? 'https://openrouter.ai/api/v1'
                      : 'https://api.openai.com/v1'
                  }
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">
                GROQ API Key
              </label>
              <p className="text-sm text-muted-foreground mb-2">
                Required for voice transcription. Get yours at{' '}
                <a href="https://console.groq.com/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                  console.groq.com
                </a>
              </p>
              <Input
                type="password"
                value={activeProject.settings.groqApiKey || ''}
                onChange={(e) => {
                  const value = e.target.value.trim();
                  handleSettingsChange({
                    groqApiKey: value
                  });
                }}
                placeholder="Enter your GROQ API key for voice transcription"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Model
              </label>
                <div className="space-y-2">
                  <select
                    value={activeProject.settings.model === '__CUSTOM__' || !getProviderModels(activeProject.settings.provider || 'anthropic').includes(activeProject.settings.model || '')
                      ? 'custom'
                      : activeProject.settings.model}
                    onChange={(e) => {
                      console.log("Model dropdown onChange event:", e.target.value);
                      if (e.target.value === 'custom') {
                        // Set special value to indicate custom mode
                        handleSettingsChange({
                          model: '__CUSTOM__'
                        });
                      } else {
                        handleSettingsChange({
                          model: e.target.value
                        });
                      }
                    }}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {getProviderModels(activeProject.settings.provider || 'anthropic').map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                    <option value="custom">Custom</option>
                  </select>
                  {(activeProject.settings.model === '__CUSTOM__' ||
                    !getProviderModels(activeProject.settings.provider || 'anthropic').includes(activeProject.settings.model || '')) && (
                    <Input
                      value={activeProject.settings.model === '__CUSTOM__' ? '' : (activeProject.settings.model || '')}
                      onChange={(e) => {
                        handleSettingsChange({
                          model: e.target.value || '__CUSTOM__'
                        });
                      }}
                      placeholder="Enter custom model name"
                      className="w-full"
                    />
                  )}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium">
                  System Prompt
                </label>
                <div className="flex gap-2">
                  {activeProject.settings.savedPrompts?.length ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          Load Prompt <ChevronDownIcon className="ml-2 h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {activeProject.settings.savedPrompts.map((prompt) => (
                          <DropdownMenuItem
                            key={prompt.id}
                            className="flex justify-between items-center"
                          >
                            <div
                              onClick={() => handleSettingsChange({
                                systemPrompt: prompt.content
                              })}
                              className="flex-grow cursor-pointer"
                            >
                              {prompt.name}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 ml-2 hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSettingsChange({
                                  savedPrompts: activeProject.settings.savedPrompts?.filter(
                                    p => p.id !== prompt.id
                                  ) || []
                                });
                              }}
                            >
                              <Trash2Icon className="h-3 w-3" />
                            </Button>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setNewPromptName('');
                      setShowSavePromptDialog(true);
                    }}
                  >
                    <SaveIcon className="mr-2 h-4 w-4" />
                    Save Prompt
                  </Button>
                </div>
              </div>
              <Textarea
                value={activeProject.settings.systemPrompt}
                onChange={(e) => handleSettingsChange({
                  systemPrompt: e.target.value
                })}
                placeholder="Enter a system prompt..."
                className="min-h-[100px]"
              />
            </div>

            {/* Save Prompt Dialog */}
            <Dialog open={showSavePromptDialog} onOpenChange={setShowSavePromptDialog}>
              <DialogContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newPromptName.trim()) {
                      const newPrompt = {
                        id: crypto.randomUUID(),
                        name: newPromptName.trim(),
                        content: activeProject.settings.systemPrompt,
                        createdAt: new Date()
                      };
                      handleSettingsChange({
                        savedPrompts: [
                          ...(activeProject.settings.savedPrompts || []),
                          newPrompt
                        ]
                      });
                      setShowSavePromptDialog(false);
                    }
                  }}
                >
                  <DialogHeader>
                    <DialogTitle>Save System Prompt</DialogTitle>
                  </DialogHeader>
                  <div className="py-4">
                    <label className="block text-sm font-medium mb-2">
                      Name your prompt
                    </label>
                    <Input
                      value={newPromptName}
                      onChange={(e) => setNewPromptName(e.target.value)}
                      placeholder="Enter a name for this prompt"
                      autoFocus // Automatically focus the input when dialog opens
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setShowSavePromptDialog(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">
                      Save
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <div>
              <label className="block text-sm font-medium mb-1">
                Message Window Size
              </label>
              <p className="text-sm text-muted-foreground mb-2">
                Number of messages to show when History is disabled
              </p>
              <Input
                type="number"
                value={activeProject.settings.messageWindowSize ?? 30}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value) && value > 0) {
                    handleSettingsChange({
                      messageWindowSize: value
                    });
                  }
                }}
                min="1"
                className="w-32"
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
          <div className="text-xs text-muted-foreground mb-4">Database Version: {DB_VERSION}</div>
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
        </>
      )}
    </div>
  );
};
