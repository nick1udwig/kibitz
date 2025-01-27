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
    openaiMessages.push({
      role: msg.role, // OpenAI uses the same role names: "system", "user", "assistant"
      content: msg.content, // Assuming content is directly compatible or will be stringified
      // name: msg.name, // OpenAI function calls might use 'name', but we're not handling functions yet
    });
  }
  return { messages: openaiMessages }; // OpenAI expects messages to be within a 'messages' array in the request body
}

import { Message } from '../types'; // Assuming Message type is in '../types'

export function messageToGenericMessage(message: Message): GenericMessage {
  return {
    role: message.role as 'user' | 'assistant' | 'system', // Ensure correct role type
    content: message.content, // Directly copy content - it can be string or MessageContent[]
    name: message.toolInput, // Map toolInput to name if it's relevant for generic format
  };
}

export function genericMessageToMessage(genericMessage: GenericMessage): Message {
  return {
    role: genericMessage.role,
    content: genericMessage.content,
    timestamp: new Date(), // You might want to preserve the original timestamp if available in GenericMessage later
    // ... any other properties in your Message type that need to be mapped or defaulted
  };
} 