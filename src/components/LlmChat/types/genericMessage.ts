import { MessageContent } from '../types';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
  ChatCompletionUserMessageParam,
  ChatCompletionAssistantMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionContentPart,
} from 'openai/resources/chat/completions';
import type { Tool as AnthropicToolType } from '@anthropic-ai/sdk/resources/messages/messages';
import { Tool } from './toolTypes'; // This is your local Tool definition
import { Message } from '../types'; // Assuming Message type is in '../types'


// Generic message interface with all supported roles
export interface GenericMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | MessageContent[];
  name?: string; // For tool calls (OpenAI 'name' for function, or tool_call_id for tool role)
                 // For Anthropic, this can map to toolInput or be part of tool_result
}

// Function to sanitize function names for OpenAI compatibility
export function sanitizeFunctionName(name: string): string {
  // OpenAI function names must be a-z, A-Z, 0-9, or contain underscores and dashes, with a maximum length of 64.
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64);
}

function anthropicToolToOpenAIFunction(tool: Tool | AnthropicToolType): ChatCompletionTool {
  let description = tool.description || '';
  if (description.length > 1024) {
    console.warn(`Tool description for '${tool.name}' is too long (${description.length} characters). Truncating to 1024 characters.`);
    description = description.substring(0, 1021) + '...';
  }

  const properties: Record<string, { type: string; description?: string; enum?: string[] }> =
    tool.input_schema?.properties ?? Object.create(null);

  const required = (tool.input_schema?.required ?? []) as string[];

  return {
    type: 'function',
    function: {
      name: sanitizeFunctionName(tool.name), // Ensure name is sanitized
      description: description,
      parameters: {
        type: 'object',
        properties,
        required,
      }
    }
  };
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | MessageContent[]; // Anthropic's content can be string or array of blocks
}

interface AnthropicPayload {
  messages: AnthropicMessage[];
  system?: string;
}

export function toAnthropicFormat(messages: GenericMessage[], systemPrompt?: string): AnthropicPayload {
  const anthropicMessages: AnthropicMessage[] = [];
  let effectiveSystemPrompt = systemPrompt;

  for (const msg of messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string') {
        effectiveSystemPrompt = (effectiveSystemPrompt ? effectiveSystemPrompt + "\n" : "") + msg.content;
      } else if (Array.isArray(msg.content)) {
        const textContent = msg.content.find(c => c.type === 'text');
        if (textContent && 'text' in textContent) {
          effectiveSystemPrompt = (effectiveSystemPrompt ? effectiveSystemPrompt + "\n" : "") + textContent.text;
        }
      }
    } else {
      // Convert 'tool' role messages to 'user' role for Anthropic,
      // ensuring the content is in the expected format (array of blocks).
      if (msg.role === 'tool') {
        const toolResultContent = Array.isArray(msg.content)
          ? msg.content.find(c => c.type === 'tool_result') as Extract<MessageContent, { type: 'tool_result' }> | undefined
          : undefined; // if msg.content is string, it's not a tool_result

        if (toolResultContent) {
            anthropicMessages.push({
                role: 'user', // Tool results are sent as user messages to Anthropic
                content: [ // Ensure content is an array for tool_result
                    {
                        type: 'tool_result',
                        tool_use_id: toolResultContent.tool_use_id,
                        content: toolResultContent.content,
                        is_error: toolResultContent.is_error,
                    }
                ]
            });
        } else if (typeof msg.content === 'string'){
             anthropicMessages.push({
                role: 'user', // Fallback for simple string tool results if any
                content: msg.content
             });
        }
      } else {
        anthropicMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content, // Already MessageContent[] or string
        });
      }
    }
  }

  const anthropicPayload: AnthropicPayload = { messages: anthropicMessages };
  if (effectiveSystemPrompt && effectiveSystemPrompt.trim() !== '') {
    anthropicPayload.system = effectiveSystemPrompt;
  }
  return anthropicPayload;
}


interface OpenAIPayload {
  messages: Array<ChatCompletionMessageParam>;
  tools?: ChatCompletionTool[];
  tool_choice?: 'auto' | 'none' | ChatCompletionToolChoiceOption; // Updated type
}
// Defining ChatCompletionToolChoiceOption for clarity, based on OpenAI's types
interface ChatCompletionToolChoiceOption {
  type: "function";
  function: {
    name: string;
  };
}


export function toOpenAIFormat(
  messages: GenericMessage[],
  tools?: Array<Tool | AnthropicToolType>,
  systemPrompt?: string
): OpenAIPayload {
  const openaiMessages: OpenAIMessageParam[] = [];

  if (systemPrompt && systemPrompt.trim() !== '') {
    openaiMessages.push({
      role: 'system',
      content: systemPrompt,
    } as ChatCompletionSystemMessageParam);
  }

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Only add if no explicit systemPrompt was passed and content is valid
      if (!systemPrompt) {
        if (typeof msg.content === 'string' && msg.content.trim() !== '') {
          openaiMessages.push({ role: 'system', content: msg.content } as ChatCompletionSystemMessageParam);
        } else if (Array.isArray(msg.content)) {
          const textContent = msg.content.find(c => c.type === 'text');
          if (textContent && 'text' in textContent && textContent.text.trim() !== '') {
            openaiMessages.push({ role: 'system', content: textContent.text } as ChatCompletionSystemMessageParam);
          }
        }
      }
      continue; // System messages handled, move to next message
    }

    if (Array.isArray(msg.content)) {
      // Handle multimodal content for OpenAI (text, image_url)
      // And tool_calls / tool_result
      const contentParts: ChatCompletionContentPart[] = [];
      const toolCalls: ChatCompletionMessageParam.ChatCompletionAssistantToolCall[] = [];
      let toolCallIdForToolRole: string | undefined = undefined;
      let toolContentForToolRole: string | undefined = undefined;

      for (const part of msg.content) {
        if (part.type === 'text') {
          contentParts.push({ type: 'text', text: part.text });
        } else if (part.type === 'image') {
          contentParts.push({
            type: 'image_url',
            image_url: {
              url: `data:${part.source.media_type};base64,${part.source.data}`,
              // detail: "auto" // Or "low", "high" - OpenAI default is "auto"
            },
          });
        } else if (part.type === 'tool_use') {
           toolCalls.push({
            id: part.id,
            type: 'function',
            function: {
              name: sanitizeFunctionName(part.name), // Sanitize for OpenAI
              arguments: JSON.stringify(part.input),
            },
          });
        } else if (part.type === 'tool_result') {
            toolCallIdForToolRole = part.tool_use_id;
            toolContentForToolRole = typeof part.content === 'string' ? part.content : JSON.stringify(part.content);
            // If multiple tool results in one message, OpenAI expects separate tool messages.
            // This simplified version takes the first one if msg.role is 'tool'.
            // Complex scenarios might need restructuring messages earlier.
        }
      }

      if (msg.role === 'tool') {
        if (toolCallIdForToolRole && toolContentForToolRole !== undefined) {
          openaiMessages.push({
            role: 'tool',
            tool_call_id: toolCallIdForToolRole,
            content: toolContentForToolRole,
          } as ChatCompletionToolMessageParam);
        }
      } else if (msg.role === 'assistant' && toolCalls.length > 0) {
        openaiMessages.push({
          role: 'assistant',
          content: contentParts.length > 0 ? (contentParts.find(p => p.type === 'text') as Extract<ChatCompletionContentPart, {type: 'text'}>)?.text || null : null, // Text content if any, else null
          tool_calls: toolCalls,
        } as ChatCompletionAssistantMessageParam);
      } else if (contentParts.length > 0) { // User message or assistant text-only message
        openaiMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: contentParts.map(p => {
            if (p.type === 'text') return p.text;
            if (p.type === 'image_url') return p; // Pass image_url objects directly
            return ''; // Should not happen with current types
          }).filter(p => (typeof p === 'string' && p !== '') || typeof p === 'object').length === 1 && typeof contentParts[0].text === 'string'
          ? contentParts[0].text // If only one text part, send as string
          : contentParts as any, // Send as array of content parts for multimodal
        } as ChatCompletionUserMessageParam | ChatCompletionAssistantMessageParam);
      }

    } else { // Simple string content
      if (msg.role === 'tool') { // This case should ideally be structured content
        openaiMessages.push({
          role: 'tool',
          tool_call_id: msg.name || `unknown_tool_call_${Date.now()}`, // msg.name here refers to tool_call_id
          content: msg.content,
        } as ChatCompletionToolMessageParam);
      } else {
        openaiMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content as string,
          // name: msg.name, // 'name' for user/assistant is not standard for text messages, used for function role
        } as ChatCompletionUserMessageParam | ChatCompletionAssistantMessageParam);
      }
    }
  }

  const openaiPayload: OpenAIPayload = { messages: openaiMessages };

  if (tools && tools.length > 0) {
    openaiPayload.tools = tools.map(anthropicToolToOpenAIFunction);
    openaiPayload.tool_choice = 'auto';
  }

  return openaiPayload;
}


export function messageToGenericMessage(message: Message): GenericMessage {
  // The 'name' field in GenericMessage can be used for tool_call_id when role is 'tool',
  // or for the function name if OpenAI's old function calling was being mapped.
  // For Anthropic tool_result, the tool_use_id is inside the content.
  // For Anthropic tool_use, the name is inside the content.
  // This function primarily ensures role and content structure.
  return {
    role: message.role as 'user' | 'assistant', // System/tool roles are handled during conversion to specific formats
    content: message.content,
    // `name` is not directly mapped here from `message.toolInput` as its usage varies.
    // `toOpenAIFormat` and `toAnthropicFormat` handle specific role/name needs.
  };
}

export function genericMessageToMessage(genericMessage: GenericMessage): Message {
  // This is a simplified conversion back. Tool-specific details (like tool_use_id or is_error for tool_result)
  // would need to be preserved if this function were used to reconstruct full-fidelity internal messages
  // after an LLM call. Currently, the app updates its internal `Message[]` store directly during the LLM call.
  return {
    role: genericMessage.role as 'user' | 'assistant', // Can be 'tool' if converting from OpenAI tool result
    content: genericMessage.content,
    timestamp: new Date(),
    // toolInput might be derived from genericMessage.name if it represents a tool_call_id for a tool result,
    // or from content if it's a tool_use block. This depends on how GenericMessage is populated.
  };
}
