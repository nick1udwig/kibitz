import React, { useEffect, useState, useRef } from 'react';
import { Anthropic } from '@anthropic-ai/sdk';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ReactMarkdown from 'react-markdown';
import { Message, Tool } from './types';
import { Spinner } from '@/components/ui/spinner';
import { ToolCallModal } from './ToolCallModal';
import { useProjects } from './context/ProjectContext';
import { useMcp } from './context/McpContext';

const getUniqueTools = (mcpServers: any[], existingTools: Tool[]) => {
  const toolMap = new Map<string, Tool>();
  existingTools.forEach(tool => toolMap.set(tool.name, tool));
  mcpServers.forEach(server => {
    server.tools?.forEach(tool => {
      if (!toolMap.has(tool.name)) {
        toolMap.set(tool.name, {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema
        });
      }
    });
  });
  return Array.from(toolMap.values());
};

export const ChatView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    activeConversationId,
    updateProjectSettings
  } = useProjects();

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeConversation = activeProject?.conversations.find(
    c => c.id === activeConversationId
  );

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { servers, executeTool } = useMcp();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedToolCall, setSelectedToolCall] = useState<{
    name: string;
    input: any;
    result: string | null;
  } | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages]);

  const updateConversationMessages = (projectId: string, conversationId: string, newMessages: Message[]) => {
    updateProjectSettings(projectId, {
      conversations: activeProject!.conversations.map(conv =>
        conv.id === conversationId
          ? {
              ...conv,
              messages: newMessages,
              lastUpdated: new Date()
            }
          : conv
      )
    });
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !activeProject || !activeConversationId) return;
    if (!activeProject.settings.apiKey) {
      setError('Please set your API key in settings');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const userMessage: Message = {
        role: 'user',
        content: inputMessage,
        timestamp: new Date()
      };

      const currentMessages = [...(activeConversation?.messages || []), userMessage];
      updateConversationMessages(activeProject.id, activeConversationId, currentMessages);
      setInputMessage('');

      const anthropic = new Anthropic({
        apiKey: activeProject.settings.apiKey,
        dangerouslyAllowBrowser: true
      });

      const availableTools = getUniqueTools(servers, activeProject.settings.tools || []);

      let apiMessages = currentMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      while (true) {
        const response = await anthropic.messages.create({
          model: activeProject.settings.model || 'claude-3-5-sonnet-20241022',
          max_tokens: 8192,
          messages: apiMessages,
          ...(activeProject.settings.systemPrompt && {
            system: activeProject.settings.systemPrompt
          }),
          ...(availableTools.length > 0 && { tools: availableTools })
        });

        apiMessages.push({
          role: response.role,
          content: response.content,
        });

        // Process each type of content in the response
        for (const content of response.content) {
          if (content.type === 'text') {
            const assistantMessage: Message = {
              role: 'assistant',
              content: content.text,
              timestamp: new Date()
            };
            currentMessages.push(assistantMessage);
            updateConversationMessages(activeProject.id, activeConversationId, currentMessages);
          }
        }

        // Break if no tool use or if response is complete
        if (!response.content.some(c => c.type === 'tool_use') || response.stop_reason !== 'tool_use') {
          break;
        }

        // Handle tool calls
        for (const content of response.content) {
          if (content.type === 'tool_use') {
            try {
              const serverWithTool = servers.find(s =>
                s.tools?.some(t => t.name === content.name)
              );

              if (!serverWithTool) {
                throw new Error(`No server found for tool ${content.name}`);
              }

              const toolUseMessage: Message = {
                role: 'assistant',
                content: [{
                  type: 'tool_use',
                  id: content.id,
                  name: content.name,
                  input: content.input,
                }],
                timestamp: new Date()
              };

              currentMessages.push(toolUseMessage);
              updateConversationMessages(activeProject.id, activeConversationId, currentMessages);

              const result = await executeTool(
                serverWithTool.id,
                content.name,
                content.input
              );

              const toolResultMessage: Message = {
                role: 'user',
                content: [{
                  type: 'tool_result',
                  tool_use_id: content.id,
                  content: result
                }],
                timestamp: new Date()
              };

              currentMessages.push(toolResultMessage);
              updateConversationMessages(activeProject.id, activeConversationId, currentMessages);

              apiMessages.push({
                role: 'user',
                content: [{
                  type: 'tool_result',
                  tool_use_id: content.id,
                  content: result
                }]
              });

            } catch (error) {
              const errorMessage: Message = {
                role: 'user',
                content: [{
                  type: 'tool_result',
                  tool_use_id: content.id,
                  content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  is_error: true,
                }],
                timestamp: new Date()
              };

              currentMessages.push(errorMessage);
              updateConversationMessages(activeProject.id, activeConversationId, currentMessages);

              apiMessages.push({
                role: 'user',
                content: [{
                  type: 'tool_result',
                  tool_use_id: content.id,
                  content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  is_error: true
                }]
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessage = (message: Message, index: number) => {
    if (Array.isArray(message.content)) {
      return message.content.map((content, contentIndex) => {
        if (content.type === 'tool_use') {
          const nextMessage = activeConversation?.messages[index + 1];
          let toolResult = null;
          if (nextMessage && Array.isArray(nextMessage.content)) {
            const resultContent = nextMessage.content.find(c =>
              c.type === 'tool_result' && c.tool_use_id === content.id
            );
            if (resultContent) {
              toolResult = resultContent.content;
            }
          }

          return (
            <button
              key={`${index}-${contentIndex}`}
              onClick={() => setSelectedToolCall({
                name: content.name,
                input: content.input,
                result: toolResult
              })}
              className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
            >
              Calling tool: {content.name}
            </button>
          );
        }
        return null;
      });
    }

    return (
      <ReactMarkdown className="prose dark:prose-invert max-w-none">
        {message.content}
      </ReactMarkdown>
    );
  };

  if (!activeConversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Select or create a conversation to begin chatting.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {activeConversation.messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                {renderMessage(message, index)}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="flex gap-2 p-4 border-t">
        <Textarea
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Type your message... (Markdown supported)"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          className="flex-1 resize-none"
          rows={3}
          disabled={isLoading}
        />
        <Button
          onClick={handleSendMessage}
          disabled={isLoading || !activeProjectId || !activeConversationId}
          className="self-end"
        >
          {isLoading ? <Spinner /> : <Send className="w-4 h-4" />}
        </Button>
      </div>

      {selectedToolCall && (
        <ToolCallModal
          toolCall={selectedToolCall}
          onClose={() => setSelectedToolCall(null)}
        />
      )}
    </div>
  );
};
