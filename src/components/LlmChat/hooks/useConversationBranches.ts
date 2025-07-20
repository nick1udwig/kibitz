import { useState, useCallback, useEffect } from 'react';
import { useStore } from '../../../stores/rootStore';

export interface ConversationBranch {
  branchName: string;
  conversationId: string;
  commitHash: string;
  timestamp: number;
  filesChanged: string[];
  isActive: boolean;
}

export interface BranchSwitchState {
  loading: boolean;
  error: string | null;
  currentBranch: string;
  availableBranches: ConversationBranch[];
}

/**
 * Hook for managing conversation branch switching
 * 🚀 FEATURE: Switch between conversation branches and sync frontend state
 */
export const useConversationBranches = () => {
  const { activeProjectId, executeTool } = useStore();
  const [state, setState] = useState<BranchSwitchState>({
    loading: false,
    error: null,
    currentBranch: 'main',
    availableBranches: []
  });

  /**
   * Get current active branch for the project
   */
  const getCurrentBranch = useCallback(async (): Promise<string> => {
    if (!activeProjectId) return 'main';
    
    try {
      const response = await fetch(`/api/projects/${activeProjectId}/branches/current`);
      const data = await response.json();
      
      if (data.error) {
        console.warn('Failed to get current branch:', data.error);
        return 'main';
      }
      
      return data.currentBranch || 'main';
    } catch (error) {
      console.error('Error fetching current branch:', error);
      return 'main';
    }
  }, [activeProjectId]);

  /**
   * Switch to a specific conversation branch
   */
  const switchToBranch = useCallback(async (branchName: string): Promise<boolean> => {
    if (!activeProjectId) {
      setState(prev => ({ ...prev, error: 'No active project' }));
      return false;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(`/api/projects/${activeProjectId}/branches/switch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ branchName })
      });

      const data = await response.json();

      if (data.success) {
        setState(prev => ({
          ...prev,
          loading: false,
          currentBranch: data.currentBranch,
          error: null
        }));
        
        console.log(`✅ Successfully switched to branch: ${data.currentBranch}`);
        return true;
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          error: data.error || 'Failed to switch branch'
        }));
        return false;
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: `Switch failed: ${error}`
      }));
      return false;
    }
  }, [activeProjectId]);

  /**
   * Get all available conversation branches
   */
  const getAvailableBranches = useCallback(async (): Promise<ConversationBranch[]> => {
    if (!activeProjectId) return [];

    try {
      // Use the existing branches API endpoint
      const response = await fetch(`/api/projects/${activeProjectId}/branches`);
      const data = await response.json();

      if (data.error) {
        console.warn('Failed to get branches:', data.error);
        return [];
      }

      // Filter for conversation branches and map to our interface
      const conversationBranches = (data.branches || [])
        .filter((branch: any) => branch.branchName?.startsWith('conversation/'))
        .map((branch: any): ConversationBranch => ({
          branchName: branch.branchName,
          conversationId: branch.branchName.replace('conversation/', ''),
          commitHash: branch.commitHash || '',
          timestamp: branch.timestamp || Date.now(),
          filesChanged: branch.filesChanged || [],
          isActive: branch.branchName === state.currentBranch
        }));

      setState(prev => ({ ...prev, availableBranches: conversationBranches }));
      return conversationBranches;
    } catch (error) {
      console.error('Error fetching available branches:', error);
      return [];
    }
  }, [activeProjectId, state.currentBranch]);

  /**
   * Refresh current branch and available branches
   */
  const refreshBranches = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));
    
    try {
      const [currentBranch, availableBranches] = await Promise.all([
        getCurrentBranch(),
        getAvailableBranches()
      ]);
      
      setState(prev => ({
        ...prev,
        loading: false,
        currentBranch,
        availableBranches,
        error: null
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: `Refresh failed: ${error}`
      }));
    }
  }, [getCurrentBranch, getAvailableBranches]);

  // Auto-refresh when project changes
  useEffect(() => {
    if (activeProjectId) {
      refreshBranches();
    }
  }, [activeProjectId, refreshBranches]);

  return {
    ...state,
    switchToBranch,
    refreshBranches,
    getCurrentBranch,
    getAvailableBranches
  };
}; 