"use client";

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useProjects } from '../context/ProjectContext';
import { ProjectSettings } from '../context/types';
import { McpConfiguration } from './McpConfiguration';

export const AdminView = () => {
  const { projects, activeProjectId, updateProjectSettings } = useProjects();

  const activeProject = projects.find(p => p.id === activeProjectId);

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
    </div>
  );
};
