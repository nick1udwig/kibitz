import type { Message, MessageContent } from '../types';
import type { Tool } from '@anthropic-ai/sdk/resources/messages/messages';
import type { ProviderConfig } from '../types/provider';

export interface ChatProvider {
  sendMessage(
    messages: Message[],
    tools: Tool[],
    systemPrompt?: string,
    onText?: (text: string) => void,
    onError?: (error: Error) => void,
    onCompletion?: (response: Message) => void,
    shouldCancel?: { current: boolean }
  ): Promise<void>;

  generateTitle(
    userFirstMessage: MessageContent | MessageContent[] | string,
    assistantFirstMessage: MessageContent | MessageContent[] | string
  ): Promise<string>;
}

export interface ProviderFactory {
  createProvider(config: ProviderConfig): ChatProvider;
  getDefaultModel(type: string): string;
  validateConfig(config: ProviderConfig): void;
}