export type LegacyProviderType = 'anthropic' | 'openrouter' | 'openai';

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
        baseUrl: settings.openRouterBaseUrl || 'https://openrouter.ai/api/v1',
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
    case 'openrouter':
      return {
        openRouterApiKey: config.settings.apiKey,
        openRouterBaseUrl: config.settings.baseUrl,
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
        'claude-3-7-sonnet-20250219',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
      ];
    case 'openai':
      return [
        'gpt-4-turbo',
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4',
      ];
    case 'openrouter':
      return [
        'deepseek/deepseek-r1',
        'anthropic/claude-3.5-sonnet',
        'google/gemini-2.0-flash-thinking-exp:free',
        'google/gemini-2.0-flash-exp:free',
        'openai/o1',
        'openai/o1-preview',
        'openai/gpt-4-turbo',
      ];
    default:
      return [];
  }
}
