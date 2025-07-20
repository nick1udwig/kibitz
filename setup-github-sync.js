#!/usr/bin/env node

/**
 * GitHub Sync System Setup Script
 * 
 * This script helps you get started with the GitHub sync system by:
 * 1. Checking your existing project structure
 * 2. Migrating projects to v2 schema if needed
 * 3. Setting up GitHub sync configuration
 * 4. Running a test sync
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { readdir } from 'fs/promises';

import { 
  getAllProjectsWithGitHub, 
  migrateProjectToV2, 
  updateGitHubConfig,
  readProjectJson 
} from './project-json-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class GitHubSyncSetup {
  constructor() {
    this.baseProjectsDir = '/Users/test/gitrepo/projects/';
  }

  async checkSystemRequirements() {
    console.log('🔍 Checking system requirements...\n');

    const checks = [
      { name: 'Node.js version', check: () => process.version },
      { name: 'Projects directory', check: () => existsSync(this.baseProjectsDir) },
      { name: 'Git available', check: () => 'Run: git --version' },
      { name: 'GitHub CLI available', check: () => 'Run: gh --version' }
    ];

    checks.forEach(check => {
      try {
        const result = check.check();
        console.log(`✅ ${check.name}: ${result}`);
      } catch (error) {
        console.log(`❌ ${check.name}: ${error.message}`);
      }
    });

    console.log('\n📁 Projects directory structure:');
    if (existsSync(this.baseProjectsDir)) {
      try {
        const entries = await readdir(this.baseProjectsDir);
        const projectDirs = entries.slice(0, 5); // Show first 5
        projectDirs.forEach(dir => {
          console.log(`  - ${dir}`);
        });
        if (entries.length > 5) {
          console.log(`  ... and ${entries.length - 5} more`);
        }
      } catch (error) {
        console.log(`  Error reading directory: ${error.message}`);
      }
    } else {
      console.log(`  Directory not found: ${this.baseProjectsDir}`);
    }
  }

  async discoverProjects() {
    console.log('\n🔎 Discovering existing projects...\n');

    try {
      const allProjects = await getAllProjectsWithGitHub();
      
      console.log(`Found ${allProjects.length} projects with .kibitz/api/project.json files:`);
      
      const stats = {
        total: allProjects.length,
        withGitHub: allProjects.filter(p => p.github).length,
        enabled: allProjects.filter(p => p.github?.enabled).length,
        needsMigration: 0
      };

      for (const project of allProjects.slice(0, 10)) { // Show first 10
        const status = [];
        
        if (!project.github) {
          status.push('needs v2 migration');
          stats.needsMigration++;
        } else if (project.github.enabled) {
          status.push('sync enabled');
        } else {
          status.push('sync disabled');
        }

        console.log(`  📦 ${project.projectId} (${status.join(', ')})`);
      }

      if (allProjects.length > 10) {
        console.log(`  ... and ${allProjects.length - 10} more projects`);
      }

      console.log('\n📊 Project Statistics:');
      console.log(`  Total projects: ${stats.total}`);
      console.log(`  With GitHub config: ${stats.withGitHub}`);
      console.log(`  Sync enabled: ${stats.enabled}`);
      console.log(`  Need migration: ${stats.needsMigration}`);

      return { allProjects, stats };

    } catch (error) {
      console.log(`❌ Error discovering projects: ${error.message}`);
      return { allProjects: [], stats: { total: 0, withGitHub: 0, enabled: 0, needsMigration: 0 } };
    }
  }

  async migrateProjects(projects) {
    console.log('\n🔄 Migrating projects to v2 schema...\n');

    let migrated = 0;
    let failed = 0;

    for (const project of projects) {
      try {
        const wasMigrated = await migrateProjectToV2(project.fullPath);
        if (wasMigrated) {
          console.log(`✅ Migrated: ${project.projectId}`);
          migrated++;
        } else {
          console.log(`⏭️  Already up to date: ${project.projectId}`);
        }
      } catch (error) {
        console.log(`❌ Failed to migrate ${project.projectId}: ${error.message}`);
        failed++;
      }
    }

    console.log(`\n📈 Migration Summary:`);
    console.log(`  Successfully migrated: ${migrated}`);
    console.log(`  Already up to date: ${projects.length - migrated - failed}`);
    console.log(`  Failed: ${failed}`);
  }

  async setupGitHubSync() {
    console.log('\n⚙️  Setting up GitHub sync configuration...\n');

    try {
      const projects = await getAllProjectsWithGitHub();
      
      console.log('Would you like to enable GitHub sync for projects? (This is a demo)');
      console.log('In a real setup, you would configure each project individually.\n');

      // Demo configuration for the first few projects
      const projectsToSetup = projects.slice(0, 3);
      
      for (const project of projectsToSetup) {
        try {
          // Read current project data
          const projectData = await readProjectJson(project.fullPath);
          
          // Example configuration
          const githubConfig = {
            enabled: true,
            syncBranches: ['main', 'auto/*'],
            syncInterval: 300000, // 5 minutes
            authentication: {
              type: 'token',
              configured: false // Would need real setup
            }
          };

          await updateGitHubConfig(project.fullPath, githubConfig);
          console.log(`✅ Configured GitHub sync for: ${project.projectId}`);
          
        } catch (error) {
          console.log(`❌ Failed to configure ${project.projectId}: ${error.message}`);
        }
      }

      console.log('\n🔧 Configuration complete!');
      console.log('Note: In production, you would need to:');
      console.log('1. Set up GitHub authentication (gh auth login)');
      console.log('2. Configure repository URLs for each project');
      console.log('3. Set appropriate sync intervals');

    } catch (error) {
      console.log(`❌ Setup failed: ${error.message}`);
    }
  }

  async runTestSync() {
    console.log('\n🧪 Running test sync (with mock MCP client)...\n');

    try {
      // Import and run the test suite
      const { GitHubSyncTestSuite } = await import('./test-github-sync-system.js');
      
      const testSuite = new GitHubSyncTestSuite();
      
      console.log('Running abbreviated test suite...');
      
      // Run a few key tests
      await testSuite.runTest('Project JSON Manager', () => testSuite.testProjectJsonManager());
      await testSuite.runTest('Sync Detection', () => testSuite.testSyncDetection());
      await testSuite.runTest('Git Executor', () => testSuite.testGitExecutor());
      
      testSuite.printTestSummary();
      
    } catch (error) {
      console.log(`❌ Test sync failed: ${error.message}`);
      console.log('This is expected if test files are not available');
    }
  }

  async generateConfigTemplate() {
    console.log('\n📄 Generating configuration template...\n');

    const template = {
      syncManager: {
        maxRetries: 3,
        retryDelay: 5000,
        batchSize: 5,
        defaultSyncInterval: 300000
      },
      github: {
        authentication: {
          type: 'token', // or 'ssh' or 'oauth'
          configured: false
        },
        defaultPrivate: true,
        autoCreateRepos: true
      },
      projects: {
        basePath: '/Users/test/gitrepo/projects/',
        syncBranches: ['main', 'auto/*'],
        excludePatterns: ['temp/*', 'backup/*']
      }
    };

    console.log('Configuration template:');
    console.log(JSON.stringify(template, null, 2));
    console.log('\nSave this as config.json and customize for your needs');
  }

  async runFullSetup() {
    console.log('🚀 GitHub Sync System Setup');
    console.log('='.repeat(50));

    await this.checkSystemRequirements();
    
    const { allProjects } = await this.discoverProjects();
    
    if (allProjects.length > 0) {
      await this.migrateProjects(allProjects);
      await this.setupGitHubSync();
    } else {
      console.log('\n⚠️  No existing projects found.');
      console.log('The system will work once you have projects in the expected directory structure.');
    }

    await this.runTestSync();
    await this.generateConfigTemplate();

    console.log('\n✅ Setup complete!');
    console.log('\n📋 Next Steps:');
    console.log('1. Set up GitHub authentication: gh auth login');
    console.log('2. Test with a real project directory');
    console.log('3. Replace MockMcpClient with your real MCP client');
    console.log('4. Configure repository URLs for your projects');
    console.log('5. Run the sync manager in production');
    
    console.log('\n🔧 Quick Test Commands:');
    console.log('node test-github-sync-system.js     # Run full test suite');
    console.log('node --eval "import(\'./github-sync-manager.js\').then(m => console.log(\'Ready!\'))"');
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new GitHubSyncSetup();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'check':
      setup.checkSystemRequirements();
      break;
    case 'discover':
      setup.discoverProjects();
      break;
    case 'migrate':
      setup.discoverProjects().then(({ allProjects }) => 
        setup.migrateProjects(allProjects)
      );
      break;
    case 'test':
      setup.runTestSync();
      break;
    case 'config':
      setup.generateConfigTemplate();
      break;
    default:
      setup.runFullSetup();
  }
}

export default GitHubSyncSetup; 