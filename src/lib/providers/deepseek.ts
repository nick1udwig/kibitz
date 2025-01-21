import EventEmitter from 'events';
import { Message } from '../../components/LlmChat/types';
import { ProviderConfig, getProviderModels } from '../../components/LlmChat/types/provider';
import { MCPToolDefinition } from '../protocol/types';
import { DeepSeekProtocolTranslator } from '../protocol/deepseek';

interface ChatOptions {
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export class DeepSeekProvider extends EventEmitter {
  private readonly config: ProviderConfig;
  private readonly translator: DeepSeekProtocolTranslator;
  private readonly defaultOptions: ChatOptions = {
    stream: true,
    temperature: 0.7,
    maxTokens: 4096,
  };

  constructor(config: ProviderConfig) {
    super();
    
    // Validate and ensure we have required settings
    if (!config.settings.apiKey) {
      throw new Error('DeepSeek API key is required');
    }

    // Validate and set model
    config.settings.model = this.validateModel(config.settings.model);
    
    this.config = config;
    this.translator = new DeepSeekProtocolTranslator();
    console.log('🔧 DeepSeek provider initialized with model:', config.settings.model);
  }

  private validateModel(model: string): string {
    const validModels = getProviderModels('deepseek');
    if (!model || !validModels.includes(model)) {
      console.warn(`Invalid DeepSeek model: ${model}, falling back to ${validModels[0]}`);
      return validModels[0];
    }
    return model;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.settings.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  private getEndpoint(): string {
    return (this.config.settings.baseUrl || 'https://api.deepseek.com') + '/v1/chat/completions';
  }

  async streamResponse(response: Response): Promise<void> {
    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      console.log('📡 DeepSeek stream started');
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('✅ DeepSeek stream complete');
          this.emit('done');
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6);
          if (data === '[DONE]') {
            this.emit('done');
            return;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              throw new Error(`DeepSeek API error: ${JSON.stringify(parsed.error)}`);
            }
            // No need to translate since DeepSeek follows OpenAI format
            console.log('📩 DeepSeek chunk:', {
              hasContent: !!parsed.choices?.[0]?.delta?.content,
              hasFunctionCall: !!parsed.choices?.[0]?.delta?.function_call
            });
            this.emit('text', parsed.choices?.[0]?.delta?.content || '');
          } catch (e) {
            console.warn('⚠️ Failed to parse DeepSeek chunk:', e);
            throw e;
          }
        }
      }
    } catch (error) {
      console.error('❌ DeepSeek streaming error:', error);
      this.emit('error', error);
      throw error;
    }
  }

  async sendMessage(messages: Message[], tools?: MCPToolDefinition[], options: ChatOptions = {}) {
    console.log('📤 DeepSeek sending message:', {
      messageCount: messages.length,
      hasTools: !!tools,
      toolCount: tools?.length,
      options
    });
    
    const opts = { ...this.defaultOptions, ...options };
    
    const translatedRequest = this.translator.translateRequest({
      messages,
      tools,
      model: this.config.settings.model,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      stream: opts.stream,
    });

    console.log('🔄 DeepSeek request:', {
      model: translatedRequest.model,
      stream: translatedRequest.stream,
      hasFunctions: !!translatedRequest.functions
    });

    const response = await fetch(this.getEndpoint(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(translatedRequest)
    });

    if (!response.ok) {
      console.error('❌ DeepSeek API error:', response.status, response.statusText);
      const errorText = await response.text();
      throw new Error(`DeepSeek API error: ${errorText || response.statusText}`);
    }

    if (opts.stream) {
      await this.streamResponse(response);
      return null;
    } else {
      const data = await response.json();
      return this.translator.translateResponse(data);
    }
  }

  async sendStreamingMessage(messages: Message[], tools?: MCPToolDefinition[], options: ChatOptions = {}) {
    return this.sendMessage(messages, tools, { ...options, stream: true });
  }
}