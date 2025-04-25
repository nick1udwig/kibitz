// Type declarations for Anthropic SDK event types

import { CacheControlEphemeral } from '@anthropic-ai/sdk/resources/messages/messages';

declare module '@anthropic-ai/sdk' {
  interface MessageStreamEvents {
    'text': string;
    'message_start': any;
    'message_delta': any;
    'message_stop': any;
    'content_block_start': any;
    'content_block_delta': any;
    'content_block_stop': any;
    'content_block': any;
    'error': Error;
    'ping': any;
  }

  interface ThinkingDelta {
    type: 'thinking_delta';
    thinking_delta: string;
    index: number;
  }

  interface SignatureDelta {
    type: 'signature_delta';
    signature_delta: string;
    index: number;
  }

  interface TextDelta {
    type: 'text_delta';
    text_delta: string;
    index: number;
  }

  type ContentBlockDelta = ThinkingDelta | SignatureDelta | TextDelta;

  interface ThinkingBlock {
    type: 'thinking';
    thinking: string;
    signature: string;
  }

  interface RedactedThinkingBlock {
    type: 'redacted_thinking';
    data: string;
  }

  interface TextBlock {
    type: 'text';
    text: string;
    cache_control?: CacheControlEphemeral | null;
  }

  interface ToolUseBlock {
    type: 'tool_use';
    id: string;
    name: string;
    input: unknown;
    cache_control?: CacheControlEphemeral | null;
  }

  type ContentBlock = ThinkingBlock | RedactedThinkingBlock | TextBlock | ToolUseBlock;
} 