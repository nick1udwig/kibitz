export type LegacyProviderType = 'anthropic' | 'openai' | 'openrouter';

export interface ProviderConfig {
  type: string;
  settings: Record<string, string>;
}

export interface LegacyProviderSettings {
  apiKey?: string;  // Legacy field
  anthropicApiKey?: string;
  openRouterApiKey?: string;
  openRouterBaseUrl?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiOrgId?: string;
}

// Helper function to convert legacy settings to new format
export function isAnthropicProvider(provider: LegacyProviderType | undefined): boolean {
  return !provider || provider === 'anthropic';
}

export function convertLegacyToProviderConfig(
  provider: LegacyProviderType | undefined,
  settings: LegacyProviderSettings
): ProviderConfig {
  if (isAnthropicProvider(provider)) {
    return {
      type: 'anthropic',
      settings: {
        apiKey: settings.anthropicApiKey || settings.apiKey || '',
      }
    };
  } else if (provider === 'openai') {
    return {
      type: 'openai',
      settings: {
        apiKey: settings.openaiApiKey || '',
        baseUrl: settings.openaiBaseUrl || 'https://api.openai.com/v1',
        organizationId: settings.openaiOrgId || '',
      }
    };
  }
  throw new Error(`Unknown provider type: ${provider}`);
}

// Helper function to extract legacy settings from provider config
export function extractLegacySettings(config: ProviderConfig): LegacyProviderSettings {
  switch (config.type) {
    case 'anthropic':
      return {
        anthropicApiKey: config.settings.apiKey,
        apiKey: config.settings.apiKey, // For maximum compatibility
      };
    case 'openai':
      return {
        openaiApiKey: config.settings.apiKey,
        openaiBaseUrl: config.settings.baseUrl,
        openaiOrgId: config.settings.organizationId,
      };
    default:
      return {};
  }
}

// Helper function to get provider-specific model options
export function getProviderModels(type: string): string[] {
  switch (type) {
    case 'anthropic':
      return [
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
      ];
    case 'openai':
      return [
        'gpt-4o',           // Most capable
        'gpt-4-turbo',      // Fast, up to date
        'gpt-4o-mini',      // Smaller but fast
        'gpt-4',            // Original GPT-4
        'gpt-3.5-turbo',    // Fast, cost-effective
        'gpt-3.5-turbo-16k' // Larger context
      ];
    default:
      return [];
  }
}

export interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system' | 'function';
  content: string | MessageContent[];
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | MessageContent[];
}

import { Message, MessageContent } from '../types';

// Interfaces for each provider's stream
export interface AnthropicStream {
  on(event: 'text', callback: (text: string) => void): void;
  finalMessage(): Promise<{
    role: string;
    content: MessageContent[];
  }>;
  abort?(): void;
}

export interface OpenAIStream {
  content(): AsyncGenerator<string, void, unknown>;
  finalMessage(): Promise<{
    role: string;
    content: MessageContent[] | {
      type: string;
      name: string;
      input: Record<string, unknown>;
      id: string;
    }[];
  }>;
  abort?(): void;
}

// Generic stream interface that works for both providers
export type MessageStream = AnthropicStream | OpenAIStream;

export function convertMessageFormat(
  messages: Message[],
  provider: LegacyProviderType,
  isJsonMode?: boolean
): OpenAIMessage[] | AnthropicMessage[] {
  if (isAnthropicProvider(provider)) {
    return messages.map(msg => ({
      // Convert all special roles to 'assistant' for Anthropic
      role: msg.role === 'developer' || msg.role === 'system' || msg.role === 'function'
        ? 'assistant'
        : msg.role as 'user' | 'assistant',
      content: msg.content
    })) as AnthropicMessage[];
  }

  // Convert to OpenAI format
  return messages.map(msg => {
    // Handle system/developer messages
    if (msg.role === 'developer') {
      return {
        role: 'system',
        content: msg.content
      };
    }

    // Handle function messages
    if (msg.role === 'function' && Array.isArray(msg.content)) {
      // Extract function name and result from tool_result content
      const toolResult = msg.content.find(c => c.type === 'tool_result');
      if (toolResult && 'tool_use_id' in toolResult) {
        return {
          role: 'function',
          name: toolResult.tool_use_id,
          content: toolResult.content
        };
      }
      // Fallback if no tool result found
      return {
        role: 'assistant',
        content: msg.content
      };
    }

    // Handle regular messages
    const msgContent = msg.content;
    if (isJsonMode && typeof msgContent === 'string') {
      try {
        // Validate if the content is JSON
        JSON.parse(msgContent);
      } catch (e) {
        console.warn('Invalid JSON in message:', e);
      }
    }

    return {
      role: msg.role as 'user' | 'assistant' | 'system' | 'function',
      content: msgContent
    };
  });
}
