export type LegacyProviderType = 'anthropic' | 'openrouter';

export interface ProviderConfig {
  type: string;
  settings: Record<string, string>;
}

export interface LegacyProviderSettings {
  apiKey?: string;  // Legacy field
  anthropicApiKey?: string;
  openRouterApiKey?: string;
  openRouterBaseUrl?: string;
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
    default:
      return {};
  }
}