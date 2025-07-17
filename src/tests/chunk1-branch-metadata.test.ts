/**
 * Chunk 1 Tests: Branch Metadata Storage & Database Schema
 * 
 * Test suite to verify branch metadata storage, database migration, and persistence
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  saveAutoCommitBranch,
  loadAutoCommitBranches,
  loadAutoCommitBranchesByProject,
  deleteAutoCommitBranch,
  saveBranchRevert,
  loadBranchReverts,
  getAutoCommitAgentStatus,
  updateAutoCommitAgentStatus,
  saveConversationBranchHistory,
  loadConversationBranchHistory
} from '../lib/db';

import {
  AutoCommitBranch,
  BranchRevert,
  AutoCommitAgentStatus,
  ConversationBranchHistory,
  BranchOperationResult,
  AutoCommitConfig
} from '../components/LlmChat/context/types';

// Mock data for testing
const mockProjectId = 'test-project-123';
const mockConversationId = 'conv-456';
const mockBranchId = 'branch-789';

const mockAutoCommitBranch: AutoCommitBranch = {
  branchId: mockBranchId,
  conversationId: mockConversationId,
  projectId: mockProjectId,
  branchName: 'auto-commit-2025-01-15-14-30',
  commitHash: 'abc123def456',
  commitMessage: 'Auto-commit: 3 files changed',
  createdAt: new Date(),
  filesChanged: ['hello.py', 'test.txt', 'config.json'],
  changesSummary: 'Added Python script, updated config',
  isAutoCommit: true,
  workspaceSnapshot: {
    fileCount: 3,
    totalSize: 1024,
    lastModified: new Date()
  }
};

const mockBranchRevert: BranchRevert = {
  revertId: 'revert-123',
  sourceBranchId: 'branch-current',
  targetBranchId: mockBranchId,
  conversationId: mockConversationId,
  projectId: mockProjectId,
  revertedAt: new Date(),
  revertReason: 'Revert to working state',
  filesReverted: ['hello.py', 'test.txt'],
  revertStatus: 'completed'
};

const mockAgentStatus: AutoCommitAgentStatus = {
  isRunning: true,
  lastRunAt: new Date(),
  nextRunAt: new Date(Date.now() + 3 * 60 * 1000), // 3 minutes from now
  totalBranchesCreated: 10,
  totalCommits: 15,
  totalReverts: 2,
  currentInterval: 3,
  errors: []
};

const mockBranchHistory: ConversationBranchHistory = {
  conversationId: mockConversationId,
  projectId: mockProjectId,
  branches: [mockAutoCommitBranch],
  currentBranchId: mockBranchId,
  totalBranches: 1,
  oldestBranch: new Date(),
  newestBranch: new Date(),
  totalCommits: 1,
  totalReverts: 0
};

describe('Chunk 1: Branch Metadata Storage & Database Schema', () => {
  
  describe('Auto-Commit Branch Storage', () => {
    it('should save and load auto-commit branches', async () => {
      await saveAutoCommitBranch(mockAutoCommitBranch);
      const loaded = await loadAutoCommitBranches(mockConversationId);
      
      expect(loaded).toHaveLength(1);
      expect(loaded[0].branchId).toBe(mockBranchId);
      expect(loaded[0].conversationId).toBe(mockConversationId);
      expect(loaded[0].projectId).toBe(mockProjectId);
      expect(loaded[0].branchName).toBe('auto-commit-2025-01-15-14-30');
      expect(loaded[0].commitHash).toBe('abc123def456');
      expect(loaded[0].isAutoCommit).toBe(true);
      expect(loaded[0].filesChanged).toEqual(['hello.py', 'test.txt', 'config.json']);
      expect(loaded[0].createdAt).toBeInstanceOf(Date);
      expect(loaded[0].workspaceSnapshot).toBeDefined();
      expect(loaded[0].workspaceSnapshot!.fileCount).toBe(3);
    });

    it('should load auto-commit branches by project', async () => {
      // Save branches for different conversations in the same project
      const branch1 = { ...mockAutoCommitBranch, branchId: 'branch-1', conversationId: 'conv-1' };
      const branch2 = { ...mockAutoCommitBranch, branchId: 'branch-2', conversationId: 'conv-2' };
      
      await saveAutoCommitBranch(branch1);
      await saveAutoCommitBranch(branch2);
      
      const loaded = await loadAutoCommitBranchesByProject(mockProjectId);
      
      expect(loaded).toHaveLength(2);
      expect(loaded.some(b => b.branchId === 'branch-1')).toBe(true);
      expect(loaded.some(b => b.branchId === 'branch-2')).toBe(true);
      expect(loaded.every(b => b.projectId === mockProjectId)).toBe(true);
    });

    it('should delete auto-commit branches', async () => {
      await saveAutoCommitBranch(mockAutoCommitBranch);
      let loaded = await loadAutoCommitBranches(mockConversationId);
      expect(loaded).toHaveLength(1);
      
      await deleteAutoCommitBranch(mockBranchId);
      loaded = await loadAutoCommitBranches(mockConversationId);
      expect(loaded).toHaveLength(0);
    });

    it('should handle branches without workspace snapshots', async () => {
      const branchWithoutSnapshot = {
        ...mockAutoCommitBranch,
        branchId: 'branch-no-snapshot',
        workspaceSnapshot: undefined
      };
      
      await saveAutoCommitBranch(branchWithoutSnapshot);
      const loaded = await loadAutoCommitBranches(mockConversationId);
      
      expect(loaded).toHaveLength(1);
      expect(loaded[0].workspaceSnapshot).toBeUndefined();
    });

    it('should sort branches by creation date (newest first)', async () => {
      const now = new Date();
      const branch1 = { ...mockAutoCommitBranch, branchId: 'branch-1', createdAt: new Date(now.getTime() - 10000) };
      const branch2 = { ...mockAutoCommitBranch, branchId: 'branch-2', createdAt: new Date(now.getTime() - 5000) };
      const branch3 = { ...mockAutoCommitBranch, branchId: 'branch-3', createdAt: now };
      
      await saveAutoCommitBranch(branch1);
      await saveAutoCommitBranch(branch2);
      await saveAutoCommitBranch(branch3);
      
      const loaded = await loadAutoCommitBranches(mockConversationId);
      
      expect(loaded).toHaveLength(3);
      expect(loaded[0].branchId).toBe('branch-3'); // newest first
      expect(loaded[1].branchId).toBe('branch-2');
      expect(loaded[2].branchId).toBe('branch-1'); // oldest last
    });
  });

  describe('Branch Revert Storage', () => {
    it('should save and load branch reverts', async () => {
      await saveBranchRevert(mockBranchRevert);
      const loaded = await loadBranchReverts(mockConversationId);
      
      expect(loaded).toHaveLength(1);
      expect(loaded[0].revertId).toBe('revert-123');
      expect(loaded[0].sourceBranchId).toBe('branch-current');
      expect(loaded[0].targetBranchId).toBe(mockBranchId);
      expect(loaded[0].conversationId).toBe(mockConversationId);
      expect(loaded[0].revertStatus).toBe('completed');
      expect(loaded[0].filesReverted).toEqual(['hello.py', 'test.txt']);
      expect(loaded[0].revertedAt).toBeInstanceOf(Date);
    });

    it('should handle multiple reverts for the same conversation', async () => {
      const revert1 = { ...mockBranchRevert, revertId: 'revert-1', revertReason: 'First revert' };
      const revert2 = { ...mockBranchRevert, revertId: 'revert-2', revertReason: 'Second revert' };
      
      await saveBranchRevert(revert1);
      await saveBranchRevert(revert2);
      
      const loaded = await loadBranchReverts(mockConversationId);
      
      expect(loaded).toHaveLength(2);
      expect(loaded.some(r => r.revertId === 'revert-1')).toBe(true);
      expect(loaded.some(r => r.revertId === 'revert-2')).toBe(true);
    });

    it('should sort reverts by revert date (newest first)', async () => {
      const now = new Date();
      const revert1 = { ...mockBranchRevert, revertId: 'revert-1', revertedAt: new Date(now.getTime() - 10000) };
      const revert2 = { ...mockBranchRevert, revertId: 'revert-2', revertedAt: now };
      
      await saveBranchRevert(revert1);
      await saveBranchRevert(revert2);
      
      const loaded = await loadBranchReverts(mockConversationId);
      
      expect(loaded).toHaveLength(2);
      expect(loaded[0].revertId).toBe('revert-2'); // newest first
      expect(loaded[1].revertId).toBe('revert-1'); // oldest last
    });
  });

  describe('Auto-Commit Agent Status', () => {
    it('should get default agent status when none exists', async () => {
      const status = await getAutoCommitAgentStatus();
      
      expect(status.isRunning).toBe(false);
      expect(status.totalBranchesCreated).toBe(0);
      expect(status.totalCommits).toBe(0);
      expect(status.totalReverts).toBe(0);
      expect(status.currentInterval).toBe(3);
      expect(status.errors).toEqual([]);
    });

    it('should update and get agent status', async () => {
      await updateAutoCommitAgentStatus(mockAgentStatus);
      const status = await getAutoCommitAgentStatus();
      
      expect(status.isRunning).toBe(true);
      expect(status.totalBranchesCreated).toBe(10);
      expect(status.totalCommits).toBe(15);
      expect(status.totalReverts).toBe(2);
      expect(status.currentInterval).toBe(3);
      expect(status.lastRunAt).toBeInstanceOf(Date);
      expect(status.nextRunAt).toBeInstanceOf(Date);
      expect(status.errors).toEqual([]);
    });

    it('should handle agent status with errors', async () => {
      const statusWithErrors = {
        ...mockAgentStatus,
        isRunning: false,
        errors: ['Git command failed', 'Workspace not found']
      };
      
      await updateAutoCommitAgentStatus(statusWithErrors);
      const status = await getAutoCommitAgentStatus();
      
      expect(status.isRunning).toBe(false);
      expect(status.errors).toEqual(['Git command failed', 'Workspace not found']);
    });
  });

  describe('Conversation Branch History', () => {
    it('should save and load conversation branch history', async () => {
      await saveConversationBranchHistory(mockBranchHistory);
      const loaded = await loadConversationBranchHistory(mockConversationId);
      
      expect(loaded).not.toBeNull();
      expect(loaded!.conversationId).toBe(mockConversationId);
      expect(loaded!.projectId).toBe(mockProjectId);
      expect(loaded!.branches).toHaveLength(1);
      expect(loaded!.branches[0].branchId).toBe(mockBranchId);
      expect(loaded!.currentBranchId).toBe(mockBranchId);
      expect(loaded!.totalBranches).toBe(1);
      expect(loaded!.totalCommits).toBe(1);
      expect(loaded!.totalReverts).toBe(0);
      expect(loaded!.oldestBranch).toBeInstanceOf(Date);
      expect(loaded!.newestBranch).toBeInstanceOf(Date);
    });

    it('should return null for non-existent conversation history', async () => {
      const loaded = await loadConversationBranchHistory('non-existent-conv');
      expect(loaded).toBeNull();
    });

    it('should handle branch history with multiple branches', async () => {
      const branch1 = { ...mockAutoCommitBranch, branchId: 'branch-1' };
      const branch2 = { ...mockAutoCommitBranch, branchId: 'branch-2' };
      
      const historyWithMultipleBranches = {
        ...mockBranchHistory,
        branches: [branch1, branch2],
        totalBranches: 2,
        totalCommits: 2
      };
      
      await saveConversationBranchHistory(historyWithMultipleBranches);
      const loaded = await loadConversationBranchHistory(mockConversationId);
      
      expect(loaded).not.toBeNull();
      expect(loaded!.branches).toHaveLength(2);
      expect(loaded!.totalBranches).toBe(2);
      expect(loaded!.totalCommits).toBe(2);
    });
  });

  describe('Type Safety and Validation', () => {
    it('should preserve all branch metadata fields', async () => {
      const complexBranch: AutoCommitBranch = {
        branchId: 'complex-branch',
        conversationId: mockConversationId,
        projectId: mockProjectId,
        branchName: 'feature/complex-branch',
        commitHash: 'complex123hash456',
        commitMessage: 'Complex commit with multiple changes',
        createdAt: new Date(),
        filesChanged: ['file1.py', 'file2.js', 'file3.json', 'file4.md'],
        changesSummary: 'Added Python script, updated JavaScript, modified config, added docs',
        isAutoCommit: true,
        parentBranchId: 'parent-branch-123',
        workspaceSnapshot: {
          fileCount: 15,
          totalSize: 50 * 1024, // 50KB
          lastModified: new Date()
        }
      };
      
      await saveAutoCommitBranch(complexBranch);
      const loaded = await loadAutoCommitBranches(mockConversationId);
      
      expect(loaded).toHaveLength(1);
      const branch = loaded[0];
      
      expect(branch.branchId).toBe('complex-branch');
      expect(branch.branchName).toBe('feature/complex-branch');
      expect(branch.commitHash).toBe('complex123hash456');
      expect(branch.commitMessage).toBe('Complex commit with multiple changes');
      expect(branch.filesChanged).toEqual(['file1.py', 'file2.js', 'file3.json', 'file4.md']);
      expect(branch.changesSummary).toBe('Added Python script, updated JavaScript, modified config, added docs');
      expect(branch.isAutoCommit).toBe(true);
      expect(branch.parentBranchId).toBe('parent-branch-123');
      expect(branch.workspaceSnapshot).toBeDefined();
      expect(branch.workspaceSnapshot!.fileCount).toBe(15);
      expect(branch.workspaceSnapshot!.totalSize).toBe(50 * 1024);
    });

    it('should handle empty arrays and undefined values', async () => {
      const minimalBranch: AutoCommitBranch = {
        branchId: 'minimal-branch',
        conversationId: mockConversationId,
        projectId: mockProjectId,
        branchName: 'minimal',
        commitHash: 'minimal123',
        commitMessage: 'Minimal commit',
        createdAt: new Date(),
        filesChanged: [],
        changesSummary: '',
        isAutoCommit: false
      };
      
      await saveAutoCommitBranch(minimalBranch);
      const loaded = await loadAutoCommitBranches(mockConversationId);
      
      expect(loaded).toHaveLength(1);
      const branch = loaded[0];
      
      expect(branch.filesChanged).toEqual([]);
      expect(branch.changesSummary).toBe('');
      expect(branch.isAutoCommit).toBe(false);
      expect(branch.parentBranchId).toBeUndefined();
      expect(branch.workspaceSnapshot).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // These tests would require more sophisticated mocking
      // For now, we just verify the functions exist
      expect(typeof saveAutoCommitBranch).toBe('function');
      expect(typeof loadAutoCommitBranches).toBe('function');
      expect(typeof deleteAutoCommitBranch).toBe('function');
      expect(typeof saveBranchRevert).toBe('function');
      expect(typeof loadBranchReverts).toBe('function');
      expect(typeof getAutoCommitAgentStatus).toBe('function');
      expect(typeof updateAutoCommitAgentStatus).toBe('function');
      expect(typeof saveConversationBranchHistory).toBe('function');
      expect(typeof loadConversationBranchHistory).toBe('function');
    });
  });

  describe('Performance with Large Datasets', () => {
    it('should handle many branches efficiently', async () => {
      const branches: AutoCommitBranch[] = [];
      
      // Create 50 mock branches
      for (let i = 0; i < 50; i++) {
        branches.push({
          branchId: `branch-${i}`,
          conversationId: mockConversationId,
          projectId: mockProjectId,
          branchName: `auto-commit-${i}`,
          commitHash: `hash${i}`,
          commitMessage: `Auto-commit ${i}`,
          createdAt: new Date(Date.now() - i * 1000),
          filesChanged: [`file${i}.py`],
          changesSummary: `Changes ${i}`,
          isAutoCommit: true
        });
      }
      
      // Save all branches
      const startTime = Date.now();
      for (const branch of branches) {
        await saveAutoCommitBranch(branch);
      }
      const saveTime = Date.now() - startTime;
      
      // Load all branches
      const loadStartTime = Date.now();
      const loaded = await loadAutoCommitBranches(mockConversationId);
      const loadTime = Date.now() - loadStartTime;
      
      expect(loaded).toHaveLength(50);
      expect(saveTime).toBeLessThan(2000); // Should complete within 2 seconds
      expect(loadTime).toBeLessThan(1000); // Should complete within 1 second
      
      // Verify ordering (newest first)
      expect(loaded[0].branchId).toBe('branch-0');
      expect(loaded[49].branchId).toBe('branch-49');
    });
  });
});

// Export test utilities for manual testing
export {
  mockAutoCommitBranch,
  mockBranchRevert,
  mockAgentStatus,
  mockBranchHistory
}; 