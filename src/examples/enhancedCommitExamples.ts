/**
 * Enhanced Commit Examples
 * 
 * Demonstrates how to use the enhanced conversation commit system
 * with git diff generation and LLM-powered commit messages.
 */

import {
  processEnhancedCommit,
  updateProjectJSONWithCommit,
  validateLLMSettings,
  getConversationCommitHistory,
  generateCommitStatistics,
  performSystemHealthCheck,
  EnhancedCommitRequest,
  CommitProcessingOptions
} from '../lib/enhancedConversationCommitService';
import { ProjectSettings } from '../components/LlmChat/context/types';

/**
 * Example 1: Basic enhanced commit processing
 */
export async function basicEnhancedCommitExample(
  projectPath: string,
  conversationId: string,
  commitHash: string,
  projectSettings: ProjectSettings,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
) {
  console.log('🚀 Example 1: Basic Enhanced Commit Processing');

  // Prepare the request
  const request: EnhancedCommitRequest = {
    projectPath,
    conversationId,
    branchName: `conv-${conversationId}-step-1`,
    commitHash,
    originalMessage: 'Auto-commit: tool_execution - changes detected',
    projectSettings,
    serverId,
    executeTool
  };

  try {
    // Process the enhanced commit
    const result = await processEnhancedCommit(request);

    if (result.success) {
      console.log('✅ Enhanced commit processed successfully!');
      console.log(`   Commit Hash: ${result.commitInfo!.hash.substring(0, 8)}`);
      console.log(`   Files Changed: ${result.commitInfo!.filesChanged.length}`);
      console.log(`   Lines: +${result.commitInfo!.linesAdded}/-${result.commitInfo!.linesRemoved}`);
      console.log(`   LLM Message: "${result.commitInfo!.llmGeneratedMessage}"`);
      console.log(`   Processing Time: ${result.metrics!.totalProcessingTime}ms`);

      // Update project JSON (this would typically be done by your project management system)
      const projectData = {
        conversations: [],
        branches: []
      };

      const updateResult = await updateProjectJSONWithCommit(
        projectData,
        conversationId,
        request.branchName,
        result.commitInfo!
      );

      if (updateResult.success) {
        console.log('✅ Project JSON updated successfully');
      }

    } else {
      console.error('❌ Enhanced commit processing failed:', result.error);
      if (result.warnings) {
        console.warn('⚠️ Warnings:', result.warnings);
      }
    }

  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
}

/**
 * Example 2: Enhanced commit with custom options
 */
export async function advancedEnhancedCommitExample(
  projectPath: string,
  conversationId: string,
  commitHash: string,
  projectSettings: ProjectSettings,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
) {
  console.log('🚀 Example 2: Advanced Enhanced Commit with Custom Options');

  // Custom processing options
  const options: CommitProcessingOptions = {
    enableLLMGeneration: true,
    fallbackOnLLMFailure: true,
    enableDiffGeneration: true,
    maxRetries: 2,
    timeoutMs: 20000 // 20 seconds
  };

  const request: EnhancedCommitRequest = {
    projectPath,
    conversationId,
    branchName: `conv-${conversationId}-step-2`,
    commitHash,
    originalMessage: 'feat: implement user authentication system',
    projectSettings,
    serverId,
    executeTool
  };

  try {
    // Validate settings first
    const validation = validateLLMSettings(projectSettings);
    if (!validation.isValid) {
      console.error('❌ LLM settings validation failed:', validation.errors);
      return;
    }

    if (validation.warnings.length > 0) {
      console.warn('⚠️ LLM settings warnings:', validation.warnings);
    }

    console.log('✅ LLM settings validation passed');

    // Process with custom options
    const result = await processEnhancedCommit(request, options);

    if (result.success) {
      console.log('✅ Advanced enhanced commit processed!');
      
      // Display detailed metrics
      if (result.metrics) {
        console.log('📊 Processing Metrics:');
        console.log(`   Total Time: ${result.metrics.totalProcessingTime}ms`);
        console.log(`   Files Changed: ${result.metrics.filesChanged}`);
        console.log(`   Lines Changed: ${result.metrics.linesChanged}`);
        if (result.metrics.diffGenerationTime) {
          console.log(`   Diff Generation: ${result.metrics.diffGenerationTime}ms`);
        }
        if (result.metrics.llmGenerationTime) {
          console.log(`   LLM Generation: ${result.metrics.llmGenerationTime}ms`);
        }
      }

      // Display commit details
      const commit = result.commitInfo!;
      console.log('📝 Commit Details:');
      console.log(`   Original Message: "${commit.message}"`);
      console.log(`   LLM Message: "${commit.llmGeneratedMessage}"`);
      console.log(`   Provider: ${commit.llmProvider} (${commit.llmModel})`);
      console.log(`   Files: ${commit.filesChanged.join(', ')}`);

    } else {
      console.error('❌ Advanced enhanced commit failed:', result.error);
    }

  } catch (error) {
    console.error('💥 Advanced example error:', error);
  }
}

/**
 * Example 3: Batch processing multiple commits
 */
export async function batchCommitProcessingExample(
  projectPath: string,
  conversationId: string,
  commitHashes: string[],
  projectSettings: ProjectSettings,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
) {
  console.log('🚀 Example 3: Batch Processing Multiple Commits');

  const results = [];
  const projectData = { conversations: [], branches: [] };

  for (let i = 0; i < commitHashes.length; i++) {
    const commitHash = commitHashes[i];
    console.log(`📦 Processing commit ${i + 1}/${commitHashes.length}: ${commitHash.substring(0, 8)}`);

    const request: EnhancedCommitRequest = {
      projectPath,
      conversationId,
      branchName: `conv-${conversationId}-step-${i + 1}`,
      commitHash,
      originalMessage: `Auto-commit: step ${i + 1} changes`,
      projectSettings,
      serverId,
      executeTool
    };

    try {
      const result = await processEnhancedCommit(request);
      results.push(result);

      if (result.success) {
        console.log(`   ✅ Success: ${result.commitInfo!.llmGeneratedMessage}`);
        
        // Update project data
        await updateProjectJSONWithCommit(
          projectData,
          conversationId,
          request.branchName,
          result.commitInfo!
        );
      } else {
        console.log(`   ❌ Failed: ${result.error}`);
      }

    } catch (error) {
      console.error(`   💥 Error processing commit ${commitHash}:`, error);
      results.push({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }

    // Small delay to be respectful to APIs
    if (i < commitHashes.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Generate batch summary
  const successful = results.filter(r => r.success).length;
  const failed = results.length - successful;

  console.log('📊 Batch Processing Summary:');
  console.log(`   Total Commits: ${results.length}`);
  console.log(`   Successful: ${successful}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Success Rate: ${((successful / results.length) * 100).toFixed(1)}%`);

  // Calculate total metrics
  const totalMetrics = results
    .filter(r => r.success && r.metrics)
    .reduce((acc, r) => ({
      totalTime: acc.totalTime + r.metrics!.totalProcessingTime,
      totalFiles: acc.totalFiles + r.metrics!.filesChanged,
      totalLines: acc.totalLines + r.metrics!.linesChanged
    }), { totalTime: 0, totalFiles: 0, totalLines: 0 });

  console.log(`   Total Processing Time: ${totalMetrics.totalTime}ms`);
  console.log(`   Total Files Changed: ${totalMetrics.totalFiles}`);
  console.log(`   Total Lines Changed: ${totalMetrics.totalLines}`);
}

/**
 * Example 4: Analyzing conversation commit history
 */
export async function commitHistoryAnalysisExample(
  projectData: any,
  conversationId: string
) {
  console.log('🚀 Example 4: Conversation Commit History Analysis');

  try {
    // Get commit history for the conversation
    const commits = getConversationCommitHistory(projectData, conversationId);
    
    if (commits.length === 0) {
      console.log('📭 No commits found for conversation:', conversationId);
      return;
    }

    console.log(`📚 Found ${commits.length} commits for conversation ${conversationId}`);

    // Generate statistics
    const stats = generateCommitStatistics(commits);

    console.log('📊 Commit Statistics:');
    console.log(`   Total Commits: ${stats.totalCommits}`);
    console.log(`   Total Files Changed: ${stats.totalFilesChanged}`);
    console.log(`   Total Lines Added: ${stats.totalLinesAdded}`);
    console.log(`   Total Lines Removed: ${stats.totalLinesRemoved}`);
    console.log(`   LLM Generated Messages: ${stats.llmGeneratedCount}`);
    console.log(`   LLM Success Rate: ${stats.llmSuccessRate.toFixed(1)}%`);

    // Show most changed files
    if (stats.mostChangedFiles.length > 0) {
      console.log('📁 Most Changed Files:');
      stats.mostChangedFiles.slice(0, 5).forEach((file, index) => {
        console.log(`   ${index + 1}. ${file.file} (${file.changes} changes)`);
      });
    }

    // Show provider usage
    if (Object.keys(stats.commitsByProvider).length > 0) {
      console.log('🤖 LLM Provider Usage:');
      Object.entries(stats.commitsByProvider).forEach(([provider, count]) => {
        console.log(`   ${provider}: ${count} commits`);
      });
    }

    // Show recent commits with their LLM messages
    console.log('📝 Recent Commits:');
    commits.slice(0, 5).forEach((commit, index) => {
      console.log(`   ${index + 1}. ${commit.hash.substring(0, 8)} - "${commit.llmGeneratedMessage || commit.message}"`);
      console.log(`      Files: ${commit.filesChanged.length}, Lines: +${commit.linesAdded}/-${commit.linesRemoved}`);
    });

  } catch (error) {
    console.error('❌ Error analyzing commit history:', error);
  }
}

/**
 * Example 5: System health check
 */
export async function systemHealthCheckExample(
  projectPath: string,
  projectSettings: ProjectSettings,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
) {
  console.log('🚀 Example 5: System Health Check');

  try {
    const healthCheck = await performSystemHealthCheck(
      projectPath,
      projectSettings,
      serverId,
      executeTool
    );

    console.log(`🏥 System Health: ${healthCheck.overall.toUpperCase()}`);
    console.log('🔍 Health Check Details:');
    healthCheck.details.forEach(detail => {
      console.log(`   ${detail}`);
    });

    console.log('⚙️ Component Status:');
    console.log(`   Git Access: ${healthCheck.checks.gitAccess ? '✅' : '❌'}`);
    console.log(`   LLM Config: ${healthCheck.checks.llmConfig ? '✅' : '❌'}`);
    console.log(`   MCP Connection: ${healthCheck.checks.mcpConnection ? '✅' : '❌'}`);

    // Provide recommendations based on health
    if (healthCheck.overall === 'unhealthy') {
      console.log('🚨 System is unhealthy. Please address the issues above before using enhanced commits.');
    } else if (healthCheck.overall === 'degraded') {
      console.log('⚠️ System is degraded. Some features may not work properly.');
    } else {
      console.log('✅ System is healthy. All enhanced commit features should work properly.');
    }

  } catch (error) {
    console.error('❌ Health check failed:', error);
  }
}

/**
 * Example 6: Error handling and recovery
 */
export async function errorHandlingExample(
  projectPath: string,
  conversationId: string,
  commitHash: string,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
) {
  console.log('🚀 Example 6: Error Handling and Recovery');

  // Simulate problematic project settings
  const problematicSettings: ProjectSettings = {
    provider: 'anthropic',
    model: 'claude-3-7-sonnet-20250219',
    anthropicApiKey: '', // Empty API key will cause failures
    systemPrompt: '',
    elideToolResults: false,
    mcpServerIds: [],
    messageWindowSize: 30,
    enableGitHub: false
  };

  const request: EnhancedCommitRequest = {
    projectPath,
    conversationId,
    branchName: `conv-${conversationId}-error-test`,
    commitHash,
    originalMessage: 'Test commit for error handling',
    projectSettings: problematicSettings,
    serverId,
    executeTool
  };

  // Configure options for graceful degradation
  const options: CommitProcessingOptions = {
    enableLLMGeneration: true,
    fallbackOnLLMFailure: true, // This will ensure we get a commit even if LLM fails
    enableDiffGeneration: true,
    maxRetries: 1, // Reduce retries for faster failure
    timeoutMs: 10000
  };

  try {
    console.log('🔧 Testing with invalid API key...');
    
    const result = await processEnhancedCommit(request, options);

    if (result.success) {
      console.log('✅ Commit processed successfully despite configuration issues');
      console.log(`   Fallback Message: "${result.commitInfo!.message}"`);
      console.log(`   LLM Message Generated: ${result.commitInfo!.llmGeneratedMessage ? 'Yes' : 'No'}`);
      
      if (result.warnings) {
        console.log('⚠️ Warnings encountered:');
        result.warnings.forEach(warning => {
          console.log(`     - ${warning}`);
        });
      }
    } else {
      console.log('❌ Commit processing failed as expected');
      console.log(`   Error: ${result.error}`);
      
      if (result.warnings) {
        console.log('⚠️ Warnings:');
        result.warnings.forEach(warning => {
          console.log(`     - ${warning}`);
        });
      }
    }

    // Demonstrate recovery with corrected settings
    console.log('\n🔧 Testing recovery with corrected settings...');
    
    const correctedSettings: ProjectSettings = {
      ...problematicSettings,
      anthropicApiKey: 'valid-api-key-here' // In real usage, this would be a valid key
    };

    const recoveryRequest: EnhancedCommitRequest = {
      ...request,
      projectSettings: correctedSettings
    };

    // Note: This would work with a real API key
    console.log('💡 With valid API key, the system would recover and generate LLM commit messages');

  } catch (error) {
    console.error('💥 Unexpected error in error handling example:', error);
  }
}

/**
 * Run all examples
 */
export async function runAllExamples(
  projectPath: string,
  conversationId: string,
  commitHashes: string[],
  projectSettings: ProjectSettings,
  serverId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
) {
  console.log('🚀 Running All Enhanced Commit Examples\n');

  const projectData = { conversations: [], branches: [] };

  try {
    // Example 1: Basic usage
    if (commitHashes.length > 0) {
      await basicEnhancedCommitExample(
        projectPath,
        conversationId,
        commitHashes[0],
        projectSettings,
        serverId,
        executeTool
      );
      console.log('\n' + '='.repeat(60) + '\n');
    }

    // Example 2: Advanced usage
    if (commitHashes.length > 1) {
      await advancedEnhancedCommitExample(
        projectPath,
        conversationId,
        commitHashes[1],
        projectSettings,
        serverId,
        executeTool
      );
      console.log('\n' + '='.repeat(60) + '\n');
    }

    // Example 3: Batch processing
    if (commitHashes.length > 2) {
      await batchCommitProcessingExample(
        projectPath,
        conversationId,
        commitHashes.slice(0, 3),
        projectSettings,
        serverId,
        executeTool
      );
      console.log('\n' + '='.repeat(60) + '\n');
    }

    // Example 4: History analysis
    await commitHistoryAnalysisExample(projectData, conversationId);
    console.log('\n' + '='.repeat(60) + '\n');

    // Example 5: Health check
    await systemHealthCheckExample(projectPath, projectSettings, serverId, executeTool);
    console.log('\n' + '='.repeat(60) + '\n');

    // Example 6: Error handling
    if (commitHashes.length > 0) {
      await errorHandlingExample(
        projectPath,
        conversationId,
        commitHashes[0],
        serverId,
        executeTool
      );
    }

    console.log('\n✅ All examples completed!');

  } catch (error) {
    console.error('❌ Error running examples:', error);
  }
} 