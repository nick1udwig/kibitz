// MCP Checkpoint Tools for AI Agents
// This file provides functions for AI agents to create and manage checkpoints
// It works with the WCGW MCP server to allow checkpoint management via commands

const { exec } = require('child_process');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

// Base directory for scripts
const SCRIPTS_DIR = path.join(__dirname);

/**
 * Create a checkpoint with the given message
 * @param {string} message - Optional message to include with the checkpoint
 * @returns {Promise<{success: boolean, hash?: string, error?: string}>}
 */
async function createCheckpoint(message = '') {
  try {
    const scriptPath = path.join(SCRIPTS_DIR, 'checkpoint.sh');
    const { stdout, stderr } = await execPromise(`bash "${scriptPath}" "${message}"`);
    
    // Extract hash from output
    const hashMatch = stdout.match(/Checkpoint ([a-f0-9]+) created/);
    const hash = hashMatch ? hashMatch[1] : null;
    
    if (stderr && !stdout.includes('✅')) {
      return {
        success: false,
        error: stderr
      };
    }
    
    return {
      success: true,
      hash,
      output: stdout
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Rollback to a specific checkpoint hash
 * @param {string} hash - The checkpoint hash to rollback to
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function rollbackToCheckpoint(hash) {
  if (!hash || typeof hash !== 'string' || hash.length < 4) {
    return {
      success: false,
      error: 'Invalid checkpoint hash provided'
    };
  }
  
  try {
    const scriptPath = path.join(SCRIPTS_DIR, 'rollback.sh');
    const { stdout, stderr } = await execPromise(`bash "${scriptPath}" "${hash}"`);
    
    if (stderr && !stdout.includes('✅')) {
      return {
        success: false,
        error: stderr
      };
    }
    
    return {
      success: true,
      output: stdout
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * List available checkpoints
 * @param {number} count - Number of checkpoints to show
 * @returns {Promise<{success: boolean, checkpoints?: Array<{hash: string, date: string, message: string}>, error?: string}>}
 */
async function listCheckpoints(count = 10) {
  try {
    const scriptPath = path.join(SCRIPTS_DIR, 'list-checkpoints.sh');
    const { stdout, stderr } = await execPromise(`bash "${scriptPath}" "${count}"`);
    
    if (stderr && stderr.includes('Error')) {
      return {
        success: false,
        error: stderr
      };
    }
    
    // Parse output to extract checkpoint information
    const checkpoints = [];
    const checkpointRegex = /🔖 ([a-f0-9]+) \| ([0-9-]+) \| (.+)/g;
    let match;
    
    while ((match = checkpointRegex.exec(stdout)) !== null) {
      checkpoints.push({
        hash: match[1],
        date: match[2],
        message: match[3]
      });
    }
    
    return {
      success: true,
      checkpoints
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Export functions for MCP tool integration
module.exports = {
  createCheckpoint,
  rollbackToCheckpoint,
  listCheckpoints
};

// Example CLI usage for testing
if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  
  switch (command) {
    case 'create':
      createCheckpoint(args[0] || '')
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(err => console.error(err));
      break;
    case 'rollback':
      rollbackToCheckpoint(args[0])
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(err => console.error(err));
      break;
    case 'list':
      listCheckpoints(parseInt(args[0]) || 10)
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(err => console.error(err));
      break;
    default:
      console.log(`
Usage:
  node mcp-checkpoint-tools.js create [message]
  node mcp-checkpoint-tools.js rollback <hash>
  node mcp-checkpoint-tools.js list [count]
      `);
  }
} 