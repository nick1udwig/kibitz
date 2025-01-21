import { ProtocolTranslator, MCPToolDefinition, OpenAIFunctionDefinition } from './types';

export class DeepSeekProtocolTranslator implements ProtocolTranslator {
  translateToolDefinitions(mcpTools: MCPToolDefinition[]): OpenAIFunctionDefinition[] {
    // MCP and OpenAI function definitions are identical in structure
    return mcpTools;
  }

  translateResponse(deepseekResponse: any): any {
    if (!deepseekResponse.choices?.[0]) {
      return deepseekResponse;
    }

    const originalChoice = deepseekResponse.choices[0];
    
    // Handle delta for streaming
    if (originalChoice.delta) {
      if (originalChoice.delta.function_call) {
        return {
          ...deepseekResponse,
          choices: [{
            ...originalChoice,
            delta: {
              ...originalChoice.delta,
              tool_calls: [{
                type: "function",
                function: {
                  name: originalChoice.delta.function_call.name,
                  arguments: originalChoice.delta.function_call.arguments 
                    ? JSON.parse(originalChoice.delta.function_call.arguments)
                    : {}
                }
              }],
              function_call: undefined
            }
          }]
        };
      }
      return deepseekResponse;
    }

    // Handle regular response
    if (originalChoice.message?.function_call) {
      const functionCall = originalChoice.message.function_call;
      return {
        ...deepseekResponse,
        choices: [{
          ...originalChoice,
          message: {
            role: originalChoice.message.role,
            content: originalChoice.message.content,
            tool_calls: [{
              type: "function",
              function: {
                name: functionCall.name,
                arguments: JSON.parse(functionCall.arguments)
              }
            }],
            function_call: undefined
          }
        }]
      };
    }

    return deepseekResponse;
  }

  translateRequest(mcpRequest: any): any {
    const { tools, ...rest } = mcpRequest;
    return {
      ...rest,
      functions: tools,
      function_call: tools?.length > 0 ? "auto" : undefined,
      // DeepSeek-specific settings
      temperature: rest.temperature ?? 0.7,
      max_tokens: rest.max_tokens ?? 4096,
      top_p: rest.top_p ?? 1,
      frequency_penalty: rest.frequency_penalty ?? 0,
      presence_penalty: rest.presence_penalty ?? 0,
    };
  }
}