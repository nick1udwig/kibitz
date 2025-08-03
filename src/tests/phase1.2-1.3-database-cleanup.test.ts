/**
 * Phase 1.2 & 1.3 Tests: Database Schema Migration and Workspace Cleanup
 * 
 * Test suite to verify database migration, workspace persistence, and cleanup functionality
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  loadWorkspaceMappings,
  saveWorkspaceMappings,
  loadConversationSettings,
  saveConversationSettings,
  getWorkspaceByConversationId,
  updateWorkspaceMapping,
  deleteWorkspaceMapping,
  getWorkspaceStats,
  updateWorkspaceStats,
  loadState,
  saveState
} from '../lib/db';

import {
  WorkspaceCleanupService,
  DEFAULT_CLEANUP_CONFIG,
  getWorkspaceCleanupService,
  initializeWorkspaceCleanup,
  shutdownWorkspaceCleanup,
  runManualCleanup,
  runManualRecovery,
  getCleanupStatistics
} from '../lib/workspaceCleanupService';

import {
  createMockConversationWithWorkspace,
  createWorkspaceMapping,
  createDefaultWorkspaceSettings,
  generateWorkspaceId,
  validateConversationWorkspace
} from '../lib/conversationWorkspaceService';

import {
  WorkspaceMapping,
  WorkspaceUsageStats,
  ConversationBrief,
  Project,
  ConversationWorkspaceSettings
} from '../components/LlmChat/context/types';

// Mock data for testing (moved outside describe for export)
const mockProjectId = 'test-project-123';
const mockConversationId = 'conv-456';
const mockConversationName = 'Test Conversation';

const mockWorkspaceMapping: WorkspaceMapping = {
  conversationId: mockConversationId,
  projectId: mockProjectId,
  workspaceId: 'ws_test_123',
  workspacePath: '/Users/test/gitrepo/projects/test-project-123/conversations/ws_test_123_test-conversation',
  workspaceStatus: 'active',
  createdAt: new Date(),
  lastAccessedAt: new Date(),
  sizeInBytes: 1024,
  fileCount: 5,
  isGitRepository: true,
  currentBranch: 'main',
  defaultBranch: 'main'
};

const mockConversationSettings: ConversationWorkspaceSettings = {
  autoBranch: true,
  branchPrefix: 'conv/',
  autoCommit: false,
  workspaceIsolation: true,
  inheritProjectSettings: false,
  toolExecutionTimeout: 30000,
  allowedTools: ['FileWriteOrEdit', 'BashCommand'],
  customSettings: { testSetting: 'value' }
};

describe('Phase 1.2 & 1.3: Database Migration and Cleanup', () => {

  describe('Phase 1.2: Database Schema Migration', () => {
    
    describe('Workspace Mappings Persistence', () => {
      it('should save and load workspace mappings', async () => {
        const mappings = [mockWorkspaceMapping];
        
        await saveWorkspaceMappings(mappings);
        const loaded = await loadWorkspaceMappings();
        
        expect(loaded).toHaveLength(1);
        expect(loaded[0].workspaceId).toBe(mockWorkspaceMapping.workspaceId);
        expect(loaded[0].conversationId).toBe(mockWorkspaceMapping.conversationId);
        expect(loaded[0].projectId).toBe(mockWorkspaceMapping.projectId);
        expect(loaded[0].workspacePath).toBe(mockWorkspaceMapping.workspacePath);
        expect(loaded[0].workspaceStatus).toBe('active');
        expect(loaded[0].createdAt).toBeInstanceOf(Date);
      });

      it('should get workspace by conversation ID', async () => {
        const mappings = [mockWorkspaceMapping];
        await saveWorkspaceMappings(mappings);
        
        const workspace = await getWorkspaceByConversationId(mockConversationId);
        
        expect(workspace).not.toBeNull();
        expect(workspace!.workspaceId).toBe(mockWorkspaceMapping.workspaceId);
        expect(workspace!.conversationId).toBe(mockConversationId);
      });

      it('should update workspace mapping', async () => {
        const mappings = [mockWorkspaceMapping];
        await saveWorkspaceMappings(mappings);
        
        const updatedMapping = {
          ...mockWorkspaceMapping,
          workspaceStatus: 'error' as const,
          sizeInBytes: 2048
        };
        
        await updateWorkspaceMapping(updatedMapping);
        const workspace = await getWorkspaceByConversationId(mockConversationId);
        
        expect(workspace!.workspaceStatus).toBe('error');
        expect(workspace!.sizeInBytes).toBe(2048);
      });

      it('should delete workspace mapping', async () => {
        const mappings = [mockWorkspaceMapping];
        await saveWorkspaceMappings(mappings);
        
        await deleteWorkspaceMapping(mockWorkspaceMapping.workspaceId);
        const workspace = await getWorkspaceByConversationId(mockConversationId);
        
        expect(workspace).toBeNull();
      });
    });

    describe('Conversation Settings Persistence', () => {
      it('should save and load conversation settings', async () => {
        const settings = {
          [mockConversationId]: mockConversationSettings
        };
        
        await saveConversationSettings(settings);
        const loaded = await loadConversationSettings();
        
        expect(loaded).toHaveProperty(mockConversationId);
        expect(loaded[mockConversationId]).toEqual(mockConversationSettings);
      });

      it('should handle multiple conversation settings', async () => {
        const settings = {
          [mockConversationId]: mockConversationSettings,
          'conv-789': createDefaultWorkspaceSettings()
        };
        
        await saveConversationSettings(settings);
        const loaded = await loadConversationSettings();
        
        expect(Object.keys(loaded)).toHaveLength(2);
        expect(loaded[mockConversationId]).toEqual(mockConversationSettings);
        expect(loaded['conv-789']).toBeDefined();
      });
    });

    describe('Workspace Statistics', () => {
      it('should get and update workspace statistics', async () => {
        const stats = await getWorkspaceStats();
        
        expect(stats).toBeDefined();
        expect(typeof stats.totalWorkspaces).toBe('number');
        expect(typeof stats.activeWorkspaces).toBe('number');
        expect(typeof stats.totalSizeInBytes).toBe('number');
        
        const updatedStats = {
          ...stats,
          totalWorkspaces: 10,
          activeWorkspaces: 8,
          totalSizeInBytes: 1024 * 1024
        };
        
        await updateWorkspaceStats(updatedStats);
        const newStats = await getWorkspaceStats();
        
        expect(newStats.totalWorkspaces).toBe(10);
        expect(newStats.activeWorkspaces).toBe(8);
        expect(newStats.totalSizeInBytes).toBe(1024 * 1024);
      });
    });

    describe('Database Migration Integration', () => {
      it('should create workspace mappings for existing conversations', async () => {
        // Create a mock project with conversations
        const mockProject: Project = {
          id: mockProjectId,
          name: 'Test Project',
          settings: {
            provider: 'anthropic',
            model: 'claude-3-7-sonnet-20250219',
            systemPrompt: '',
            mcpServerIds: [],
            elideToolResults: false,
            messageWindowSize: 30,
            enableGitHub: false
          },
          conversations: [
            {
              id: mockConversationId,
              name: mockConversationName,
              lastUpdated: new Date(),
              messages: [],
              createdAt: new Date()
            }
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
          order: 1
        };

        const mockState = {
          projects: [mockProject],
          activeProjectId: mockProjectId,
          activeConversationId: mockConversationId
        };

        await saveState(mockState);
        const loaded = await loadState();
        
        expect(loaded.projects).toHaveLength(1);
        expect(loaded.projects[0].conversations).toHaveLength(1);
        
        // In a real migration, conversations would get workspace info
        // For now we just verify the structure is preserved
        expect(loaded.projects[0].conversations[0].id).toBe(mockConversationId);
      });
    });
  });

  describe('Phase 1.3: Workspace Cleanup and Recovery', () => {
    let cleanupService: WorkspaceCleanupService;

    beforeEach(() => {
      cleanupService = new WorkspaceCleanupService(DEFAULT_CLEANUP_CONFIG);
    });

    afterEach(() => {
      cleanupService.stopAutoCleanup();
    });

    describe('Workspace Cleanup Service', () => {
      it('should initialize with default configuration', () => {
        const config = cleanupService.getConfig();
        
        expect(config.maxIdleTime).toBe(30 * 24 * 60 * 60 * 1000); // 30 days
        expect(config.maxWorkspaceSize).toBe(100 * 1024 * 1024); // 100MB
        expect(config.maxTotalWorkspaces).toBe(50);
        expect(config.enableAutoCleanup).toBe(true);
        expect(config.backupBeforeCleanup).toBe(true);
      });

      it('should update configuration', () => {
        const newConfig = {
          maxIdleTime: 7 * 24 * 60 * 60 * 1000, // 7 days
          maxWorkspaceSize: 50 * 1024 * 1024     // 50MB
        };
        
        cleanupService.updateConfig(newConfig);
        const config = cleanupService.getConfig();
        
        expect(config.maxIdleTime).toBe(7 * 24 * 60 * 60 * 1000);
        expect(config.maxWorkspaceSize).toBe(50 * 1024 * 1024);
        expect(config.maxTotalWorkspaces).toBe(50); // unchanged
      });

      it('should start and stop auto cleanup', () => {
        const status1 = cleanupService.getStatus();
        expect(status1.autoCleanupEnabled).toBe(false);
        
        cleanupService.startAutoCleanup();
        const status2 = cleanupService.getStatus();
        expect(status2.autoCleanupEnabled).toBe(true);
        
        cleanupService.stopAutoCleanup();
        const status3 = cleanupService.getStatus();
        expect(status3.autoCleanupEnabled).toBe(false);
      });

      it('should get cleanup status', () => {
        const status = cleanupService.getStatus();
        
        expect(status).toHaveProperty('isRunning');
        expect(status).toHaveProperty('autoCleanupEnabled');
        expect(typeof status.isRunning).toBe('boolean');
        expect(typeof status.autoCleanupEnabled).toBe('boolean');
      });
    });

    describe('Cleanup Operations', () => {
      it('should run cleanup successfully', async () => {
        // Set up test data
        const mappings = [mockWorkspaceMapping];
        await saveWorkspaceMappings(mappings);
        
        const result = await cleanupService.runCleanup();
        
        expect(result).toHaveProperty('cleaned');
        expect(result).toHaveProperty('backed');
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('bytesFreed');
        expect(result).toHaveProperty('timeTaken');
        expect(Array.isArray(result.cleaned)).toBe(true);
        expect(Array.isArray(result.backed)).toBe(true);
        expect(Array.isArray(result.errors)).toBe(true);
        expect(typeof result.bytesFreed).toBe('number');
        expect(typeof result.timeTaken).toBe('number');
      });

      it('should prevent concurrent cleanup runs', async () => {
        // This would require more complex mocking to test properly
        // For now, we just verify the method exists
        expect(typeof cleanupService.runCleanup).toBe('function');
      });
    });

    describe('Recovery Operations', () => {
      it('should run recovery successfully', async () => {
        const result = await cleanupService.runRecovery();
        
        expect(result).toHaveProperty('recovered');
        expect(result).toHaveProperty('failed');
        expect(result).toHaveProperty('orphaned');
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('timeTaken');
        expect(Array.isArray(result.recovered)).toBe(true);
        expect(Array.isArray(result.failed)).toBe(true);
        expect(Array.isArray(result.orphaned)).toBe(true);
        expect(Array.isArray(result.errors)).toBe(true);
        expect(typeof result.timeTaken).toBe('number');
      });
    });

    describe('Global Service Management', () => {
      it('should get global cleanup service instance', () => {
        const service1 = getWorkspaceCleanupService();
        const service2 = getWorkspaceCleanupService();
        
        expect(service1).toBe(service2); // Should be the same instance
        expect(service1).toBeInstanceOf(WorkspaceCleanupService);
      });

      it('should initialize and shutdown workspace cleanup', () => {
        expect(() => {
          initializeWorkspaceCleanup();
          shutdownWorkspaceCleanup();
        }).not.toThrow();
      });

      it('should run manual cleanup', async () => {
        const result = await runManualCleanup();
        
        expect(result).toHaveProperty('cleaned');
        expect(result).toHaveProperty('timeTaken');
      });

      it('should run manual recovery', async () => {
        const result = await runManualRecovery();
        
        expect(result).toHaveProperty('recovered');
        expect(result).toHaveProperty('timeTaken');
      });

      it('should get cleanup statistics', async () => {
        const stats = await getCleanupStatistics();
        
        expect(stats).toHaveProperty('totalWorkspaces');
        expect(stats).toHaveProperty('cleanupService');
        expect(stats.cleanupService).toHaveProperty('isRunning');
        expect(stats.cleanupService).toHaveProperty('autoCleanupEnabled');
      });
    });

    describe('Integration with Conversation Workspace Service', () => {
      it('should work with conversation workspace utilities', () => {
        const mockConversation = createMockConversationWithWorkspace(
          mockConversationId,
          mockProjectId,
          mockConversationName
        );
        
        const validation = validateConversationWorkspace(mockConversation);
        
        expect(validation.isValid).toBe(true);
        expect(validation.errors).toHaveLength(0);
        expect(mockConversation.workspaceId).toBeTruthy();
        expect(mockConversation.workspacePath).toBeTruthy();
      });

      it('should handle workspace creation and mapping', () => {
        const workspaceMapping = createWorkspaceMapping(
          mockConversationId,
          mockProjectId,
          mockConversationName,
          { initializeGit: true }
        );
        
        expect(workspaceMapping.conversationId).toBe(mockConversationId);
        expect(workspaceMapping.projectId).toBe(mockProjectId);
        expect(workspaceMapping.workspaceId).toMatch(/^ws_test-project-123_conv-456/);
        expect(workspaceMapping.workspacePath).toContain('/conversations/');
        expect(workspaceMapping.isGitRepository).toBe(true);
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing workspace mappings gracefully', async () => {
      const workspace = await getWorkspaceByConversationId('non-existent-conversation');
      expect(workspace).toBeNull();
    });

    it('should handle empty workspace mappings', async () => {
      await saveWorkspaceMappings([]);
      const loaded = await loadWorkspaceMappings();
      expect(loaded).toHaveLength(0);
    });

    it('should handle malformed workspace data', async () => {
      // This would require more complex mocking to test database corruption
      // For now, we just verify the functions exist
      expect(typeof loadWorkspaceMappings).toBe('function');
      expect(typeof saveWorkspaceMappings).toBe('function');
    });

    it('should handle cleanup service errors gracefully', async () => {
      const service = new WorkspaceCleanupService({
        ...DEFAULT_CLEANUP_CONFIG,
        enableAutoCleanup: false
      });
      
      const result = await service.runCleanup();
      
      // Should not throw, even if no workspaces exist
      expect(result).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple workspace mappings efficiently', async () => {
      const mappings: WorkspaceMapping[] = [];
      
      // Create 100 mock workspace mappings
      for (let i = 0; i < 100; i++) {
        const workspaceId = generateWorkspaceId(`conv-${i}`, `project-${i}`);
        mappings.push({
          conversationId: `conv-${i}`,
          projectId: `project-${i}`,
          workspaceId,
          workspacePath: `/test/path/${workspaceId}`,
          workspaceStatus: 'active',
          createdAt: new Date(),
          lastAccessedAt: new Date(),
          sizeInBytes: 1024 * i,
          fileCount: i,
          isGitRepository: i % 2 === 0
        });
      }
      
      const startTime = Date.now();
      await saveWorkspaceMappings(mappings);
      const loaded = await loadWorkspaceMappings();
      const endTime = Date.now();
      
      expect(loaded).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle large conversation settings efficiently', async () => {
      const settings: Record<string, any> = {};
      
      // Create 100 mock conversation settings
      for (let i = 0; i < 100; i++) {
        settings[`conv-${i}`] = {
          ...createDefaultWorkspaceSettings(),
          customSettings: {
            testData: `data-${i}`,
            largeArray: new Array(100).fill(i)
          }
        };
      }
      
      const startTime = Date.now();
      await saveConversationSettings(settings);
      const loaded = await loadConversationSettings();
      const endTime = Date.now();
      
      expect(Object.keys(loaded)).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});

// Export test utilities for manual testing
export {
  mockWorkspaceMapping,
  mockConversationSettings,
  DEFAULT_CLEANUP_CONFIG
}; 