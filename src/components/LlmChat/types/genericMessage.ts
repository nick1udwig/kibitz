import { MessageContent } from '../types';
import type {
  ChatCompletionMessageParam as OpenAIMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
  ChatCompletionUserMessageParam,
  ChatCompletionAssistantMessageParam,
  ChatCompletionSystemMessageParam
} from 'openai/resources/chat/completions';
import type { Tool as AnthropicToolType } from '@anthropic-ai/sdk/resources/messages/messages';
import { Tool } from './toolTypes';

// Define OpenAI function call type
export interface FunctionCall {
  name?: string;
  arguments?: string;
}

// Generic message interface with all supported roles
export interface GenericMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | MessageContent[]; // Using specific type instead of any
  name?: string; // Ensure name is string or undefined to match with toolInput type
}

// Function to sanitize function names for OpenAI compatibility
export function sanitizeFunctionName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(); // Replace non-alphanumeric and non-underscore with underscore, and lowercase
}

function anthropicToolToOpenAIFunction(tool: Tool | AnthropicToolType): ChatCompletionTool {
  let description = tool.description || '';
  if (description.length > 1024) {
    console.warn(`Tool description for '${tool.name}' is too long (${description.length} characters). Truncating to 1024 characters.`);
    description = description.substring(0, 1021) + '...';
  }

  const properties: Record<string, { type: string; description?: string; enum?: string[] }> =
    tool.input_schema?.properties ?? Object.create(null);

  const required = (tool.input_schema?.required ?? []) as string[];

  return {
    type: 'function',
    function: {
      name: sanitizeFunctionName(tool.name),
      description: description,
      parameters: {
        type: 'object',
        properties,
        required,
        additionalProperties: false
      }
    }
  };
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | MessageContent[];
}

interface AnthropicPayload {
  messages: AnthropicMessage[];
  system?: string;
}

export function toAnthropicFormat(messages: GenericMessage[], systemPrompt?: string): AnthropicPayload {
  const anthropicMessages = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string') {
        systemPrompt = msg.content; // Only use string content for system prompt
      } else if (Array.isArray(msg.content)) {
        const textContent = msg.content.find(c => c.type === 'text');
        if (textContent && 'text' in textContent) {
          systemPrompt = textContent.text;
        }
      }
    } else {
      anthropicMessages.push({
        role: msg.role === 'tool' ? 'user' : msg.role, // Convert 'tool' to 'user' for Anthropic
        content: msg.content, // Type assertion since we know these types are compatible
      });
    }
  }

  const anthropicPayload: AnthropicPayload = { messages: anthropicMessages };
  if (systemPrompt) {
    anthropicPayload.system = systemPrompt;
  }
  return anthropicPayload;
}

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

interface OpenAIPayload {
  messages: Array<ChatCompletionMessageParam>;
  tools?: ChatCompletionTool[];
  tool_choice?: string;
  function_calling?: {
    allow_nested_function_calls: boolean;
    allow_multiple_function_calls: boolean;
  };
}

export function toOpenAIFormat(messages: GenericMessage[], tools?: Array<Tool | AnthropicToolType>): OpenAIPayload {
  const openaiMessages: OpenAIMessageParam[] = [];
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      const toolUseContent = msg.content.find(content => content.type === 'tool_use');
      const toolResultContent = msg.content.find(content => content.type === 'tool_result');
      const textContent = msg.content.find(content => content.type === 'text');

      if (toolUseContent) {
        openaiMessages.push({
          role: 'assistant',
          content: textContent?.text || '',
          tool_calls: [{
            id: toolUseContent.id,
            type: 'function' as const,
            function: {
              name: toolUseContent.name,
              arguments: JSON.stringify(toolUseContent.input),
            },
          }],
          name: msg.name,
        });
      } else if (toolResultContent) {
        openaiMessages.push({
          role: 'tool',
          tool_call_id: toolResultContent.tool_use_id,
          content: toolResultContent.content,
        } as ChatCompletionToolMessageParam);
      } else {
        openaiMessages.push({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: textContent?.text || '',
          name: msg.name,
        } as ChatCompletionUserMessageParam | ChatCompletionAssistantMessageParam | ChatCompletionSystemMessageParam);
      }
    } else {
      openaiMessages.push({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content as string,
        name: msg.name,
      } as ChatCompletionUserMessageParam | ChatCompletionAssistantMessageParam | ChatCompletionSystemMessageParam);
    }
  }

  const openaiPayload: OpenAIPayload = { messages: openaiMessages };

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
