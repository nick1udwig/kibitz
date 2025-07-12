/**
 * 🚀 Project Management API - Usage Examples
 * 
 * Demonstrates the complete system that competes with Replit Agent v2
 * by providing local-first Git management with intelligent branching.
 */

import { ProjectManagementAPI, createProjectManagementAPI } from '../src/api/projectManagementAPI';

// Mock executeTool function for examples
const executeTool = async (serverId: string, toolName: string, args: Record<string, unknown>): Promise<string> => {
  // This would be provided by your actual implementation
  return 'mock-result';
};

// Initialize the API
const api = createProjectManagementAPI('server-id', executeTool);

/**
 * 🏗️ Example 1: Initialize New Project
 */
async function exampleNewProject() {
  console.log('🏗️ Creating new project...');
  
  const result = await api.initializeProject({
    projectPath: '/Users/test/gitrepo/projects/123_MyApp',
    projectName: 'MyApp',
    enableGitHub: false, // Local-first by default
    autoSetupDependencies: true,
    analyzeExistingRepo: true
  });

  if (result.success) {
    console.log('✅ Project created successfully!');
    console.log(`📁 Path: ${result.data?.projectPath}`);
    console.log(`🌿 Initial branch: ${result.data?.initialBranch}`);
    console.log(`📊 Repository analysis: ${result.data?.repoAnalysis?.technologies.languages.join(', ')}`);
  }
}

/**
 * 📥 Example 2: Clone & Analyze GitHub Repository
 */
async function exampleCloneGitHubRepo() {
  console.log('📥 Analyzing cloned GitHub repository...');
  
  // First, get comprehensive repository insights
  const insights = await api.getRepositoryInsights('/path/to/cloned/repo');
  
  if (insights.success) {
    const analysis = insights.data!;
    
    console.log('📊 Repository Analysis:');
    console.log(`   • Is cloned repo: ${analysis.isCloned}`);
    console.log(`   • Repository URL: ${analysis.repoUrl}`);
    console.log(`   • ${analysis.totalBranches} branches found`);
    console.log(`   • ${analysis.contributors.length} contributors`);
    console.log(`   • Technologies: ${analysis.technologies.languages.join(', ')}`);
    console.log(`   • Package managers: ${analysis.projectStructure.packageManagers.join(', ')}`);
    
    // Show detailed branch information
    console.log('\n🌿 Branch Details:');
    analysis.branches.forEach(branch => {
      console.log(`   • ${branch.name} (${branch.type}): ${branch.commitCount} commits`);
      console.log(`     Last: ${branch.lastCommit.message}`);
      console.log(`     Ahead: ${branch.ahead}, Behind: ${branch.behind}`);
    });
    
    // Show recent commits with full details
    console.log('\n📝 Recent Commits:');
    analysis.recentCommits.slice(0, 5).forEach(commit => {
      console.log(`   • ${commit.shortHash}: ${commit.message}`);
      console.log(`     ${commit.author} - ${commit.filesChanged} files (+${commit.insertions}/-${commit.deletions})`);
    });
  }
}

/**
 * 🤖 Example 3: Smart Commit with Auto-Branching
 */
async function exampleSmartCommit() {
  console.log('🤖 Performing smart commit...');
  
  const projectPath = '/Users/test/gitrepo/projects/456_ReactApp';
  
  // Analyze current changes first
  const branchAnalysis = await api.analyzeBranches(projectPath);
  
  if (branchAnalysis.success) {
    const { currentChanges, recommendations } = branchAnalysis.data!;
    
    console.log('📊 Change Analysis:');
    console.log(`   • ${currentChanges.filesChanged} files changed`);
    console.log(`   • +${currentChanges.linesAdded}/-${currentChanges.linesRemoved} lines`);
    console.log(`   • Suggested branch type: ${currentChanges.suggestedBranchType}`);
    console.log(`   • Should create branch: ${currentChanges.shouldCreateBranch}`);
    
    console.log('\n💡 Recommendations:');
    recommendations.forEach(rec => console.log(`   ${rec}`));
    
    // Perform smart commit
    const commitResult = await api.smartCommit(projectPath, {
      createBranchIfNeeded: true,
      autoGenerateMessage: true
    });
    
    if (commitResult.success) {
      const { branchCreated, branchInfo, commitMessage } = commitResult.data!;
      
      console.log('✅ Smart commit completed!');
      console.log(`📝 Commit message: ${commitMessage}`);
      
      if (branchCreated && branchInfo) {
        console.log(`🌿 New branch created: ${branchInfo.name}`);
        console.log(`📅 Branch type: ${branchInfo.type}`);
        console.log(`📄 Description: ${branchInfo.description}`);
      }
    }
  }
}

/**
 * 🌿 Example 4: Advanced Branch Management
 */
async function exampleBranchManagement() {
  console.log('🌿 Advanced branch management...');
  
  const projectPath = '/Users/test/gitrepo/projects/789_NodeAPI';
  
  // Create a smart branch based on current changes
  const branchResult = await api.createSmartBranch(
    projectPath,
    'feature', // Override suggested type
    'Implementing new authentication system'
  );
  
  if (branchResult.success) {
    const branch = branchResult.data!;
    console.log(`✅ Created branch: ${branch.name}`);
    console.log(`📅 Type: ${branch.type}`);
    console.log(`📄 Description: ${branch.description}`);
    
    // ... do some work ...
    
    // Safe merge back to main
    const mergeResult = await api.mergeBranchSafely(
      projectPath,
      branch.name,
      'main'
    );
    
    if (mergeResult.success) {
      console.log(`✅ Successfully merged ${branch.name} into main`);
    }
  }
}

/**
 * 🔄 Example 5: Safe Revert with Backup
 */
async function exampleSafeRevert() {
  console.log('🔄 Performing safe revert...');
  
  const projectPath = '/Users/test/gitrepo/projects/101_VueApp';
  
  const revertResult = await api.safeRevert(projectPath, {
    targetBranch: 'main',
    createBackupBranch: true // Always create backup
  });
  
  if (revertResult.success) {
    const { backupBranch, reverted } = revertResult.data!;
    console.log(`✅ Safely reverted to main`);
    console.log(`💾 Backup created: ${backupBranch}`);
    console.log('📝 Your changes are safe - you can switch back anytime!');
  }
}

/**
 * 📊 Example 6: Project Health Dashboard
 */
async function exampleProjectHealth() {
  console.log('📊 Checking project health...');
  
  const projectPath = '/Users/test/gitrepo/projects/202_FullStack';
  
  const healthResult = await api.getProjectHealth(projectPath);
  
  if (healthResult.success) {
    const health = healthResult.data!;
    
    console.log('🏥 Project Health Report:');
    console.log(`   Status: ${health.gitStatus === 'healthy' ? '✅ Healthy' : health.gitStatus === 'warning' ? '⚠️ Warning' : '❌ Error'}`);
    console.log(`   Branches: ${health.branchCount}`);
    console.log(`   Uncommitted changes: ${health.uncommittedChanges}`);
    console.log(`   Last activity: ${health.lastActivity.toLocaleDateString()}`);
    
    console.log('\n🛠️ Technology Stack:');
    console.log(`   Languages: ${health.techStack.languages.join(', ')}`);
    console.log(`   Frameworks: ${health.techStack.frameworks.join(', ')}`);
    console.log(`   Tools: ${health.techStack.tools.join(', ')}`);
    console.log(`   Confidence: ${(health.techStack.confidence * 100).toFixed(0)}%`);
    
    console.log('\n📁 Project Structure:');
    console.log(`   Package managers: ${health.structure.packageManagers.join(', ')}`);
    console.log(`   Has tests: ${health.structure.hasTests ? '✅' : '❌'}`);
    console.log(`   Has docs: ${health.structure.hasDocs ? '✅' : '❌'}`);
    console.log(`   Has CI: ${health.structure.hasCI ? '✅' : '❌'}`);
    
    console.log('\n💡 Recommendations:');
    health.recommendations.forEach(rec => console.log(`   • ${rec}`));
  }
}

/**
 * 🔗 Example 7: Complete Workflow - Replit Agent v2 Competitor
 */
async function exampleCompleteWorkflow() {
  console.log('🔗 Complete workflow demonstration...');
  
  const projectName = 'MyAwesomeApp';
  const projectPath = `/Users/test/gitrepo/projects/999_${projectName}`;
  
  // Step 1: Initialize project
  console.log('1️⃣ Initializing project...');
  const initResult = await api.initializeProject({
    projectPath,
    projectName,
    enableGitHub: false, // Local-first
    autoSetupDependencies: true
  });
  
  if (!initResult.success) {
    console.error('❌ Project initialization failed');
    return;
  }
  
  console.log('✅ Project initialized with Git repository');
  
  // Step 2: Simulate some development work
  console.log('2️⃣ Simulating development work...');
  // ... user makes changes to files ...
  
  // Step 3: Analyze changes and get recommendations
  console.log('3️⃣ Analyzing changes...');
  const analysisResult = await api.analyzeBranches(projectPath);
  
  if (analysisResult.success) {
    const { currentChanges, recommendations } = analysisResult.data!;
    
    console.log(`📊 Found ${currentChanges.filesChanged} changed files`);
    console.log(`💡 Recommendations: ${recommendations.join(', ')}`);
    
    // Step 4: Smart commit with auto-branching
    if (currentChanges.shouldCreateBranch) {
      console.log('4️⃣ Creating branch and committing...');
      const commitResult = await api.smartCommit(projectPath, {
        createBranchIfNeeded: true,
        autoGenerateMessage: true
      });
      
      if (commitResult.success && commitResult.data?.branchCreated) {
        console.log(`✅ Auto-created branch: ${commitResult.data.branchInfo?.name}`);
        console.log(`📝 Commit: ${commitResult.data.commitMessage}`);
      }
    }
  }
  
  // Step 5: Get project health dashboard
  console.log('5️⃣ Checking project health...');
  const healthResult = await api.getProjectHealth(projectPath);
  
  if (healthResult.success) {
    const health = healthResult.data!;
    console.log(`🏥 Project health: ${health.gitStatus}`);
    console.log(`🔧 Tech stack: ${health.techStack.languages.join(', ')}`);
  }
  
  console.log('🎉 Complete workflow finished successfully!');
  console.log('📝 Summary: Local Git repo with intelligent branching, no GitHub dependency');
}

/**
 * 🎯 Key Features Demonstrated:
 */
console.log(`
🎯 Project Management API Features:

✅ LOCAL-FIRST APPROACH:
   • Every project gets local Git repo by default
   • GitHub integration is optional (enableGitHub: false)
   • Works offline and provides full version control

✅ INTELLIGENT BRANCHING:
   • Date/time convention: feature/2024-01-15-1430
   • Smart branch type detection (feature/bugfix/iteration/experiment)
   • Auto-creation based on change patterns (2+ files or 50+ lines)
   • Safe revert with automatic backup branches

✅ COMPREHENSIVE REPO ANALYSIS:
   • Detects cloned vs local repositories
   • Extracts all branch information with commit history
   • Analyzes contributors, file changes, tech stack
   • Auto-installs dependencies (npm, yarn, pip, cargo)

✅ SMART AUTOMATION:
   • Intelligent commit message generation
   • Change pattern analysis and recommendations
   • Project health monitoring and insights
   • Technology stack detection with confidence scoring

✅ SAFETY FEATURES:
   • Backup branches before destructive operations
   • Conflict detection and resolution guidance
   • Non-destructive merging with rollback options
   • Comprehensive error handling and recovery

🏆 COMPETES WITH REPLIT AGENT V2:
   • Better local Git integration
   • More intelligent branching strategy
   • Comprehensive repository analysis
   • Offline-first development workflow
   • Enterprise-grade safety features
`);

// Export examples for testing
export {
  exampleNewProject,
  exampleCloneGitHubRepo,
  exampleSmartCommit,
  exampleBranchManagement,
  exampleSafeRevert,
  exampleProjectHealth,
  exampleCompleteWorkflow
}; 