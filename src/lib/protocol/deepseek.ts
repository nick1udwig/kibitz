import { ProtocolTranslator, MCPToolDefinition, OpenAIFunctionDefinition } from './types';

export class DeepSeekProtocolTranslator implements ProtocolTranslator {
  translateToolDefinitions(mcpTools: MCPToolDefinition[]): OpenAIFunctionDefinition[] {
    console.log('🔧 Converting MCP tools to OpenAI functions:', {
      toolCount: mcpTools?.length
    });
    // MCP and OpenAI function definitions are identical in structure
    return mcpTools;
  }

  translateResponse(deepseekResponse: any): any {
    // If no choices, return as-is
    if (!deepseekResponse.choices?.[0]) {
      return deepseekResponse;
    }

    const choice = deepseekResponse.choices[0];
    
    // For streaming responses
    if (choice.delta) {
      // Just return as-is since DeepSeek follows OpenAI format
      return deepseekResponse;
    }

    // For regular responses
    if (choice.message) {
      // The function_call format matches OpenAI's format, just return as-is
      return deepseekResponse;
    }

    return deepseekResponse;
  }

  translateRequest(mcpRequest: any): any {
    console.log('📝 Translating MCP request to OpenAI format:', {
      hasTools: !!mcpRequest.tools,
      model: mcpRequest.model
    });

    // Transform system prompt if present
    let messages = mcpRequest.messages;
    if (mcpRequest.system) {
      messages = [
        { role: 'system', content: mcpRequest.system[0].text },
        ...messages
      ];
    }

    // Ensure messages alternate between user and assistant
    messages = messages.reduce((acc: any[], msg: any, index: number) => {
      if (index === 0 || 
          msg.role !== messages[index - 1].role ||
          msg.role === 'system') {
        acc.push(msg);
      } else {
        // Combine with previous message of same role
        const prevMsg = acc[acc.length - 1];
        if (typeof prevMsg.content === 'string' && typeof msg.content === 'string') {
          prevMsg.content += '\n' + msg.content;
        } else {
          // If either message has complex content (arrays, etc), just concatenate arrays
          prevMsg.content = Array.isArray(prevMsg.content) ? prevMsg.content : [prevMsg.content];
          const newContent = Array.isArray(msg.content) ? msg.content : [msg.content];
          prevMsg.content = [...prevMsg.content, ...newContent];
        }
      }
      return acc;
    }, []);

    console.log('Messages after alternating:', messages);

    const translated = {
      model: mcpRequest.model,
      messages,
      stream: mcpRequest.stream ?? true,
      temperature: mcpRequest.temperature ?? 0.7,
      max_tokens: mcpRequest.max_tokens ?? 4096,
      // Only include function calling if tools are present
      ...(mcpRequest.tools && mcpRequest.tools.length > 0 ? {
        functions: mcpRequest.tools,
        function_call: 'auto'
      } : {})
    };

    console.log('📤 Translated request:', {
      hasFunctions: !!translated.functions,
      stream: translated.stream,
      model: translated.model,
      messageCount: messages.length
    });
    return translated;
  }
}