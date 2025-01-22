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

  async streamResponse(response: Response): Promise<any> {
    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const stream = new EventEmitter();
    
    // Start reading the stream
    (async () => {
      try {
        console.log('📡 DeepSeek stream started');
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('✅ DeepSeek stream complete');
            stream.emit('end');
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
              stream.emit('end');
              return;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                throw new Error(`DeepSeek API error: ${JSON.stringify(parsed.error)}`);
              }
              
            // Removed chunk logging

              if (parsed.choices?.[0]?.delta?.content) {
                stream.emit('text', parsed.choices[0].delta.content);
              }
            } catch (e) {
              console.warn('⚠️ Failed to parse DeepSeek chunk:', e);
              stream.emit('error', e);
            }
          }
        }
      } catch (error) {
        console.error('❌ DeepSeek streaming error:', error);
        stream.emit('error', error);
      }
    })();

    return {
      on: (event: string, handler: (...args: any[]) => void) => {
        stream.on(event, handler);
        return stream;
      },
      removeAllListeners: () => {
        stream.removeAllListeners();
        return stream;
      },
      finalMessage: async () => {
        return new Promise((resolve) => {
          let finalContent = '';
          stream.on('text', (text) => {
            finalContent += text;
          });
          stream.on('end', () => {
            resolve({
              choices: [{
                message: {
                  role: 'assistant',
                  content: finalContent
                }
              }],
              content: [{
                type: 'text',
                text: finalContent
              }]
            });
          });
        });
      }
    };
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

    const requestBody = JSON.stringify(translatedRequest);
    console.log('🔍 DeepSeek request body:', requestBody);

    const response = await fetch(this.getEndpoint(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: requestBody
    });

    if (!response.ok) {
      console.error('❌ DeepSeek API error:', response.status, response.statusText);
      // Clone the response before reading it
      const responseClone = response.clone();
      let errorMessage = response.statusText;
      try {
        const errorData = await responseClone.json();
        errorMessage = errorData.error?.message || JSON.stringify(errorData);
        console.error('DeepSeek detailed error:', errorMessage);
        console.error('DeepSeek request that failed:', requestBody);
      } catch (e) {
        const errorText = await response.text();
        errorMessage = errorText || response.statusText;
      }
      throw new Error(`DeepSeek API error: ${errorMessage}`);
    }

    if (opts.stream) {
      return this.streamResponse(response);
    } else {
      const data = await response.json();
      return this.translator.translateResponse(data);
    }
  }

  async sendStreamingMessage(messages: Message[], tools?: MCPToolDefinition[], options: ChatOptions = {}) {
    return this.sendMessage(messages, tools, { ...options, stream: true });
  }
}