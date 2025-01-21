export type LegacyProviderType = 'anthropic' | 'openrouter' | 'openai' | 'deepseek';

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
  deepseekApiKey?: string;
  deepseekBaseUrl?: string;
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
      }
    };
  } else if (provider === 'deepseek') {
    return {
      type: 'deepseek',
      settings: {
        apiKey: settings.deepseekApiKey || '',
        baseUrl: settings.deepseekBaseUrl || 'https://api.deepseek.com/v1',
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
    case 'deepseek':
      return {
        deepseekApiKey: config.settings.apiKey,
        deepseekBaseUrl: config.settings.baseUrl,
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
    case 'deepseek':
      return [
        'deepseek-reasoner',  // Most capable for general use
        'deepseek-chat',
        'deepseek-coder'
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
    case 'openrouter':
      return [
        'openai/gpt-4-turbo-preview',
        'anthropic/claude-3-opus-20240229',
        'anthropic/claude-3-sonnet-20240229',
        'meta-llama/llama-2-70b-chat',
        'google/gemini-pro',
      ];
    default:
      return [];
  }
}