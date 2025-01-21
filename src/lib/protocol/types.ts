export interface MCPToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required: string[];
  };
}

export interface OpenAIFunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required: string[];
  };
}

export interface ProtocolTranslator {
  translateToolDefinitions(mcpTools: MCPToolDefinition[]): OpenAIFunctionDefinition[];
  translateResponse(response: any): any;
  translateRequest(request: any): any;
}