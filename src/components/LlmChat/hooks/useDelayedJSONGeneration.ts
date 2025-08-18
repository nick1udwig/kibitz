import { useCallback, useRef } from 'react';
import { useStore } from '../../../stores/rootStore';

/**
 * Hook that triggers JSON generation 1 minute after assistant finishes responding
 * 🚀 UNIFIED APPROACH: Single source of truth for JSON generation timing
 */
export const useDelayedJSONGeneration = () => {
  const { activeProjectId } = useStore();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Generate JSON files with REAL git data from the actual project
   * 🚀 NEW: Uses server-side API for reliable filesystem operations
   */
  const generateRealJSONFiles = useCallback(async (projectId: string) => {
    try {
      console.log('📋 DelayedJSONGeneration: Starting server-side JSON generation...');
      
      // Call server-side API to generate JSON files
      const response = await fetch(`/api/projects/${projectId}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`✅ DelayedJSONGeneration: Server-side JSON generation successful:`, {
          projectId: result.projectId,
          fileSize: result.fileSize,
          path: result.jsonFilePath
        });
      } else {
        const error = await response.json();
        console.warn('⚠️ DelayedJSONGeneration: Server-side generation failed:', error);
      }
      
    } catch (error) {
      console.warn('⚠️ DelayedJSONGeneration: Failed to generate JSON files:', error);
    }
  }, []);

  /**
   * Schedule JSON generation 1 minute after assistant finishes responding
   */
  const scheduleJSONGeneration = useCallback(() => {
    if (!activeProjectId) {
      console.log('❌ DelayedJSONGeneration: No active project ID');
      return;
    }

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      console.log('🔄 DelayedJSONGeneration: Cleared existing timeout');
    }

    // Schedule JSON generation for 1 minute from now
    const delay = 60000; // 1 minute = 60,000ms
    
    timeoutRef.current = setTimeout(async () => {
      console.log('⏰ DelayedJSONGeneration: 1 minute delay complete, generating JSON...');
      await generateRealJSONFiles(activeProjectId);
    }, delay);

    console.log(`⏰ DelayedJSONGeneration: Scheduled JSON generation for 1 minute from now`);
  }, [activeProjectId, generateRealJSONFiles]);

  /**
   * Cancel any pending JSON generation
   */
  const cancelJSONGeneration = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      console.log('❌ DelayedJSONGeneration: Cancelled pending JSON generation');
    }
  }, []);

  return {
    scheduleJSONGeneration,
    cancelJSONGeneration
  };
}; 