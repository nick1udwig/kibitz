import type { Message, MessageContent } from '../types';

export interface ChatProvider {
  sendMessage(
    messages: Message[],
    tools: any[],
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