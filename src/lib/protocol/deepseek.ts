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
    // Clean up logging with more detail
    console.log('📝 DeepSeek request:', {
      model: mcpRequest.model,
      messageCount: mcpRequest.messages?.length,
      hasTools: !!mcpRequest.tools,
      systemPrompt: !!mcpRequest.system
    });

    // Transform messages to DeepSeek format
    let messages = mcpRequest.messages.map(msg => {
      // Convert complex content to string
      let content = '';
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content
          .filter(c => c.type === 'text')
          .map(c => c.type === 'text' ? c.text : '')
          .join('\n')
          .trim();
      }

      return {
        role: msg.role,
        content: content
      };
    });

    // Add system message if present
    if (mcpRequest.system) {
      messages = [
        { role: 'system', content: mcpRequest.system[0].text },
        ...messages
      ];
    }

    // Filter out empty messages and ensure they alternate
    messages = messages
      .filter(msg => msg.content.trim() !== '')
      .reduce((acc: any[], msg: any, index: number) => {
        if (index === 0 || 
            msg.role !== acc[acc.length - 1].role ||
            msg.role === 'system') {
          acc.push(msg);
        } else {
          // Combine with previous message
          acc[acc.length - 1].content += '\n' + msg.content;
        }
        return acc;
      }, []);

    console.log('Messages prepared for DeepSeek:', messages);

    const translated = {
      model: mcpRequest.model,
      messages,
      stream: mcpRequest.stream ?? true,
      temperature: mcpRequest.temperature ?? 0.7,
      max_tokens: mcpRequest.max_tokens ?? 4096,
      top_p: 1,
      // Only include function calling if tools are present
      ...(mcpRequest.tools && mcpRequest.tools.length > 0 ? {
        functions: mcpRequest.tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.input_schema
        })),
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