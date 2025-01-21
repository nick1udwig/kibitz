import { ProtocolTranslator, MCPToolDefinition, OpenAIFunctionDefinition } from './types';

export class DeepSeekProtocolTranslator implements ProtocolTranslator {
  translateToolDefinitions(mcpTools: MCPToolDefinition[]): OpenAIFunctionDefinition[] {
    // MCP and OpenAI function definitions are identical in structure
    return mcpTools;
  }

  translateResponse(deepseekResponse: any): any {
    if (!deepseekResponse.choices?.[0]?.message?.function_call) {
      return deepseekResponse;
    }

    const originalChoice = deepseekResponse.choices[0];
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
          }]
        }
      }]
    };
  }

  translateRequest(mcpRequest: any): any {
    const openAIRequest = {
      ...mcpRequest,
      functions: mcpRequest.tools,
      function_call: mcpRequest.tools?.length > 0 ? "auto" : undefined
    };
    
    delete openAIRequest.tools;
    return openAIRequest;
  }
}