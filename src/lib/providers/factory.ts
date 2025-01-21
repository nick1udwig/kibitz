import { ProviderConfig } from '../../components/LlmChat/types/provider';
import { DeepSeekProvider } from './deepseek';

import { ProviderConfig } from '../../components/LlmChat/types/provider';
import { DeepSeekProvider } from './deepseek';
import EventEmitter from 'events';

export interface LLMProvider extends EventEmitter {
  sendMessage: DeepSeekProvider['sendMessage'];
  sendStreamingMessage: DeepSeekProvider['sendStreamingMessage'];
}

export function createProvider(config: ProviderConfig): LLMProvider {
  // Validate config
  if (!config.settings.apiKey) {
    throw new Error(`API key required for ${config.type} provider`);
  }

  // Make sure we have the right model for the provider
  const models = getProviderModels(config.type);
  if (!models.includes(config.settings.model)) {
    console.warn(`Invalid model ${config.settings.model} for ${config.type}, using default: ${models[0]}`);
    config.settings.model = models[0];
  }

  console.log('🏭 Creating provider:', {
    type: config.type,
    hasApiKey: !!config.settings.apiKey,
    model: config.settings.model
  });
  
  switch (config.type) {
    case 'deepseek':
      return new DeepSeekProvider(config);
    case 'anthropic':
      // Use existing Anthropic implementation
      throw new Error('Anthropic provider not yet migrated to new system');
    case 'openai':
      throw new Error('OpenAI provider not yet implemented');
    case 'openrouter':
      throw new Error('OpenRouter provider not yet implemented');
    default:
      throw new Error(`Unsupported provider type: ${config.type}`);
  }
}