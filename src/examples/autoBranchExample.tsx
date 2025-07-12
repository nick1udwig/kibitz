/**
 * 🎯 Auto-Branch Integration Example
 * 
 * Example React component showing how to integrate the complete
 * auto-branch system into your application.
 */

import React, { useState, useEffect } from 'react';
import { 
  AutoBranchManager, 
  AutoBranchState, 
  createAutoBranchManager 
} from '../lib/autoBranchManager';
import { BranchHistoryPanel } from '../components/BranchHistoryPanel';
import { AutoBranchSettings, ConfigPresets } from '../components/AutoBranchSettings';

interface AutoBranchExampleProps {
  projectPath: string;
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>;
  serverId: string;
}

export const AutoBranchExample: React.FC<AutoBranchExampleProps> = ({
  projectPath,
  executeTool,
  serverId
}) => {
  const [manager, setManager] = useState<AutoBranchManager | null>(null);
  const [state, setState] = useState<AutoBranchState | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'history' | 'settings'>('history');

  // Initialize auto-branch system
  useEffect(() => {
    const initializeManager = async () => {
      try {
        setLoading(true);
        
        const autoBranchManager = await createAutoBranchManager({
          projectPath,
          executeTool,
          serverId,
          onStateChange: (newState) => {
            setState(newState);
            console.log('Auto-branch state updated:', newState);
          }
        });
        
        setManager(autoBranchManager);
        setState(autoBranchManager.getState());
      } catch (error) {
        console.error('Failed to initialize auto-branch system:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeManager();
  }, [projectPath, executeTool, serverId]);

  // Example: Wrap command execution with auto-branching
  const executeCommand = async (command: string) => {
    if (!manager) return;

    try {
      console.log(`🚀 Executing command with auto-branching: ${command}`);
      
      const result = await manager.wrapCommand(command);
      
      if (result.success) {
        console.log('✅ Command executed successfully');
        if (result.branchInfo?.branchCreated) {
          console.log(`🌿 Auto-branch created: ${result.branchInfo.branchName}`);
        }
      } else {
        console.error('❌ Command failed:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('Command execution error:', error);
    }
  };

  // Handle rollback operations
  const handleRevert = async (branchName: string) => {
    if (!manager) return { success: false, error: 'Manager not initialized' };
    
    try {
      const result = await manager.revertToBranch(branchName);
      if (result.success) {
        console.log(`✅ Successfully reverted to ${branchName}`);
      }
      return result;
    } catch (error) {
      console.error('Revert failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  // Handle settings changes
  const handleConfigChange = async (newConfig: any) => {
    if (!manager) return;
    
    try {
      await manager.updateConfig(newConfig);
    } catch (error) {
      console.error('Failed to update config:', error);
    }
  };

  const handleSaveSettings = async () => {
    // Settings are automatically saved when updated
    console.log('Settings saved successfully');
  };

  const handleResetSettings = async () => {
    if (!manager) return;
    
    try {
      await manager.resetConfig();
    } catch (error) {
      console.error('Failed to reset settings:', error);
    }
  };

  const refreshData = async () => {
    if (!manager) return;
    
    try {
      await manager.refreshData();
    } catch (error) {
      console.error('Failed to refresh data:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Initializing auto-branch system...</span>
      </div>
    );
  }

  if (!manager || !state) {
    return (
      <div className="p-8 text-center text-red-600">
        Failed to initialize auto-branch system. Check console for errors.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          🌿 Auto-Branch System
        </h1>
        <p className="text-gray-600 mb-4">
          Automatic branch creation and rollback for seamless development workflow
        </p>
        
        {/* Status Indicators */}
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            state.enabled 
              ? 'bg-green-100 text-green-800' 
              : 'bg-gray-100 text-gray-600'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              state.enabled ? 'bg-green-500' : 'bg-gray-400'
            }`} />
            {state.enabled ? 'Enabled' : 'Disabled'}
          </div>
          
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Branches: {state.stats.totalBranches}</span>
            <span>•</span>
            <span>This Week: {state.stats.lastWeek}</span>
          </div>
        </div>
      </div>

      {/* Example Command Execution */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">🚀 Test Command Execution</h2>
        <div className="space-y-3">
          <button
            onClick={() => executeCommand('npm test')}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Run Tests (with auto-branching)
          </button>
          
          <button
            onClick={() => executeCommand('npm run build')}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            Build Project (with auto-branching)
          </button>
          
          <button
            onClick={() => manager.revertToLast()}
            className="w-full px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
          >
            Quick Revert to Last Branch
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('history')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'history'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Branch History
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'settings'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Settings
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'history' && (
            <BranchHistoryPanel
              rollbackOptions={state.rollbackOptions}
              onRevert={handleRevert}
              onRefresh={refreshData}
              loading={false}
            />
          )}

          {activeTab === 'settings' && (
            <AutoBranchSettings
              config={state.config}
              onConfigChange={handleConfigChange}
              onSave={handleSaveSettings}
              onReset={handleResetSettings}
              saving={false}
            />
          )}
        </div>
      </div>

      {/* Usage Instructions */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">
          📚 Usage Instructions
        </h3>
        <div className="text-sm text-blue-800 space-y-2">
          <p><strong>Automatic Operation:</strong> Auto-branching works automatically when you run test or build commands.</p>
          <p><strong>Manual Control:</strong> Use the buttons above to test the system or revert to previous states.</p>
          <p><strong>Configuration:</strong> Adjust settings in the Settings tab to customize behavior.</p>
          <p><strong>Branch History:</strong> View and revert to any auto-created branch from the History tab.</p>
        </div>
      </div>
    </div>
  );
};

// Example integration hook for existing applications
export const useAutoBranch = (
  projectPath: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>,
  serverId: string
) => {
  const [manager, setManager] = useState<AutoBranchManager | null>(null);
  const [state, setState] = useState<AutoBranchState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeManager = async () => {
      try {
        const autoBranchManager = await createAutoBranchManager({
          projectPath,
          executeTool,
          serverId,
          onStateChange: setState
        });
        
        setManager(autoBranchManager);
        setState(autoBranchManager.getState());
      } catch (error) {
        console.error('Failed to initialize auto-branch system:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeManager();
  }, [projectPath, executeTool, serverId]);

  return {
    manager,
    state,
    loading,
    isEnabled: manager?.isEnabled() || false,
    isReady: manager?.isReady() || false
  };
};

export default AutoBranchExample; 