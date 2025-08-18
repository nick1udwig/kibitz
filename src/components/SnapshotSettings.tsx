/**
 * 🚀 Snapshot Settings - Git Snapshot & Reversion Feature v1.1
 * 
 * Configuration panel for:
 * - Auto-push toggle
 * - LLM provider selection for commit messages
 * - Maximum snapshots/branches to show
 * - Other snapshot preferences
 */

import React, { useState } from 'react';
import { Settings, Cloud, GitBranch, MessageSquare, Save, AlertCircle } from 'lucide-react';
import { useSnapshotConfig } from '../stores/snapshotStore';
import { SnapshotConfig } from '../lib/gitSnapshotService';

interface SnapshotSettingsProps {
  className?: string;
  onSettingsChanged?: (config: SnapshotConfig) => void;
}

export function SnapshotSettings({ className = "", onSettingsChanged }: SnapshotSettingsProps) {
  const { config, updateConfig } = useSnapshotConfig();
  const [isOpen, setIsOpen] = useState(false);
  const [tempConfig, setTempConfig] = useState<SnapshotConfig>(config);
  const [hasChanges, setHasChanges] = useState(false);

  const handleConfigChange = (updates: Partial<SnapshotConfig>) => {
    const newConfig = { ...tempConfig, ...updates };
    setTempConfig(newConfig);
    setHasChanges(JSON.stringify(newConfig) !== JSON.stringify(config));
  };

  const handleSave = () => {
    updateConfig(tempConfig);
    setHasChanges(false);
    onSettingsChanged?.(tempConfig);
  };

  const handleReset = () => {
    setTempConfig(config);
    setHasChanges(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors ${className}`}
      >
        <Settings className="w-4 h-4" />
        Snapshot Settings
      </button>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-blue-500" />
            <h3 className="font-medium text-gray-900 dark:text-gray-100">
              Snapshot Settings
            </h3>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            ×
          </button>
        </div>
      </div>

      {/* Settings Content */}
      <div className="p-4 space-y-6">
        {/* Auto Push Configuration */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-green-500" />
            <h4 className="font-medium text-gray-900 dark:text-gray-100">Auto Push</h4>
          </div>
          
          <div className="space-y-2">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={tempConfig.autoPushEnabled}
                onChange={(e) => handleConfigChange({ autoPushEnabled: e.target.checked })}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Automatically push snapshots to remote repository
              </span>
            </label>
            
            {tempConfig.autoPushEnabled && (
              <div className="ml-7 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm text-blue-700 dark:text-blue-300">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Auto-push enabled</p>
                    <p className="text-xs mt-1">
                      Each snapshot will be automatically pushed to the default remote branch.
                      Ensure you have proper push permissions configured.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* LLM Configuration */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-purple-500" />
            <h4 className="font-medium text-gray-900 dark:text-gray-100">Commit Messages</h4>
          </div>
          
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={tempConfig.generateCommitMessages}
                onChange={(e) => handleConfigChange({ generateCommitMessages: e.target.checked })}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Generate commit messages using LLM
              </span>
            </label>

            {tempConfig.generateCommitMessages && (
              <div className="ml-7 space-y-2">
                <label className="block text-sm text-gray-700 dark:text-gray-300">
                  LLM Provider:
                </label>
                <select
                  value={tempConfig.llmProvider}
                  onChange={(e) => handleConfigChange({ llmProvider: e.target.value as 'openai' | 'anthropic' | 'custom' })}
                  className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT)</option>
                  <option value="custom">Custom Provider</option>
                </select>
                
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  LLM will analyze git diff to generate descriptive commit messages
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Display Configuration */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-blue-500" />
            <h4 className="font-medium text-gray-900 dark:text-gray-100">Display Settings</h4>
          </div>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                Recent Snapshots to Show:
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={tempConfig.maxRecentSnapshots}
                onChange={(e) => handleConfigChange({ maxRecentSnapshots: parseInt(e.target.value) || 3 })}
                className="block w-20 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Number of recent snapshots to display in chat UI
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                Recent Branches to Show:
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={tempConfig.maxRecentBranches}
                onChange={(e) => handleConfigChange({ maxRecentBranches: parseInt(e.target.value) || 5 })}
                className="block w-20 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Number of recent branches to display for cloned repositories
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      {hasChanges && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 rounded-b-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              You have unsaved changes
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              >
                Reset
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded flex items-center gap-1"
              >
                <Save className="w-3 h-3" />
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SnapshotSettings; 