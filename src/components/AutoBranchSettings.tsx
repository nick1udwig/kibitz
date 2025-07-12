/**
 * ⚙️ Auto-Branch Settings Panel - Configuration UI
 * 
 * React component for configuring auto-branch behavior with
 * modern toggle switches and input controls.
 */

import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  GitBranch, 
  MessageSquare, 
  Shield, 
  Archive,
  Info,
  Save,
  RotateCcw,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { PreRunConfig } from '../lib/preRunBranchManager';

export interface AutoBranchSettingsProps {
  config: PreRunConfig;
  onConfigChange: (config: PreRunConfig) => void;
  onSave: () => Promise<void>;
  onReset: () => void;
  saving?: boolean;
  className?: string;
}

interface SaveState {
  status: 'idle' | 'saving' | 'success' | 'error';
  message?: string;
}

export const AutoBranchSettings: React.FC<AutoBranchSettingsProps> = ({
  config,
  onConfigChange,
  onSave,
  onReset,
  saving = false,
  className = ''
}) => {
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [localConfig, setLocalConfig] = useState<PreRunConfig>(config);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const handleConfigUpdate = (updates: Partial<PreRunConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);
    onConfigChange(newConfig);
  };

  const handleSave = async () => {
    setSaveState({ status: 'saving' });
    
    try {
      await onSave();
      setSaveState({ 
        status: 'success', 
        message: 'Settings saved successfully!' 
      });
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSaveState({ status: 'idle' });
      }, 3000);
    } catch (error) {
      setSaveState({ 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Failed to save settings' 
      });
    }
  };

  const handleReset = () => {
    onReset();
    setSaveState({ 
      status: 'success', 
      message: 'Settings reset to defaults' 
    });
    
    setTimeout(() => {
      setSaveState({ status: 'idle' });
    }, 3000);
  };

  const ToggleSwitch: React.FC<{ 
    checked: boolean; 
    onChange: (checked: boolean) => void;
    disabled?: boolean;
  }> = ({ checked, onChange, disabled = false }) => (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${checked ? 'bg-blue-600' : 'bg-gray-200'}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${checked ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  );

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900">Auto-Branch Settings</h3>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Status Message */}
        {saveState.status !== 'idle' && (
          <div className={`p-3 rounded-md flex items-center gap-2 ${
            saveState.status === 'success' 
              ? 'bg-green-50 text-green-800 border border-green-200'
              : saveState.status === 'error'
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-blue-50 text-blue-800 border border-blue-200'
          }`}>
            {saveState.status === 'success' && <CheckCircle className="h-4 w-4" />}
            {saveState.status === 'error' && <AlertCircle className="h-4 w-4" />}
            {saveState.status === 'saving' && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            )}
            <span className="text-sm">{saveState.message}</span>
          </div>
        )}

        {/* Main Enable/Disable Toggle */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GitBranch className="h-5 w-5 text-gray-600" />
              <div>
                <h4 className="font-medium text-gray-900">Enable Auto-Branching</h4>
                <p className="text-sm text-gray-600">
                  Automatically create branches before test and build runs
                </p>
              </div>
            </div>
            <ToggleSwitch
              checked={localConfig.enabled}
              onChange={(enabled) => handleConfigUpdate({ enabled })}
            />
          </div>
        </div>

        {/* Configuration Options */}
        <div className="space-y-4">
          {/* Branch Prefix */}
          <div className="flex items-center justify-between py-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Branch Prefix
              </label>
              <p className="text-xs text-gray-500">
                Prefix for auto-created branch names (e.g., "auto/2025-01-15-14-30-01")
              </p>
            </div>
            <div className="ml-4">
              <input
                type="text"
                value={localConfig.branchPrefix}
                onChange={(e) => handleConfigUpdate({ branchPrefix: e.target.value })}
                disabled={!localConfig.enabled}
                className="w-24 px-3 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:opacity-50"
                placeholder="auto"
              />
            </div>
          </div>

          {/* Auto Commit */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Archive className="h-4 w-4 text-gray-500" />
              <div>
                <h4 className="text-sm font-medium text-gray-700">Auto Commit</h4>
                <p className="text-xs text-gray-500">
                  Automatically commit changes when creating branches
                </p>
              </div>
            </div>
            <ToggleSwitch
              checked={localConfig.autoCommit}
              onChange={(autoCommit) => handleConfigUpdate({ autoCommit })}
              disabled={!localConfig.enabled}
            />
          </div>

          {/* Generate Commit Messages */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-4 w-4 text-gray-500" />
              <div>
                <h4 className="text-sm font-medium text-gray-700">Smart Commit Messages</h4>
                <p className="text-xs text-gray-500">
                  Use LLM to generate meaningful commit messages
                </p>
              </div>
            </div>
            <ToggleSwitch
              checked={localConfig.generateCommitMessage}
              onChange={(generateCommitMessage) => handleConfigUpdate({ generateCommitMessage })}
              disabled={!localConfig.enabled || !localConfig.autoCommit}
            />
          </div>

          {/* Create Backup */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4 text-gray-500" />
              <div>
                <h4 className="text-sm font-medium text-gray-700">Create Backup Branches</h4>
                <p className="text-xs text-gray-500">
                  Create backup branches before switching
                </p>
              </div>
            </div>
            <ToggleSwitch
              checked={localConfig.createBackup}
              onChange={(createBackup) => handleConfigUpdate({ createBackup })}
              disabled={!localConfig.enabled}
            />
          </div>

          {/* Stash Changes */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Archive className="h-4 w-4 text-gray-500" />
              <div>
                <h4 className="text-sm font-medium text-gray-700">Stash Uncommitted Changes</h4>
                <p className="text-xs text-gray-500">
                  Automatically stash uncommitted work before branching
                </p>
              </div>
            </div>
            <ToggleSwitch
              checked={localConfig.stashChanges}
              onChange={(stashChanges) => handleConfigUpdate({ stashChanges })}
              disabled={!localConfig.enabled}
            />
          </div>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">How Auto-Branching Works</p>
              <ul className="text-xs space-y-1 text-blue-700">
                <li>• Detects test/build commands automatically</li>
                <li>• Creates timestamped branches before execution</li>
                <li>• Uses LLM to generate smart commit messages</li>
                <li>• Maintains branch history for easy rollback</li>
                <li>• Integrates seamlessly with your existing workflow</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-md transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to Defaults
          </button>

          <button
            onClick={handleSave}
            disabled={saving || saveState.status === 'saving'}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveState.status === 'saving' ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// Configuration presets
export const ConfigPresets = {
  conservative: {
    enabled: true,
    branchPrefix: 'auto',
    autoCommit: false,
    generateCommitMessage: false,
    createBackup: true,
    stashChanges: true
  } as PreRunConfig,
  
  balanced: {
    enabled: true,
    branchPrefix: 'auto',
    autoCommit: true,
    generateCommitMessage: true,
    createBackup: true,
    stashChanges: true
  } as PreRunConfig,
  
  aggressive: {
    enabled: true,
    branchPrefix: 'auto',
    autoCommit: true,
    generateCommitMessage: true,
    createBackup: false,
    stashChanges: false
  } as PreRunConfig,
  
  disabled: {
    enabled: false,
    branchPrefix: 'auto',
    autoCommit: false,
    generateCommitMessage: false,
    createBackup: false,
    stashChanges: false
  } as PreRunConfig
};

export default AutoBranchSettings; 