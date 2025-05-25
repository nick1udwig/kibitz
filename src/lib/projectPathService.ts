/**
 * Project Path Service
 * 
 * Manages project-specific directory creation and path resolution.
 * Each project gets its own isolated directory for development.
 */

import { Project } from '../components/LlmChat/context/types';

/**
 * Base directory where all project directories will be created
 */
const BASE_PROJECT_DIR = '/Users/test/gitrepo/projects';

/**
 * Sanitizes a project name for use in file system paths
 * @param name Project name
 * @returns Sanitized name safe for file system
 */
export const sanitizeProjectName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '-')  // Replace non-alphanumeric chars with hyphens
    .replace(/-+/g, '-')             // Replace multiple hyphens with single
    .replace(/^-|-$/g, '');          // Remove leading/trailing hyphens
};

/**
 * Gets the directory path for a specific project
 * @param projectId Project ID
 * @param projectName Project name (optional, for directory naming)
 * @returns Full path to project directory
 */
export const getProjectPath = (projectId: string, projectName?: string): string => {
  const sanitizedName = projectName ? sanitizeProjectName(projectName) : 'project';
  const directoryName = `${projectId}-${sanitizedName}`;
  return `${BASE_PROJECT_DIR}/${directoryName}`;
};

/**
 * Gets the GitHub repository name for a project (unique to avoid conflicts)
 * @param projectId Project ID
 * @param projectName Project name
 * @returns Unique repository name
 */
export const getGitHubRepoName = (projectId: string, projectName: string): string => {
  const sanitizedName = sanitizeProjectName(projectName);
  return `${projectId}-${sanitizedName}`;
};

/**
 * Creates the project directory structure
 * @param projectPath Full path to project directory
 * @param mcpServerId MCP server ID
 * @param executeTool Function to execute tools on MCP server
 * @returns Success status
 */
export const createProjectDirectory = async (
  projectPath: string,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<boolean> => {
  try {
    // First, create the directory using base path initialization
    let threadId = "project-setup";
    try {
      const initResult = await executeTool(mcpServerId, 'Initialize', {
        type: "first_call",
        any_workspace_path: BASE_PROJECT_DIR,
        initial_files_to_read: [],
        task_id_to_resume: "",
        mode_name: "wcgw",
        thread_id: threadId
      });

      // Extract thread ID if possible
      const match = initResult.match(/thread_id=([a-z0-9]+)/i);
      if (match && match[1]) {
        threadId = match[1];
      }
    } catch (initError) {
      console.warn("Failed to initialize MCP environment:", initError);
    }

    // Create the project directory
    const createDirResult = await executeTool(mcpServerId, 'BashCommand', {
      action_json: { command: `mkdir -p "${projectPath}"` },
      thread_id: threadId
    });

    console.log(`Created project directory: ${projectPath}`);
    
    // Now re-initialize with the project-specific directory as workspace
    try {
      const projectInitResult = await executeTool(mcpServerId, 'Initialize', {
        type: "first_call",
        any_workspace_path: projectPath, // Use project-specific path
        initial_files_to_read: [],
        task_id_to_resume: "",
        mode_name: "wcgw",
        thread_id: threadId
      });

      // Update thread ID if provided
      const projectMatch = projectInitResult.match(/thread_id=([a-z0-9]+)/i);
      if (projectMatch && projectMatch[1]) {
        threadId = projectMatch[1];
      }
    } catch (projectInitError) {
      console.warn("Failed to re-initialize with project directory:", projectInitError);
    }
    
    // Create a basic README.md file
    const readmeContent = `# Project

This is a Kibitz project directory.

## Getting Started

This directory was automatically created for your project workspace.
`;

    const createReadmeResult = await executeTool(mcpServerId, 'FileWriteOrEdit', {
      file_path: `README.md`, // Relative path since we're in project directory
      content: readmeContent,
      thread_id: threadId
    });

    return !createDirResult.includes('Error:') && !createReadmeResult.includes('Error:');
  } catch (error) {
    console.error('Failed to create project directory:', error);
    return false;
  }
};

/**
 * Checks if a project directory exists and initializes ws-mcp environment
 * @param projectPath Full path to project directory
 * @param mcpServerId MCP server ID
 * @param executeTool Function to execute tools on MCP server
 * @returns Whether directory exists
 */
export const projectDirectoryExists = async (
  projectPath: string,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<boolean> => {
  try {
    // Initialize MCP environment with base directory for existence check
    let threadId = "project-check";
    try {
      const initResult = await executeTool(mcpServerId, 'Initialize', {
        type: "first_call",
        any_workspace_path: BASE_PROJECT_DIR,
        initial_files_to_read: [],
        task_id_to_resume: "",
        mode_name: "wcgw",
        thread_id: threadId
      });

      // Extract thread ID if possible
      const match = initResult.match(/thread_id=([a-z0-9]+)/i);
      if (match && match[1]) {
        threadId = match[1];
      }
    } catch (initError) {
      console.warn("Failed to initialize MCP environment:", initError);
    }

    // Check if directory exists
    const checkResult = await executeTool(mcpServerId, 'BashCommand', {
      action_json: { command: `test -d "${projectPath}" && echo "exists" || echo "not_exists"` },
      thread_id: threadId
    });

    const exists = checkResult.includes('exists');
    
    // If directory exists, initialize ws-mcp with project-specific path
    if (exists) {
      try {
        await executeTool(mcpServerId, 'Initialize', {
          type: "first_call",
          any_workspace_path: projectPath, // Use project-specific path
          initial_files_to_read: [],
          task_id_to_resume: "",
          mode_name: "wcgw",
          thread_id: threadId
        });
      } catch (projectInitError) {
        console.warn("Failed to initialize with project directory:", projectInitError);
      }
    }

    return exists;
  } catch (error) {
    console.error('Failed to check project directory:', error);
    return false;
  }
};

/**
 * Ensures a project directory exists, creating it if necessary
 * @param project Project data
 * @param mcpServerId MCP server ID
 * @param executeTool Function to execute tools on MCP server
 * @returns Project path
 */
export const ensureProjectDirectory = async (
  project: Project,
  mcpServerId: string,
  executeTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<string>
): Promise<string> => {
  const projectPath = getProjectPath(project.id, project.name);
  
  const exists = await projectDirectoryExists(projectPath, mcpServerId, executeTool);
  
  if (!exists) {
    const created = await createProjectDirectory(projectPath, mcpServerId, executeTool);
    if (!created) {
      throw new Error(`Failed to create project directory: ${projectPath}`);
    }
  }

  return projectPath;
}; 