import { Anthropic } from '@anthropic-ai/sdk';
import type { Message, MessageContent } from '../../types';
import type { ChatProvider } from '../types';
import { Tool, type MessageCreateParams } from '@anthropic-ai/sdk/resources/messages/messages';

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';

export class AnthropicProvider implements ChatProvider {
  private client: Anthropic;
  private shouldCancel: { current: boolean } | undefined;

  constructor(apiKey: string) {
    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
      maxRetries: 13,
    });
  }

  private filterAndValidateContent(contents: MessageContent[]): MessageContent[] {
    // If there's only one text content and it's whitespace, replace with "empty"
    if (contents.length === 1) {
      const content = contents[0];
      if (content.type === 'text' && content.text.trim().length === 0) {
        return [{
          type: 'text' as const,
          text: 'empty'
        }];
      }
    }

    // Otherwise filter out empty text content and preserve non-text content
    return contents
      .filter(content => {
        if (content.type !== 'text') {
          return true;
        }

        return content.text.trim().length > 0 || content.text === 'empty';
      });
  }

  private async streamWithRetry(params: MessageCreateParams, maxRetries = 12, retryDelay = 5000) {
    let lastError: unknown;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.client.messages.stream(params);
      } catch (error) {
        lastError = error;

        if (typeof error === 'object' && error !== null) {
          const errorObj = error as { error?: { type?: string }; status?: number };
          const isOverloaded = errorObj.error?.type === 'overloaded_error' || errorObj.status === 429;

          if (isOverloaded && attempt < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
        }
        throw error;
      }
    }
    throw lastError;
  }

  private filterToolMessages(messages: Message[]): Pick<Message, 'role' | 'content'>[] {
    return messages.filter((message, index, array) => {
      // Keep non-array content messages
      if (typeof message.content === 'string') return true;

      // Keep messages without tool use
      const hasToolUse = message.content.some(c => c.type === 'tool_use');
      if (!hasToolUse) return true;

      // Look for matching tool_result in next message
      const nextMessage = array[index + 1];
      if (!nextMessage) return false;

      // If next message is string or doesn't exist, can't have tool_result
      if (typeof nextMessage.content === 'string') return false;
      const nextMessageContents = nextMessage.content as MessageContent[];

      // Check that all tool_use messages have matching tool_result
      return message.content.every(content => {
        if (content.type !== 'tool_use') return true;
        if (!('id' in content)) return true;
        const toolId = content.id;
        return nextMessageContents.some(
          nextContent =>
            nextContent.type === 'tool_result' &&
            'tool_use_id' in nextContent &&
            nextContent.tool_use_id === toolId
        );
      });
    });
  }

  private formatMessagesForApi(messages: Pick<Message, 'role' | 'content'>[]): { role: 'user' | 'assistant'; content: MessageContent[] }[] {
    // Add cache control to messages within the recent context (last 3)
    return messages.map((msg, index, array) => {
      const isRecentContext = index >= array.length - 3;

      // For older messages, just pass through without cache control
      if (!isRecentContext) {
        return {
          role: msg.role,
          content: typeof msg.content === 'string' ?
            [{
              type: 'text' as const,
              text: msg.content
            }] :
            msg.content
        };
      }

      // Last messages - add cache control ONLY to the last content block
      const content = typeof msg.content === 'string' ?
        [{
          type: 'text' as const,
          text: msg.content
        }] :
        msg.content;

      // For recent messages, only the last content block gets cache control
      return {
        role: msg.role,
        content: content.map((c, i, arr) => {
          // Only add cache control to the last piece of content
          const shouldAddCache = i === arr.length - 1;

          const withCache = shouldAddCache ?
            { cache_control: { type: 'ephemeral' as const } } : {};

          if (c.type === 'text') {
            return {
              type: 'text' as const,
              text: c.text,
              ...withCache
            } as MessageContent;
          }

          if (c.type === 'tool_use') {
            return {
              type: 'tool_use' as const,
              id: c.id,
              name: c.name,
              input: c.input,
              ...withCache
            } as MessageContent;
          }

          if (c.type === 'tool_result') {
            return {
              type: 'tool_result' as const,
              tool_use_id: c.tool_use_id,
              content: c.content,
              ...(c.is_error && { is_error: c.is_error }),
              ...withCache
            } as MessageContent;
          }

          if (c.type === 'image') {
            return {
              type: 'image' as const,
              source: c.source,
              ...withCache
            } as MessageContent;
          }

          if (c.type === 'document') {
            return {
              type: 'document' as const,
              source: c.source,
              ...withCache
            } as MessageContent;
          }

          // For any other content type, cast to MessageContent type
          const baseContent = c as MessageContent;
          return {
            ...baseContent,
            ...withCache
          } as MessageContent;
        })
      };
    });
  }

  async sendMessage(
    messages: Message[],
    tools: Tool[] = [],  // Ensure tools has a default value
    systemPrompt?: string,
    onText?: (text: string) => void,
    onError?: (error: Error) => void,
    onCompletion?: (response: Message) => void,
    shouldCancel?: { current: boolean }
  ): Promise<void> {
    this.shouldCancel = shouldCancel;

    try {
      // Create system message if provided, with proper cache control
      const systemContent = systemPrompt?.trim()
        ? [{
            type: 'text' as const,
            text: systemPrompt,
            cache_control: { type: 'ephemeral' as const }
          }]
        : undefined;

      // Prepare streamed message structure
      const currentStreamMessage = {
        role: 'assistant' as const,
        content: [{ type: 'text' as const, text: '' }] as MessageContent[],
        timestamp: new Date(),
      };

      // Filter and prepare messages for the API
      const filteredMessages = this.filterToolMessages(messages);
      const apiMessages = this.formatMessagesForApi(filteredMessages);

      // Only the last tool gets cache_control
      const toolsForApi = tools.map((tool, index, array) => ({
        ...tool,
        ...(index === array.length - 1 ? {
          cache_control: { type: 'ephemeral' as const }
        } : {})
      }));

      const streamParams: MessageCreateParams = {
        model: DEFAULT_MODEL,
        max_tokens: 8192,
        messages: apiMessages,
        ...(systemContent?.length && { system: systemContent }),
        ...(tools.length && { tools: toolsForApi }),
      };

      const stream = await this.streamWithRetry(streamParams);

      // Handle text streaming
      stream.on('text', (text) => {
        if (this.shouldCancel?.current) {
          stream.abort();
          return;
        }

        const textContent = currentStreamMessage.content[0];
        if (textContent.type === 'text') {
          textContent.text += text;
          if (onText) onText(textContent.text);
        }
      });

      // Get and process final response
      const finalResponse = await stream.finalMessage();

      // Only process if not cancelled
      if (!this.shouldCancel?.current) {
        // Look for tool use first, before handling completion
        const toolUseContent = finalResponse.content.find((c: MessageContent) => c.type === 'tool_use');

        if (toolUseContent && toolUseContent.type === 'tool_use') {
          // Emit the tool use message so the UI can show it
          const toolUseMessage: Message = {
            role: 'assistant',
            content: [toolUseContent],
            timestamp: new Date()
          };

          if (onCompletion) {
            onCompletion(toolUseMessage);
          }

          // Let ChatView handle tool execution and wait for next message
          return;
        }

        // No tool use - filter and validate content
        const processedContent = this.filterAndValidateContent(finalResponse.content);
        const processedResponse = {
          ...finalResponse,
          content: processedContent,
        };

        // Send final response
        if (onCompletion) {
          onCompletion(processedResponse);
        }
      }

    } catch (error) {
      if (error && typeof error === 'object' && 'message' in error && error.message === 'Request was aborted.') {
        console.log('Request was cancelled by user');
      } else if (typeof error === 'object' && error !== null) {
        const errorObj = error as { error?: { type?: string }; status?: number };
        const isOverloaded = errorObj.error?.type === 'overloaded_error' || errorObj.status === 429;

        if (isOverloaded) {
          console.error('Server overloaded, all retries failed:', error);
        }
      }

      if (onError) onError(error as Error);
      throw error;
    }
  }

  async generateTitle(
    userFirstMessage: MessageContent | MessageContent[] | string,
    assistantFirstMessage: MessageContent | MessageContent[] | string
  ): Promise<string> {
    const response = await this.client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 20,
      messages: [{
        role: "user",
        content: `Generate a concise, specific title (3-4 words max) that accurately captures the main topic or purpose of this conversation. Use key technical terms when relevant. Avoid generic words like 'conversation', 'chat', or 'help'.

User message: ${JSON.stringify(userFirstMessage)}
Assistant response: ${Array.isArray(assistantFirstMessage)
  ? assistantFirstMessage.filter(c => c.type === 'text').map(c => c.type === 'text' ? c.text : '').join(' ')
  : assistantFirstMessage}

Format: Only output the title, no quotes or explanation
Example good titles:
- React Router Setup
- Python Script Optimization
- Database Schema Design
- ML Model Training
- Docker Container Networking`
      }]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return content.text
        .replace(/["']/g, '')
        .replace(/^(title:|Title:)/i, '')
        .trim();
    }
    return '(New Chat)';
  }
}
