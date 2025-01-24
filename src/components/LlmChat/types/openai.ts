import { TextBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';
import { MessageContent } from '../types';

export type OpenAIRole = 'user' | 'assistant' | 'system' | 'function';

export interface OpenAIMessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

export interface OpenAIMessage {
  role: OpenAIRole;
  content: string | OpenAIMessageContent[];
  function_call?: {
    name: string;
    arguments: string;
  };
  name?: string; // For function messages
}

export interface OpenAIStreamResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    delta: {
      role?: OpenAIRole;
      content?: string;
      function_call?: {
        name: string;
        arguments: string;
      };
      tool_calls?: {
        index: number;
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }[];
    };
    index: number;
    finish_reason: string | null;
  }[];
}

export interface OpenAIResponseFormat {
  type: 'text' | 'json_object';
  json_schema?: Record<string, unknown>;
}

export interface OpenAISystemContent {
  type: 'text';
  text: string;
}

// For converting between OpenAI and Anthropic formats
export function convertOpenAIToAnthropicMessage(msg: OpenAIMessage) {
  // Handle system messages
  if (msg.role === 'system') {
    return {
      role: 'assistant',
      content: [{
        type: 'text',
        text: msg.content as string
      }] as TextBlockParam[]
    };
  }

  // Handle function calls
  if (msg.role === 'function' || msg.function_call) {
    return {
      role: 'assistant',
      content: [{
        type: 'text',
        text: msg.function_call
          ? `Function call: ${msg.function_call.name}(${msg.function_call.arguments})`
          : msg.content as string
      }] as TextBlockParam[]
    };
  }

  // Handle image content
  if (Array.isArray(msg.content)) {
    const content = msg.content.map(item => {
      if ((item as OpenAIMessageContent).type === 'image_url') {
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: (item as OpenAIMessageContent).image_url?.url.split(',')[1] || ''
          }
        };
      }
      return item;
    });

    return {
      role: msg.role,
      content
    };
  }

  // Handle regular text content
  return {
    role: msg.role,
    content: msg.content
  };
}

export function convertAnthropicToOpenAIMessage(msg: {
  role: string;
  content: string | MessageContent[];
}) {
  return {
    role: msg.role,
    content: msg.content
  };
}
