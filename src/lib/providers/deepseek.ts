import { Message } from '../../components/LlmChat/types';
import { ProviderConfig } from '../../components/LlmChat/types/provider';
import { MCPToolDefinition } from '../protocol/types';
import { DeepSeekProtocolTranslator } from '../protocol/deepseek';

export class DeepSeekProvider {
  private readonly config: ProviderConfig;
  private readonly translator: DeepSeekProtocolTranslator;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.translator = new DeepSeekProtocolTranslator();
  }

  async sendMessage(messages: Message[], tools?: MCPToolDefinition[]) {
    const translatedRequest = this.translator.translateRequest({
      messages,
      tools,
      model: this.config.settings.model,
      temperature: 0.7,
      max_tokens: 4096,
    });

    const response = await fetch(this.config.settings.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(translatedRequest)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`DeepSeek API error: ${error.message || response.statusText}`);
    }

    const data = await response.json();
    return this.translator.translateResponse(data);
  }
}