import { Tool } from '@anthropic-ai/sdk/resources/messages/messages';
import { McpServer } from '../types/mcp';

interface ToolReference {
  serverId: string;  // Which server provides this tool
  tool: Tool;        // The tool definition
  provider: 'openai' | 'anthropic'; // Which provider format it's in
}

export class DynamicToolRegistry {
  private toolMap: Map<string, ToolReference> = new Map();
  private providerNameMap: Map<string, string> = new Map(); // OpenAI/Anthropic name to internal name
  
  // Update tools from a server
  updateServerTools(server: McpServer) {
    // Remove old tools from this server
    this.removeServerTools(server.id);
    
    // Add new tools
    server.tools?.forEach(tool => {
      this.registerTool(server.id, tool);
    });
  }

  // Remove all tools from a server (used when server disconnects)
  removeServerTools(serverId: string) {
    // Find and remove all tools from this server
    for (const [name, ref] of this.toolMap.entries()) {
      if (ref.serverId === serverId) {
        this.toolMap.delete(name);
        // Also clean up provider name mappings
        for (const [providerName, internalName] of this.providerNameMap.entries()) {
          if (internalName === name) {
            this.providerNameMap.delete(providerName);
          }
        }
      }
    }
  }

  // Register a single tool
  private registerTool(serverId: string, tool: Tool) {
    const internalName = tool.name;
    
    // Store tool with server reference
    this.toolMap.set(internalName, {
      serverId,
      tool,
      provider: 'anthropic' // Default to Anthropic format since that's what MCP uses
    });

    // Map provider-specific names
    const openaiName = this.sanitizeToolName(tool.name, 'openai');
    const anthropicName = this.sanitizeToolName(tool.name, 'anthropic');
    
    this.providerNameMap.set(openaiName, internalName);
    this.providerNameMap.set(anthropicName, internalName);
  }

  // Get tools in provider-specific format
  getToolsForProvider(provider: 'openai' | 'anthropic', shouldCache = false): Tool[] {
    return Array.from(this.toolMap.values()).map(ref => {
      const providerTool = this.convertToolForProvider(ref.tool, provider);
      if (shouldCache) {
        return {
          ...providerTool,
          cache_control: { type: 'ephemeral' }
        };
      }
      return providerTool;
    });
  }

  // Find server for a tool
  getServerForTool(toolName: string): string | undefined {
    const internalName = this.providerNameMap.get(toolName);
    if (!internalName) return undefined;
    
    const ref = this.toolMap.get(internalName);
    return ref?.serverId;
  }

  // Get original tool name from provider-specific name
  getInternalName(providerToolName: string): string | undefined {
    return this.providerNameMap.get(providerToolName);
  }

  // Convert tool format between providers
  private convertToolForProvider(tool: Tool, provider: 'openai' | 'anthropic'): Tool {
    if (provider === 'openai') {
      return {
        type: 'function',
        function: {
          name: this.sanitizeToolName(tool.name, 'openai'),
          description: tool.description,
          parameters: tool.input_schema || {
            type: 'object',
            properties: {},
            required: []
          }
        }
      };
    }
    
    // Return in Anthropic format
    return {
      name: this.sanitizeToolName(tool.name, 'anthropic'),
      description: tool.description,
      input_schema: tool.input_schema || {
        type: 'object',
        properties: {},
        required: []
      }
    };
  }

  private sanitizeToolName(name: string, provider: 'openai' | 'anthropic'): string {
    const sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    return provider === 'openai' ? sanitized : sanitized;
  }

  // Get all registered tools for debugging/display
  getAllTools(): Map<string, ToolReference> {
    return new Map(this.toolMap);
  }

  // Check if a tool exists
  hasTool(name: string): boolean {
    return this.providerNameMap.has(name) || this.toolMap.has(name);
  }
}