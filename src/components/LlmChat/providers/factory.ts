import { ProviderConfig } from '../types/provider';
import { ProviderFactory, ChatProvider } from './types';
import { AnthropicProvider } from './anthropic';

export class ChatProviderFactory implements ProviderFactory {
  createProvider(config: ProviderConfig): ChatProvider {
    switch (config.type) {
      case 'anthropic':
        return new AnthropicProvider(config.settings.apiKey);
      case 'openai':
      case 'openrouter':
        throw new Error(`Provider ${config.type} not yet implemented`);
      default:
        throw new Error(`Unknown provider type: ${config.type}`);
    }
  }

  getDefaultModel(type: string): string {
    switch (type) {
      case 'anthropic':
        return 'claude-3-5-sonnet-20241022';
      case 'openai':
        return 'gpt-4-turbo';
      case 'openrouter':
        return 'openai/gpt-4-turbo-preview';
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }

  validateConfig(config: ProviderConfig): void {
    switch (config.type) {
      case 'anthropic':
        if (!config.settings.apiKey) {
          throw new Error('Anthropic API key is required');
        }
        break;
      case 'openai':
      case 'openrouter':
        throw new Error(`Provider ${config.type} not yet implemented`);
      default:
        throw new Error(`Unknown provider type: ${config.type}`);
    }
  }
}