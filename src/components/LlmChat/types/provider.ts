export type LegacyProviderType = 'anthropic' | 'openrouter' | 'openai';
export type OpenAIProvider = 'openai';
export type AnthropicProvider = 'anthropic';
export type ProviderType = OpenAIProvider | AnthropicProvider | 'openrouter';

export interface BaseProviderSettings {
  apiKey: string;
  isProviderLocked?: boolean;  // If true, provider cannot be changed after project creation
}

export interface OpenAIProviderSettings extends BaseProviderSettings {
  baseUrl?: string;
  organizationId?: string;
  model?: string;  // OpenAI model override
}

export interface OpenRouterProviderSettings extends OpenAIProviderSettings {
  // OpenRouter is a superset of OpenAI configuration, but customized for OpenRouter endpoints
  baseUrl: string;  // Required for OpenRouter API endpoint
}

export interface ProviderConfig {
  type: ProviderType;
  settings: BaseProviderSettings | OpenAIProviderSettings | OpenRouterProviderSettings;
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
export function convertLegacyToProviderConfig(
  provider: LegacyProviderType | undefined,
  settings: LegacyProviderSettings
): ProviderConfig {
  if (!provider || provider === 'anthropic') {
    return {
      type: 'anthropic',
      settings: {
        apiKey: settings.anthropicApiKey || settings.apiKey || '',
      }
    };
  } else if (provider === 'openrouter') {
    return {
      type: 'openrouter',
      settings: {
        apiKey: settings.openRouterApiKey || '',
        baseUrl: settings.openRouterBaseUrl || '',
      }
    };
  } else if (provider === 'openai') {
    return {
      type: 'openai',
      settings: {
        apiKey: settings.openaiApiKey || '',
        baseUrl: settings.openaiBaseUrl || 'https://api.openai.com/v1',
        organizationId: settings.openaiOrgId || '',
      } as OpenAIProviderSettings
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
    case 'openrouter': {
      const settings = config.settings as OpenRouterProviderSettings;
      return {
        openRouterApiKey: settings.apiKey,
        openRouterBaseUrl: settings.baseUrl,
      };
    }
    case 'openai': {
      const settings = config.settings as OpenAIProviderSettings;
      return {
        openaiApiKey: settings.apiKey,
        openaiBaseUrl: settings.baseUrl,
        openaiOrgId: settings.organizationId,
      };
    }
    default:
      return {};
  }
}

// Helper function to get provider-specific model options
export function getProviderModels(type: ProviderType, settings?: OpenAIProviderSettings | OpenRouterProviderSettings): string[] {
  const baseUrl = settings?.baseUrl;
  const openRouterModels = [
    'openai/gpt-4-turbo-preview',
    'anthropic/claude-3-opus-20240229',
    'anthropic/claude-3-sonnet-20240229',
    'meta-llama/llama-2-70b-chat',
    'google/gemini-pro',
  ];

  const openAIModels = [
    'gpt-4o',           // Most capable
    'gpt-4-turbo',      // Fast, up to date
    'gpt-4o-mini',      // Smaller but fast
    'gpt-4',            // Original GPT-4
    'gpt-3.5-turbo',    // Fast, cost-effective
    'gpt-3.5-turbo-16k' // Larger context
  ];

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
      return openAIModels;
    case 'openrouter':
      return baseUrl ? openRouterModels : openAIModels;  // If OpenRouter base URL, use OpenRouter models
    default:
      return [];
  }
}
