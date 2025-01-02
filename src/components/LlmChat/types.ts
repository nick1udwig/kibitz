export type MessageContent = {
  type: 'text';
  text: string;
} | {
  type: 'tool_use';
  id: string;
  name: string;
  input: any;
} | {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
};

export type Message = {
  role: 'user' | 'assistant';
  content: string | MessageContent[];
  timestamp: Date;
};

export type ConversationSettings = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  tools: Tool[];
  mcpServers: McpServer[];
};

export type Conversation = {
  id: string;
  name: string;
  messages: Message[];
  settings: ConversationSettings;
};

export type Tool = {
  name: string;
  description: string;
  schema: object;
};
