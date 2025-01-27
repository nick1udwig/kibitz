import { MessageContent } from '../types';

export interface GenericMessage {
  role: 'user' | 'assistant' | 'system';
  content: any; // Keep it flexible for now, can be string or MessageContent[]
  name?: string; // Ensure name is string or undefined to match with toolInput type
}

// Define the OpenAI function format - simplified
interface OpenAIFunction {
  type: 'function';
  name: string; // Name directly at the top level
  description: string; // Description directly at the top level
  parameters: any; // Parameters directly at the top level
}

// Function to sanitize function names for OpenAI compatibility
function sanitizeFunctionName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(); // Replace non-alphanumeric and non-underscore with underscore, and lowercase
}

// Function to convert Anthropic tool to OpenAI function format - simplified structure with description truncation
function anthropicToolToOpenAIFunction(anthropicTool: any): OpenAIFunction {
  let description = anthropicTool.description;
  if (description && description.length > 1024) {
    console.warn(`Tool description for '${anthropicTool.name}' is too long (${description.length} characters). Truncating to 1024 characters.`);
    description = description.substring(0, 1021) + '...'; // Truncate and add ellipsis
  }

  return {
    type: 'function',
    name: sanitizeFunctionName(anthropicTool.name), // Name directly here
    description: description, // Use potentially truncated description
    parameters: anthropicTool.input_schema, // Parameters directly here
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
      continue; // Skip tool_use messages for OpenAI format - they are handled differently
    }
    if (Array.isArray(msg.content) && msg.content.some(content => content.type === 'tool_result')) {
      continue; // Skip tool_result messages for OpenAI format - they are handled differently
    }
    openaiMessages.push({
      role: msg.role,
      content: msg.content,
      name: msg.name, // Include name if available, might be needed for function calls
    });
  }

  const openaiPayload: any = { messages: openaiMessages };

  // Convert and add tools to the payload if provided
  if (tools && tools.length > 0) {
    openaiPayload.functions = tools.map(anthropicToolToOpenAIFunction);
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