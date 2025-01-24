import { Anthropic } from '@anthropic-ai/sdk';
import type { Message, MessageContent } from '../../types';
import type { ChatProvider } from '../types';
import { Tool } from '@anthropic-ai/sdk/resources/messages/messages';

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';

export class AnthropicProvider implements ChatProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
      maxRetries: 12,
    });
  }

  async sendMessage(
    messages: Message[],
    tools: Tool[],
    systemPrompt?: string,
    onText?: (text: string) => void,
    onError?: (error: Error) => void,
    onCompletion?: (response: Message) => void,
    shouldCancel?: { current: boolean }
  ): Promise<void> {
    try {
      const systemContent = systemPrompt?.trim() ? [{ type: 'text', text: systemPrompt }] : undefined;
      const stream = await this.client.messages.stream({
        model: DEFAULT_MODEL,
        max_tokens: 8192,
        messages: messages,
        system: systemContent,
        ...(tools.length > 0 && { tools }),
      });

      const textContent: MessageContent = {
        type: 'text',
        text: '',
      };

      const currentStreamMessage: Message = {
        role: 'assistant',
        content: [textContent],
        timestamp: new Date(),
      };

      stream.on('text', (text) => {
        textContent.text += text;
        if (onText) onText(textContent.text);
      });

      const finalResponse = await stream.finalMessage();
      if (onCompletion) onCompletion(finalResponse);

    } catch (error) {
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