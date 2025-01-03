"use client";

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConversationSettings } from '../types';
import { ToolConfiguration } from './ToolConfiguration';
import { McpConfiguration } from './McpConfiguration';

interface AdminViewProps {
  settings: ConversationSettings;
  onSettingsChange: (settings: ConversationSettings) => void;
}

export const AdminView = ({
  settings,
  onSettingsChange
}: AdminViewProps) => {
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
                value={settings.apiKey}
                onChange={(e) => onSettingsChange({
                  ...settings,
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
                value={settings.model}
                onChange={(e) => onSettingsChange({
                  ...settings,
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
                value={settings.systemPrompt}
                onChange={(e) => onSettingsChange({
                  ...settings,
                  systemPrompt: e.target.value
                })}
                placeholder="Enter a system prompt..."
                className="min-h-[100px]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <McpConfiguration
        servers={settings.mcpServers || []}
        onServersChange={(mcpServers) => onSettingsChange({ ...settings, mcpServers })}
      />

    </div>
  );
};
