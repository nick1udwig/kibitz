export interface GenericMessage {
  role: 'user' | 'assistant' | 'system';
  content: any; // Keep it flexible for now, can be string or MessageContent[]
  name?: string;
}

export function toAnthropicFormat(messages: GenericMessage[], systemPrompt?: string): any {
  const anthropicMessages = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt = msg.content; // Assuming only one system message, or taking the last one
    } else {
      anthropicMessages.push({ role: msg.role, content: msg.content }); // Anthropic also uses 'role' and 'content'
    }
  }

  const anthropicPayload: any = { messages: anthropicMessages };
  if (systemPrompt) {
    anthropicPayload.system = systemPrompt;
  }
  return anthropicPayload;
}

export function toOpenAIFormat(messages: GenericMessage[]): any {
  const openaiMessages = [];
  for (const msg of messages) {
    openaiMessages.push({ role: msg.role, content: msg.content, name: msg.name });
  }
  return openaiMessages;
} 