/**
 * 📚 Project Checkpoint API Usage Examples
 * 
 * Comprehensive examples of how to use the ProjectCheckpointAPI
 * for different scenarios: new projects, cloned repos, and operations.
 */

import { ProjectCheckpointAPI, createProjectCheckpointAPI, type ProjectInitConfig } from '../api/projectCheckpointAPI';
import { Project } from '../components/LlmChat/context/types';

// Example usage scenarios
export class ProjectAPIExamples {
  
  /**
   * 🆕 Example 1: Initialize a brand new project
   */
  static async initializeNewProject() {
    const config: ProjectInitConfig = {
      projectName: "My New React App",
      enableGitHub: true,
      autoCheckpoint: true,
      description: "A modern React application with TypeScript"
    };

    // This will create:
    // - Directory: /Users/test/gitrepo/projects/{projectId}_my-new-react-app/
    // - Git repository initialized
    // - GitHub repo created (if enabled)
    // - Initial checkpoint created
    const result = await ProjectCheckpointAPI.initializeNewProject(
      config,
      'your-mcp-server-id',
      executeTool
    );

    if (result.success && result.data) {
      console.log('✅ New project created:');
      console.log(`   Project ID: ${result.data.projectId}`);
      console.log(`   Path: ${result.data.projectPath}`);
      console.log(`   GitHub: ${result.data.gitHubRepoUrl || 'Not created'}`);
      console.log(`   Setup Summary:`);
      result.data.setupSummary.forEach(step => console.log(`     ${step}`));
      
      return result.data;
    } else {
      console.error('❌ Project creation failed:', result.error);
      throw new Error(result.error);
    }
  }

  /**
   * 📥 Example 2: Initialize from existing cloned repository
   */
  static async initializeFromClonedRepo() {
    const config: ProjectInitConfig = {
      projectName: "Cloned Open Source Project",
      isClonedRepo: true,
      repoPath: "/Users/test/projects/existing-repo",
      enableGitHub: false, // Already has GitHub
      autoCheckpoint: false, // Don't create initial checkpoint for existing code
      description: "Working on an existing open source project"
    };

    const result = await ProjectCheckpointAPI.initializeNewProject(
      config,
      'your-mcp-server-id',
      executeTool
    );

    if (result.success && result.data) {
      console.log('✅ Cloned project initialized:');
      console.log(`   Project ID: ${result.data.projectId}`);
      console.log(`   Existing Path: ${result.data.projectPath}`);
      console.log(`   Analysis: ${result.data.repoAnalysis?.totalBranches} branches, ${result.data.repoAnalysis?.totalCommits} commits`);
      
      return result.data;
    } else {
      console.error('❌ Cloned project initialization failed:', result.error);
      throw new Error(result.error);
    }
  }

  /**
   * 🔧 Example 3: Working with an existing project
   */
  static async workWithExistingProject(project: Project, serverId: string, executeTool: any) {
    // Create API instance for existing project
    const api = createProjectCheckpointAPI(project, serverId, executeTool);

    console.log('🔍 Analyzing project repository...');
    const analysis = await api.analyzeProject();
    
    if (analysis.success && analysis.data) {
      console.log(`   Found ${analysis.data.totalBranches} branches`);
      console.log(`   Default branch: ${analysis.data.defaultBranch}`);
      console.log(`   Recent branches:`);
      analysis.data.branches
        .filter(b => !b.name.startsWith('checkpoint/') && !b.name.startsWith('backup/'))
        .slice(0, 5)
        .forEach(branch => {
          console.log(`     ${branch.isActive ? '→' : ' '} ${branch.name} (${branch.commitCount} commits)`);
        });
    }

    console.log('\n📝 Creating a checkpoint before major changes...');
    const checkpoint = await api.createCheckpoint(
      "Before implementing new feature",
      "feature"
    );
    
    if (checkpoint.success && checkpoint.data) {
      console.log(`✅ Checkpoint created: ${checkpoint.data.branchName}`);
    }

    console.log('\n🔄 Switching to a feature branch...');
    const switchResult = await api.switchToBranch("feature/new-ui", true);
    
    if (switchResult.success && switchResult.data) {
      console.log(`✅ Switched to: ${switchResult.data.targetBranch}`);
      if (switchResult.data.backupBranch) {
        console.log(`   Backup created: ${switchResult.data.backupBranch}`);
      }
    }

    console.log('\n📋 Listing all checkpoints...');
    const checkpoints = await api.listCheckpoints();
    
    if (checkpoints.success && checkpoints.data) {
      console.log(`   Found ${checkpoints.data.length} checkpoints:`);
      checkpoints.data
        .filter(c => c.name.startsWith('checkpoint/'))
        .slice(0, 5)
        .forEach(checkpoint => {
          console.log(`     ${checkpoint.name} - ${checkpoint.description}`);
        });
    }

    console.log('\n🛠️ Checking project health...');
    const health = await api.getProjectHealth();
    
    if (health.success && health.data) {
      console.log(`   Current branch: ${health.data.currentBranch}`);
      console.log(`   Uncommitted changes: ${health.data.hasUncommittedChanges ? 'Yes' : 'No'}`);
      console.log(`   GitHub enabled: ${health.data.githubEnabled ? 'Yes' : 'No'}`);
    }

    return {
      analysis: analysis.data,
      checkpoint: checkpoint.data,
      switchResult: switchResult.data,
      checkpoints: checkpoints.data,
      health: health.data
    };
  }

  /**
   * 🚀 Example 4: Complete workflow - new project to deployment
   */
  static async completeWorkflow() {
    console.log('🚀 Starting complete project workflow...\n');

    // Step 1: Create new project
    console.log('Step 1: Creating new project...');
    const projectData = await this.initializeNewProject();

    // Step 2: Simulate some development work
    console.log('\nStep 2: Simulating development work...');
    // In real usage, this would be actual file changes
    console.log('   (Files would be created/modified here)');

    // Step 3: Create checkpoint after substantial changes
    console.log('\nStep 3: Creating development checkpoint...');
         // Create a mock project object for demonstration
     const mockProject: Project = {
       id: projectData.projectId,
       name: projectData.projectPath.split('/').pop() || 'project',
       settings: {
         model: 'claude-3-5-sonnet-20241022',
         systemPrompt: '',
         elideToolResults: false,
         messageWindowSize: 20,
         enableGitHub: true,
         mcpServerIds: ['your-mcp-server-id']
       },
       conversations: [],
       createdAt: new Date(),
       updatedAt: new Date(),
       order: 0
     };

    const api = createProjectCheckpointAPI(mockProject, 'your-mcp-server-id', executeTool);
    
    const developmentCheckpoint = await api.createCheckpoint(
      "Development progress - core features implemented",
      "feature",
      true // Force creation for demo
    );

    if (developmentCheckpoint.success) {
      console.log(`✅ Development checkpoint: ${developmentCheckpoint.data?.branchName}`);
    }

    // Step 4: Create release branch
    console.log('\nStep 4: Creating release branch...');
    const releaseCheckpoint = await api.createCheckpoint(
      "Release candidate v1.0.0",
      "checkpoint",
      true
    );

    if (releaseCheckpoint.success) {
      console.log(`✅ Release checkpoint: ${releaseCheckpoint.data?.branchName}`);
    }

    // Step 5: Final health check
    console.log('\nStep 5: Final project health check...');
    const finalHealth = await api.getProjectHealth();

    if (finalHealth.success && finalHealth.data) {
      console.log('✅ Project ready for deployment:');
      console.log(`   Path: ${finalHealth.data.projectPath}`);
      console.log(`   Current branch: ${finalHealth.data.currentBranch}`);
      console.log(`   Git enabled: ${finalHealth.data.gitEnabled}`);
      console.log(`   GitHub enabled: ${finalHealth.data.githubEnabled}`);
    }

    console.log('\n🎉 Workflow complete!');
    
    return {
      projectData,
      developmentCheckpoint: developmentCheckpoint.data,
      releaseCheckpoint: releaseCheckpoint.data,
      finalHealth: finalHealth.data
    };
  }

  /**
   * 🔄 Example 5: Branch switching and rollback scenarios
   */
  static async branchManagementScenarios(project: Project, serverId: string, executeTool: any) {
    const api = createProjectCheckpointAPI(project, serverId, executeTool);

    console.log('🔄 Testing branch management scenarios...\n');

    // Scenario 1: Safe switch to existing branch
    console.log('Scenario 1: Switch to existing branch with backup');
    const switch1 = await api.switchToBranch("main", true);
    console.log(`   Result: ${switch1.success ? 'Success' : 'Failed'}`);
    if (switch1.data) {
      console.log(`   Switched from ${switch1.data.previousBranch} to ${switch1.data.targetBranch}`);
    }

    // Scenario 2: Switch to remote branch
    console.log('\nScenario 2: Switch to remote branch');
    const switch2 = await api.switchToBranch("origin/feature/new-component", true);
    console.log(`   Result: ${switch2.success ? 'Success' : 'Failed'}`);
    if (switch2.data) {
      console.log(`   Target: ${switch2.data.targetBranch}`);
      if (switch2.data.backupBranch) {
        console.log(`   Backup: ${switch2.data.backupBranch}`);
      }
    }

    // Scenario 3: Switch to checkpoint branch
    console.log('\nScenario 3: Switch to checkpoint branch');
    const checkpoints = await api.listCheckpoints();
    if (checkpoints.success && checkpoints.data && checkpoints.data.length > 0) {
      const firstCheckpoint = checkpoints.data.find(c => c.name.startsWith('checkpoint/'));
      if (firstCheckpoint) {
        const switch3 = await api.switchToBranch(firstCheckpoint.name, false);
        console.log(`   Switched to checkpoint: ${switch3.success ? 'Success' : 'Failed'}`);
      }
    }

    return {
      switch1: switch1.data,
      switch2: switch2.data,
      availableCheckpoints: checkpoints.data
    };
  }
}

/**
 * 🎯 Integration with Kibitz Store
 */
export class ProjectAPIStoreIntegration {
  
  /**
   * Create new project and integrate with Kibitz store
   */
  static async createProjectWithStoreIntegration(
    projectName: string,
    enableGitHub: boolean,
    rootStore: any
  ) {
    // Get connected MCP server
    const connectedServer = rootStore.servers.find((s: any) => s.status === 'connected');
    if (!connectedServer) {
      throw new Error('No connected MCP server found');
    }

    // Initialize project via API
    const config: ProjectInitConfig = {
      projectName,
      enableGitHub,
      autoCheckpoint: true,
      description: `Kibitz project: ${projectName}`
    };

    const result = await ProjectCheckpointAPI.initializeNewProject(
      config,
      connectedServer.id,
      rootStore.executeTool
    );

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to initialize project');
    }

         // Create project in Kibitz store
     const projectId = rootStore.createProject(projectName, {
       model: 'claude-3-5-sonnet-20241022',
       systemPrompt: '',
       elideToolResults: false,
       messageWindowSize: 20,
       enableGitHub,
       mcpServerIds: [connectedServer.id]
     });

    // Update project with API results
    const project = rootStore.projects.find((p: any) => p.id === projectId);
    if (project) {
      // You could add additional metadata to the project here
      console.log(`✅ Project ${projectName} created and integrated:`, {
        projectId,
        path: result.data.projectPath,
        hasGitHub: result.data.hasGitHubRepo,
        repoUrl: result.data.gitHubRepoUrl
      });
    }

    return {
      projectId,
      project,
      apiResult: result.data
    };
  }

  /**
   * Update existing project to use API
   */
  static upgradeExistingProjectToAPI(
    projectId: string,
    rootStore: any
  ) {
    const project = rootStore.projects.find((p: any) => p.id === projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const connectedServer = rootStore.servers.find((s: any) => s.status === 'connected');
    if (!connectedServer) {
      throw new Error('No connected MCP server found');
    }

    // Create API instance
    const api = createProjectCheckpointAPI(project, connectedServer.id, rootStore.executeTool);

    console.log(`✅ Project ${project.name} upgraded to use ProjectCheckpointAPI`);

    return {
      project,
      api,
      capabilities: {
        canAnalyzeRepo: true,
        canCreateCheckpoints: true,
        canSwitchBranches: true,
        canCheckHealth: true
      }
    };
  }
}

// Mock executeTool function for examples
const executeTool = async (serverId: string, toolName: string, args: Record<string, unknown>): Promise<string> => {
  // This would be the actual MCP tool execution in real usage
  console.log(`Executing ${toolName} on ${serverId} with args:`, args);
  return 'Mock response';
}; 