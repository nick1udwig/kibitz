/**
 * Phase 1.1 Tests: Workspace-Aware Conversation Types
 * 
 * Test suite to verify the new workspace type definitions and utilities
 */

import { describe, it, expect } from '@jest/globals';
import {
  generateWorkspaceId,
  generateWorkspacePath,
  createWorkspaceMapping,
  addWorkspaceToConversation,
  createDefaultWorkspaceSettings,
  hasWorkspaceInfo,
  needsWorkspaceMigration,
  getWorkspaceStatus,
  validateWorkspacePath,
  extractInfoFromWorkspacePath,
  createMockConversationWithWorkspace,
  validateConversationWorkspace
} from '../lib/conversationWorkspaceService';

import {
  ConversationBrief,
  WorkspaceMapping,
  WorkspaceStatus,
  ConversationWorkspaceSettings,
  BranchInfo
} from '../components/LlmChat/context/types';

describe('Phase 1.1: Workspace Types and Utilities', () => {
  const mockProjectId = 'test-project-123';
  const mockConversationId = 'conv-456';
  const mockConversationName = 'Test Conversation';

  describe('Workspace ID Generation', () => {
    it('should generate unique workspace IDs', () => {
      const id1 = generateWorkspaceId(mockConversationId, mockProjectId);
      const id2 = generateWorkspaceId(mockConversationId, mockProjectId);
      
      expect(id1).toMatch(/^ws_test-project-123_conv-456_[a-z0-9]+_[a-z0-9]+$/);
      expect(id2).toMatch(/^ws_test-project-123_conv-456_[a-z0-9]+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('Workspace Path Generation', () => {
    it('should generate valid workspace paths', () => {
      const workspaceId = 'ws_test-project-123_conv-456_abc123_def456';
      const path = generateWorkspacePath(workspaceId, mockConversationName, mockProjectId);
      
      expect(path).toBe('/Users/test/gitrepo/projects/test-project-123/conversations/ws_test-project-123_conv-456_abc123_def456_test-conversation');
    });

    it('should sanitize conversation names', () => {
      const workspaceId = 'ws_test-project-123_conv-456_abc123_def456';
      const path = generateWorkspacePath(workspaceId, 'Test Conversation!@#$%', mockProjectId);
      
      expect(path).toContain('test-conversation');
      expect(path).not.toContain('!@#$%');
    });
  });

  describe('Workspace Mapping Creation', () => {
    it('should create basic workspace mapping', () => {
      const mapping = createWorkspaceMapping(mockConversationId, mockProjectId, mockConversationName);
      
      expect(mapping.conversationId).toBe(mockConversationId);
      expect(mapping.projectId).toBe(mockProjectId);
      expect(mapping.workspaceId).toMatch(/^ws_test-project-123_conv-456_[a-z0-9]+_[a-z0-9]+$/);
      expect(mapping.workspacePath).toContain('/Users/test/gitrepo/projects/test-project-123/conversations/');
      expect(mapping.workspaceStatus).toBe('initializing');
      expect(mapping.sizeInBytes).toBe(0);
      expect(mapping.fileCount).toBe(0);
      expect(mapping.isGitRepository).toBe(false);
    });

    it('should create workspace mapping with Git enabled', () => {
      const mapping = createWorkspaceMapping(mockConversationId, mockProjectId, mockConversationName, {
        initializeGit: true,
        branchName: 'feature/test'
      });
      
      expect(mapping.isGitRepository).toBe(true);
      expect(mapping.defaultBranch).toBe('feature/test');
      expect(mapping.currentBranch).toBe('feature/test');
      expect(mapping.branches).toHaveLength(1);
      expect(mapping.branches![0].name).toBe('feature/test');
      expect(mapping.branches![0].isDefault).toBe(true);
    });
  });

  describe('Conversation Workspace Integration', () => {
    it('should add workspace info to conversation', () => {
      const baseConversation: ConversationBrief = {
        id: mockConversationId,
        name: mockConversationName,
        lastUpdated: new Date(),
        messages: [],
        createdAt: new Date()
      };

      const workspaceMapping = createWorkspaceMapping(mockConversationId, mockProjectId, mockConversationName);
      const updatedConversation = addWorkspaceToConversation(baseConversation, workspaceMapping);

      expect(updatedConversation.workspaceId).toBe(workspaceMapping.workspaceId);
      expect(updatedConversation.workspacePath).toBe(workspaceMapping.workspacePath);
      expect(updatedConversation.workspaceStatus).toBe('initializing');
      expect(updatedConversation.isolatedWorkspace).toBe(true);
      expect(updatedConversation.inheritsFromProject).toBe(false);
    });
  });

  describe('Workspace Settings', () => {
    it('should create default workspace settings', () => {
      const settings = createDefaultWorkspaceSettings();
      
      expect(settings.autoBranch).toBe(false);
      expect(settings.branchPrefix).toBe('conv/');
      expect(settings.autoCommit).toBe(false);
      expect(settings.workspaceIsolation).toBe(true);
      expect(settings.inheritProjectSettings).toBe(true);
      expect(settings.toolExecutionTimeout).toBe(30000);
      expect(settings.allowedTools).toEqual([]);
      expect(settings.customSettings).toEqual({});
    });

    it('should create settings with custom inheritance', () => {
      const settings = createDefaultWorkspaceSettings(false);
      
      expect(settings.inheritProjectSettings).toBe(false);
    });
  });

  describe('Workspace Status Helpers', () => {
    it('should detect conversations with workspace info', () => {
      const conversationWithWorkspace: ConversationBrief = {
        id: mockConversationId,
        name: mockConversationName,
        lastUpdated: new Date(),
        messages: [],
        workspaceId: 'ws_123',
        workspacePath: '/test/path'
      };

      const conversationWithoutWorkspace: ConversationBrief = {
        id: mockConversationId,
        name: mockConversationName,
        lastUpdated: new Date(),
        messages: []
      };

      expect(hasWorkspaceInfo(conversationWithWorkspace)).toBe(true);
      expect(hasWorkspaceInfo(conversationWithoutWorkspace)).toBe(false);
    });

    it('should detect conversations needing migration', () => {
      const conversationWithMessages: ConversationBrief = {
        id: mockConversationId,
        name: mockConversationName,
        lastUpdated: new Date(),
        messages: [
          {
            role: 'user',
            content: 'Hello',
            timestamp: new Date()
          }
        ]
      };

      const conversationWithoutMessages: ConversationBrief = {
        id: mockConversationId,
        name: mockConversationName,
        lastUpdated: new Date(),
        messages: []
      };

      expect(needsWorkspaceMigration(conversationWithMessages)).toBe(true);
      expect(needsWorkspaceMigration(conversationWithoutMessages)).toBe(false);
    });

    it('should get workspace status', () => {
      const conversationWithStatus: ConversationBrief = {
        id: mockConversationId,
        name: mockConversationName,
        lastUpdated: new Date(),
        messages: [],
        workspaceId: 'ws_123',
        workspacePath: '/test/path',
        workspaceStatus: 'active'
      };

      const conversationWithoutStatus: ConversationBrief = {
        id: mockConversationId,
        name: mockConversationName,
        lastUpdated: new Date(),
        messages: []
      };

      expect(getWorkspaceStatus(conversationWithStatus)).toBe('active');
      expect(getWorkspaceStatus(conversationWithoutStatus)).toBe('initializing');
    });
  });

  describe('Path Validation', () => {
    it('should validate correct workspace paths', () => {
      const validPath = '/Users/test/gitrepo/projects/project-123/conversations/ws_project-123_conv-456_abc123_def456_test-conversation';
      const invalidPath = '/invalid/path';

      expect(validateWorkspacePath(validPath)).toBe(true);
      expect(validateWorkspacePath(invalidPath)).toBe(false);
    });

    it('should extract info from workspace path', () => {
      const path = '/Users/test/gitrepo/projects/project-123/conversations/ws_project-123_conv-456_abc123_def456_test-conversation';
      const info = extractInfoFromWorkspacePath(path);

      expect(info).not.toBeNull();
      expect(info!.projectId).toBe('project-123');
      expect(info!.workspaceId).toBe('ws_project-123_conv-456_abc123_def456');
      expect(info!.conversationName).toBe('test-conversation');
    });
  });

  describe('Testing Helpers', () => {
    it('should create mock conversation with workspace', () => {
      const mockConversation = createMockConversationWithWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName
      );

      expect(mockConversation.id).toBe(mockConversationId);
      expect(mockConversation.name).toBe(mockConversationName);
      expect(mockConversation.workspaceId).toBeTruthy();
      expect(mockConversation.workspacePath).toBeTruthy();
      expect(mockConversation.workspaceStatus).toBe('initializing');
      expect(mockConversation.settings).toBeTruthy();
      expect(mockConversation.currentBranch).toBe('main');
      expect(mockConversation.branches).toHaveLength(1);
    });

    it('should validate conversation workspace structure', () => {
      const validConversation = createMockConversationWithWorkspace(
        mockConversationId,
        mockProjectId,
        mockConversationName
      );

      const invalidConversation: ConversationBrief = {
        id: mockConversationId,
        name: mockConversationName,
        lastUpdated: new Date(),
        messages: []
      };

      const validResult = validateConversationWorkspace(validConversation);
      expect(validResult.isValid).toBe(true);
      expect(validResult.errors).toHaveLength(0);

      const invalidResult = validateConversationWorkspace(invalidConversation);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Type Compatibility', () => {
    it('should maintain backward compatibility with existing ConversationBrief', () => {
      // Test that existing conversations without workspace info still work
      const oldConversation: ConversationBrief = {
        id: 'old-conv',
        name: 'Old Conversation',
        lastUpdated: new Date(),
        messages: [],
        createdAt: new Date()
      };

      // Should not throw errors
      expect(() => hasWorkspaceInfo(oldConversation)).not.toThrow();
      expect(() => getWorkspaceStatus(oldConversation)).not.toThrow();
      expect(() => needsWorkspaceMigration(oldConversation)).not.toThrow();
    });
  });
});

// Export test helper functions for manual testing
export {
  generateWorkspaceId,
  generateWorkspacePath,
  createWorkspaceMapping,
  addWorkspaceToConversation,
  createDefaultWorkspaceSettings,
  createMockConversationWithWorkspace,
  validateConversationWorkspace
}; 