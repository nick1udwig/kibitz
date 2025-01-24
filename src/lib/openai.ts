import OpenAI from 'openai';
import { Message } from '@/components/LlmChat/types';
import { Tool } from '@anthropic-ai/sdk/resources/messages/messages';

interface OpenAIClientConfig {
  apiKey: string;
  baseUrl?: string;
  organizationId?: string;
}

export class OpenAIWrapper {
  private client: OpenAI;

  constructor(config: OpenAIClientConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      organization: config.organizationId,
      dangerouslyAllowBrowser: true
    });
  }

  async streamMessages(params: {
    model: string;
    messages: Message[];
    tools?: Tool[];
    systemPrompt?: string;
    response_format?: {
      type: string;
      json_schema?: Record<string, unknown>;
    };
  }) {
    // Convert messages to OpenAI format
    // Add system message first if provided
    const openaiMessages: OpenAI.Chat.Completions.CreateChatCompletionRequestMessage[] = [];

    if (params.systemPrompt) {
      openaiMessages.push({
        role: 'system',
        content: params.systemPrompt
      });
    }

    // Convert remaining messages
    for (const msg of params.messages) {
      if (msg.role === 'system' || msg.role === 'developer') {
        openaiMessages.push({
          role: 'system',
          content: typeof msg.content === 'string' ? msg.content :
            (msg.content[0]?.type === 'text' ? msg.content[0].text : '')
        });
        continue;
      }

      if (msg.role === 'function') {
        openaiMessages.push({
          role: 'function',
          name: msg.toolInput?.name as string || 'unknown',
          content: typeof msg.content === 'string' ? msg.content :
            msg.content.map(c => c.type === 'text' ? c.text : '').filter(Boolean).join('\n')
        });
        continue;
      }

      if (Array.isArray(msg.content)) {
        // OpenAI requires array content only for user messages with images
        if (msg.role === 'user') {
          const contentWithImages = msg.content.map(item => {
            if (item.type === 'image') {
              return {
                type: 'image_url' as const,
                image_url: {
                  url: `data:${item.source.media_type};base64,${item.source.data}`
                }
              };
            }
            return {
              type: 'text' as const,
              text: item.type === 'text' ? item.text : ''
            };
          });

          openaiMessages.push({
            role: 'user',
            content: contentWithImages
          });
        } else {
          // For assistant messages, join text content
          const textContent = msg.content
            .filter(item => item.type === 'text')
            .map(item => item.type === 'text' ? item.text : '')
            .join('\n');

          openaiMessages.push({
            role: 'assistant',
            content: textContent || ''
          });
        }
        continue;
      }

      // Plain text content
      if (msg.role === 'user') {
        openaiMessages.push({
          role: 'user' as const,
          content: msg.content
        });
      } else {
        openaiMessages.push({
          role: 'assistant' as const,
          content: msg.content
        });
      }
    }

    // Create completion with tools and response format if provided
    const completion = await this.client.chat.completions.create({
      model: params.model,
      messages: openaiMessages,
      ...(params.tools && {
        tools: params.tools.map(tool => ({
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema
          }
        }))
      }),
      ...(params.response_format && { response_format: params.response_format }),
      temperature: 0.7,
      stream: true
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming);

    // Return completion with transformed response
    return {
      async *content() {
        try {
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              yield content;
            }
          }
        } catch (err) {
          console.error('Stream error:', err);
          throw err;
        }
      },

      async finalMessage() {
        try {
          let functionCall: { name?: string; arguments?: string } | null = null;
          let content = '';

          // Collect all chunks
          for await (const chunk of completion) {
            if (chunk.choices[0]?.delta?.function_call) {
              const delta = chunk.choices[0].delta.function_call;
              if (!functionCall) functionCall = { name: '', arguments: '' };
              if (delta.name) functionCall.name = delta.name;
              if (delta.arguments) functionCall.arguments = (functionCall.arguments || '') + delta.arguments;
            } else if (chunk.choices[0]?.delta?.content) {
              content += chunk.choices[0].delta.content;
            }
          }

          // Handle function calls
          if (functionCall?.name) {
            return {
              role: 'assistant',
              content: [{
                type: 'tool_use',
                name: functionCall.name,
                input: JSON.parse(functionCall.arguments || '{}'),
                id: Math.random().toString(36).substr(2, 9),
              }]
            };
          }

          // Handle JSON response format
          if (params.response_format?.type === 'json_object' && content) {
            try {
              JSON.parse(content);
              return {
                role: 'assistant',
                content: [{ type: 'text', text: content }]
              };
            } catch {
              throw new Error('Invalid JSON response from model');
            }
          }

          // Handle normal text responses
          return {
            role: 'assistant',
            content: [{
              type: 'text',
              text: content
            }]
          };
        } catch (error) {
          console.error('Error in finalMessage:', error);
          throw error;
        }
      }
    };
  }
}
