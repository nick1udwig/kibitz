/**
 * Path Fix Verification Test
 * 
 * This script verifies that the Docker path configuration fixes are working correctly.
 * It tests that MCP tools can access files at the correct path: /Users/test/gitrepo/projects
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Path Fix Verification Test Starting...\n');

// Test configuration
const EXPECTED_PATH = '/Users/test/gitrepo/projects';
const TEST_PROJECT_NAME = 'path-test-project';
const TEST_FILE_NAME = 'test-file.txt';
const TEST_CONTENT = 'This is a test file created to verify path accessibility.\nTimestamp: ' + new Date().toISOString();

async function runPathVerificationTest() {
  try {
    console.log('1. 📍 Checking expected project path exists...');
    
    // Check if the expected path exists
    if (!fs.existsSync(EXPECTED_PATH)) {
      console.error(`❌ ERROR: Expected path does not exist: ${EXPECTED_PATH}`);
      console.log('   This means the Docker volume mount is not working correctly.');
      return false;
    }
    console.log(`✅ Expected path exists: ${EXPECTED_PATH}`);

    console.log('\n2. 🔍 Testing directory creation...');
    
    // Test creating a test project directory
    const testProjectPath = path.join(EXPECTED_PATH, TEST_PROJECT_NAME);
    
    if (fs.existsSync(testProjectPath)) {
      console.log(`   Test project directory already exists, removing: ${testProjectPath}`);
      fs.rmSync(testProjectPath, { recursive: true, force: true });
    }
    
    fs.mkdirSync(testProjectPath, { recursive: true });
    console.log(`✅ Successfully created test project directory: ${testProjectPath}`);

    console.log('\n3. 📝 Testing file creation...');
    
    // Test creating a file in the test project
    const testFilePath = path.join(testProjectPath, TEST_FILE_NAME);
    fs.writeFileSync(testFilePath, TEST_CONTENT);
    console.log(`✅ Successfully created test file: ${testFilePath}`);

    console.log('\n4. 📖 Testing file reading...');
    
    // Test reading the file back
    const readContent = fs.readFileSync(testFilePath, 'utf8');
    if (readContent === TEST_CONTENT) {
      console.log(`✅ Successfully read test file content`);
    } else {
      console.error(`❌ ERROR: File content mismatch`);
      return false;
    }

    console.log('\n5. 🗂️ Testing directory listing...');
    
    // Test listing directory contents
    const files = fs.readdirSync(testProjectPath);
    if (files.includes(TEST_FILE_NAME)) {
      console.log(`✅ Test file found in directory listing: ${files.join(', ')}`);
    } else {
      console.error(`❌ ERROR: Test file not found in directory listing`);
      return false;
    }

    console.log('\n6. 🧹 Cleaning up test files...');
    
    // Clean up test files
    fs.rmSync(testProjectPath, { recursive: true, force: true });
    console.log(`✅ Successfully cleaned up test directory`);

    console.log('\n🎉 PATH FIX VERIFICATION: ALL TESTS PASSED!');
    console.log('✅ MCP tools should now be able to access files at the correct path.');
    console.log(`✅ Project files will be accessible at: ${EXPECTED_PATH}`);
    
    return true;

  } catch (error) {
    console.error('\n❌ PATH FIX VERIFICATION FAILED:');
    console.error('Error:', error.message);
    console.error('\nThis indicates that the Docker path configuration still has issues.');
    console.error('Make sure the Docker container is properly mounting the host directory.');
    return false;
  }
}

// Environment information
console.log('📋 Environment Information:');
console.log(`   Current working directory: ${process.cwd()}`);
console.log(`   Expected project path: ${EXPECTED_PATH}`);
console.log(`   Node.js version: ${process.version}`);
console.log(`   Platform: ${process.platform}`);

// Check if we're running in Docker
const isDocker = fs.existsSync('/.dockerenv') || 
                 process.env.DOCKER_CONTAINER === 'true' ||
                 process.env.PROJECT_WORKSPACE_PATH;

console.log(`   Running in Docker: ${isDocker ? 'Yes' : 'No'}`);
if (process.env.PROJECT_WORKSPACE_PATH) {
  console.log(`   PROJECT_WORKSPACE_PATH: ${process.env.PROJECT_WORKSPACE_PATH}`);
}
console.log('');

// Run the test
runPathVerificationTest().then(success => {
  if (success) {
    console.log('\n🚀 You can now restart your Docker containers and the MCP tools should work correctly!');
    process.exit(0);
  } else {
    console.log('\n🔧 Please check the Docker configuration and try again.');
    process.exit(1);
  }
}).catch(error => {
  console.error('\n💥 Unexpected error running verification test:', error);
  process.exit(1);
}); 