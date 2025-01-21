export interface JSONSchema {
  type: "object";
  properties: Record<string, any>;
  required?: string[];
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
}

export interface OpenAIFunctionDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
}

export interface StreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      function_call?: {
        name?: string;
        arguments?: string;
      };
      tool_calls?: Array<{
        type: 'function';
        function: {
          name: string;
          arguments: Record<string, any>;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}

export interface CompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      function_call?: {
        name: string;
        arguments: string;
      };
      tool_calls?: Array<{
        type: 'function';
        function: {
          name: string;
          arguments: Record<string, any>;
        };
      }>;
    };
    finish_reason: string;
  }>;
}

export interface ProtocolTranslator {
  translateToolDefinitions(mcpTools: MCPToolDefinition[]): OpenAIFunctionDefinition[];
  translateResponse(response: StreamChunk | CompletionResponse): StreamChunk | CompletionResponse;
  translateRequest(request: Record<string, any>): Record<string, any>;
}