import { ProviderConfig } from '../../components/LlmChat/types/provider';
import { DeepSeekProvider } from './deepseek';

export function createProvider(config: ProviderConfig) {
  switch (config.type) {
    case 'deepseek':
      return new DeepSeekProvider(config);
    // Add other providers as needed
    default:
      throw new Error(`Unsupported provider type: ${config.type}`);
  }
}