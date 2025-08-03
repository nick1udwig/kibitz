/**
 * Docker File Copy Verification Script
 * 
 * This script verifies that all necessary files for GitHub sync functionality
 * are being copied to the Docker container during the build process.
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Docker File Copy Verification Starting...\n');

// Files that should be copied to Docker container for GitHub sync functionality
const REQUIRED_ROOT_FILES = [
  'project-json-manager.js',
  'github-sync-api.js', 
  'github-sync-manager.js',
  'github-sync-scheduler.js',
  'sync-detection-service.js'
];

// Additional files that might be needed
const OPTIONAL_ROOT_FILES = [
  'git-executor.js',
  'setup-github-sync.js'
];

function checkFileExists(filename) {
  const filePath = path.join(process.cwd(), filename);
  return fs.existsSync(filePath);
}

function verifyDockerfileContainsFile(filename) {
  const dockerfilePath = path.join(process.cwd(), 'docker', 'Dockerfile');
  if (!fs.existsSync(dockerfilePath)) {
    console.error('❌ Dockerfile not found at docker/Dockerfile');
    return false;
  }
  
  const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
  return dockerfileContent.includes(`COPY --chown=appuser:appuser ${filename} ./`);
}

console.log('📋 Checking required files for GitHub sync functionality...\n');

let allRequiredExists = true;
let allRequiredCopied = true;

console.log('🔍 Required Files:');
REQUIRED_ROOT_FILES.forEach(filename => {
  const exists = checkFileExists(filename);
  const inDockerfile = verifyDockerfileContainsFile(filename);
  
  console.log(`  ${filename}:`);
  console.log(`    ✅ Exists locally: ${exists ? 'Yes' : 'No'}`);
  console.log(`    ✅ Copied in Dockerfile: ${inDockerfile ? 'Yes' : 'No'}`);
  
  if (!exists) {
    allRequiredExists = false;
    console.log(`    ❌ ERROR: File does not exist locally!`);
  }
  
  if (!inDockerfile) {
    allRequiredCopied = false;
    console.log(`    ❌ ERROR: File not copied in Dockerfile!`);
  }
  
  console.log('');
});

console.log('🔍 Optional Files:');
OPTIONAL_ROOT_FILES.forEach(filename => {
  const exists = checkFileExists(filename);
  const inDockerfile = verifyDockerfileContainsFile(filename);
  
  console.log(`  ${filename}:`);
  console.log(`    ✅ Exists locally: ${exists ? 'Yes' : 'No'}`);
  console.log(`    ✅ Copied in Dockerfile: ${inDockerfile ? 'Yes' : 'No'}`);
  
  if (exists && !inDockerfile) {
    console.log(`    ⚠️  WARNING: File exists but not copied (might be needed)`);
  }
  
  console.log('');
});

// Check imports in GitHub sync routes
console.log('🔍 Checking GitHub sync route imports...');
const GITHUB_SYNC_ROUTES = [
  'src/app/api/github-sync/config/route.ts',
  'src/app/api/github-sync/status/route.ts', 
  'src/app/api/github-sync/trigger/route.ts'
];

GITHUB_SYNC_ROUTES.forEach(routePath => {
  console.log(`  Checking ${routePath}:`);
  
  if (!checkFileExists(routePath)) {
    console.log(`    ❌ ERROR: Route file does not exist!`);
    return;
  }
  
  const routeContent = fs.readFileSync(routePath, 'utf8');
  
  // Check for project-json-manager imports
  if (routeContent.includes('project-json-manager.js')) {
    console.log(`    ✅ Imports project-json-manager.js`);
  }
  
  // Check for relative path imports that might break
  const relativeImports = routeContent.match(/from\s+['"]\.\.\/.*?['"]/g);
  if (relativeImports) {
    console.log(`    📄 Relative imports found: ${relativeImports.join(', ')}`);
  }
  
  console.log('');
});

// Summary
console.log('📊 VERIFICATION SUMMARY:');
console.log('='.repeat(50));

if (allRequiredExists && allRequiredCopied) {
  console.log('✅ SUCCESS: All required files exist and are copied to Docker!');
  console.log('🚀 Your GitHub sync functionality should work in Docker now.');
} else {
  if (!allRequiredExists) {
    console.log('❌ ERROR: Some required files are missing locally.');
  }
  if (!allRequiredCopied) {
    console.log('❌ ERROR: Some required files are not copied in Dockerfile.');
  }
  console.log('🔧 Please fix the issues above before building Docker container.');
}

console.log('\n🔧 Next steps:');
console.log('1. Fix any issues listed above');
console.log('2. Rebuild Docker container: docker-compose build --no-cache');
console.log('3. Test GitHub sync functionality'); 