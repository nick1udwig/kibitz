import { Anthropic } from '@anthropic-ai/sdk';
import { Tool, TextBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';
import type { MessageCreateParams } from '@anthropic-ai/sdk/resources/messages/messages';
import type { Message, MessageContent } from '../components/LlmChat/types';

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';

interface AnthropicConfig {
  apiKey: string;
  model?: string;
  systemPrompt?: string;
}

interface StreamResponse {
  // For cancellation
  abort: () => void;
  // For checking final message
  finalMessage: () => Promise<{ content: MessageContent[] }>;
  // For streaming text
  on: (event: 'text', callback: (text: string) => void) => void;
}

export const createAnthropicClient = (config: AnthropicConfig) => {
  const client = new Anthropic({
    apiKey: config.apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 12,
  });

  return {
    generateChatTitle: async (userMessage: MessageContent[], assistantMessage: MessageContent[]): Promise<string> => {
      const summaryResponse = await client.messages.create({
        model: config.model || DEFAULT_MODEL,
        max_tokens: 20,
        messages: [{
          role: "user",
          content: `Generate a concise, specific title (3-4 words max) that accurately captures the main topic or purpose of this conversation. Use key technical terms when relevant. Avoid generic words like 'conversation', 'chat', or 'help'.

User message: ${JSON.stringify(userMessage)}
Assistant response: ${Array.isArray(assistantMessage)
  ? assistantMessage.filter(c => c.type === 'text').map(c => c.type === 'text' ? c.text : '').join(' ')
  : assistantMessage}

Format: Only output the title, no quotes or explanation
Example good titles:
- React Router Setup
- Python Script Optimization
- Database Schema Design
- ML Model Training
- Docker Container Networking`
        }]
      });

      const type = summaryResponse.content[0].type;
      if (type == 'text') {
        return summaryResponse.content[0].text
          .replace(/["']/g, '')
          .replace('title:', '')
          .replace('Title:', '')
          .replace('title', '')
          .replace('Title', '')
          .trim();
      }
      return '';
    },

    streamChat: async (
      messages: Message[],
      tools: Tool[] = [],
      onText?: (text: string) => void
    ): Promise<StreamResponse> => {
      // Helper function to handle stream with retries
      const streamWithRetry = async (params: MessageCreateParams) => {
        let lastError: unknown;
        for (let attempt = 0; attempt < 12; attempt++) { // Try for 1 minute (12 * 5 seconds)
          try {
            const stream = await client.messages.stream(params);
            return stream;
          } catch (error) {
            lastError = error;
            // Check if error has overloaded_error type
            if (typeof error === 'object' && error !== null) {
              const errorObj = error as { error?: { type?: string }; status?: number };
              const isOverloaded = errorObj.error?.type === 'overloaded_error' || errorObj.status === 429;
              if (isOverloaded && attempt < 11) { // Don't wait on last attempt
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                continue;
              }
            }
            throw error; // Throw non-overloaded errors immediately
          }
        }
        throw lastError; // Throw last error if all retries failed
      };

      // Only include system content if there is a non-empty system prompt
      const systemPrompt = config.systemPrompt?.trim();
      const systemPromptContent = systemPrompt ? [
        {
          type: "text",
          text: systemPrompt,
        },
      ] as TextBlockParam[] : undefined;

      const params: MessageCreateParams = {
        model: config.model || DEFAULT_MODEL,
        max_tokens: 8192,
        messages,
        ...(systemPromptContent && systemPromptContent.length > 0 && {
          system: systemPromptContent
        }),
        ...(tools.length > 0 && {
          tools
        })
      };

      const stream = await streamWithRetry(params);

      if (onText) {
        stream.on('text', onText);
      }

      return stream;
    },

    // Process message content to handle empty/whitespace blocks
    processMessageContent: (content: MessageContent[]): MessageContent[] => {
      // If it's a single text content that's empty, mark as 'empty'
      if (content.length === 1 && content[0].type === 'text' && !content[0].text.trim()) {
        return [{
          ...content[0],
          text: 'empty'
        }];
      }

      // Otherwise filter out empty text blocks and keep non-text content as is
      return content.filter(block => {
        if (block.type !== 'text') {
          return true;
        }
        return block.text.trim().length > 0;
      });
    },

    // Check if an error is a rate limit/overload error
    isOverloadedError: (error: unknown): boolean => {
      if (typeof error === 'object' && error !== null) {
        const errorObj = error as { error?: { type?: string }; status?: number };
        return errorObj.error?.type === 'overloaded_error' || errorObj.status === 429;
      }
      return false;
    }
  };
};
