import { MessageContent } from '../types';

export interface GenericMessage {
  role: 'user' | 'assistant' | 'system';
  content: any; // Keep it flexible for now, can be string or MessageContent[]
  name?: string; // Ensure name is string or undefined to match with toolInput type
}

// Define the OpenAI function format
interface OpenAIFunctionParameter {
  type: string;
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
  }>;
  required?: string[];
  additionalProperties?: boolean;
}

interface OpenAIFunction {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: OpenAIFunctionParameter;
  };
}

interface OpenAITool {
  type: 'function';
  function: OpenAIFunction['function'];
}

// Function to sanitize function names for OpenAI compatibility
export function sanitizeFunctionName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(); // Replace non-alphanumeric and non-underscore with underscore, and lowercase
}

// Function to convert Anthropic tool to OpenAI function format
function anthropicToolToOpenAIFunction(anthropicTool: any): OpenAITool {
  let description = anthropicTool.description;
  if (description && description.length > 1024) {
    console.warn(`Tool description for '${anthropicTool.name}' is too long (${description.length} characters). Truncating to 1024 characters.`);
    description = description.substring(0, 1021) + '...';
  }

  return {
    type: 'function',
    function: {
      name: sanitizeFunctionName(anthropicTool.name),
      description: description,
      parameters: {
        type: 'object',
        properties: anthropicTool.input_schema.properties || {},
        required: anthropicTool.input_schema.required || [],
        additionalProperties: false
      }
    }
  };
}

export function toAnthropicFormat(messages: GenericMessage[], systemPrompt?: string): any {
  const anthropicMessages = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt = msg.content; // Assuming only one system message, or taking the last one
    } else {
      anthropicMessages.push({ role: msg.role, content: msg.content }); // Anthropic also uses 'role' and 'content'
    }
  }

  const anthropicPayload: any = { messages: anthropicMessages };
  if (systemPrompt) {
    anthropicPayload.system = systemPrompt;
  }
  return anthropicPayload;
}

export function toOpenAIFormat(messages: GenericMessage[], tools?: any[]): any {
  const openaiMessages = [];
  for (const msg of messages) {
    if (Array.isArray(msg.content) && msg.content.some(content => content.type === 'tool_use')) {
      //const nonToolUseContent = msg.content.find(content => content.type !== 'tool_use');
      const toolUseContent = msg.content.find(content => content.type === 'tool_use');
      openaiMessages.push({
        role: msg.role,
        tool_calls: [
          //...nonToolUseContent,
          {
            id: toolUseContent.id,
            type: 'function',
            function: {
              name: toolUseContent.name,
              arguments: JSON.stringify(toolUseContent.input),
            },
          }
        ],
        name: msg.name,
      });
    } else if (Array.isArray(msg.content) && msg.content.some(content => content.type === 'tool_result')) {
      const toolResultContent = msg.content.find(content => content.type === 'tool_result');
      openaiMessages.push({
        role: 'tool',
        tool_call_id: toolResultContent.tool_use_id,
        content: toolResultContent.content,
      });
    } else {
      openaiMessages.push({
        role: msg.role,
        content: msg.content,
        name: msg.name,
      });
    }
  }

  const openaiPayload: any = { messages: openaiMessages };

  // Convert and add tools to the payload if provided
  if (tools && tools.length > 0) {
    openaiPayload.tools = tools.map(anthropicToolToOpenAIFunction);
    // Enable function calling and set it to auto
    openaiPayload.tool_choice = 'auto';
    // Add function calling configuration
    openaiPayload.function_calling = {
      allow_nested_function_calls: true,
      allow_multiple_function_calls: true
    };
  }

  return openaiPayload;
}

import { Message } from '../types'; // Assuming Message type is in '../types'

export function messageToGenericMessage(message: Message): GenericMessage {
  return {
    role: message.role as 'user' | 'assistant' | 'system',
    content: message.content,
    name: message.toolInput as string | undefined,
  };
}

export function genericMessageToMessage(genericMessage: GenericMessage): Message {
  return {
    role: genericMessage.role as 'user' | 'assistant',
    content: genericMessage.content,
    timestamp: new Date(),
  };
}
