import React, { useEffect, useState, useRef } from 'react';
import { Anthropic } from '@anthropic-ai/sdk';
import { Tool, CacheControlEphemeral } from '@anthropic-ai/sdk/resources/messages/messages';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ReactMarkdown from 'react-markdown';
import { Message } from './types';
import { Spinner } from '@/components/ui/spinner';
import { ToolCallModal } from './ToolCallModal';
import { useProjects } from './context/ProjectContext';
import { useFocusControl } from './context/useFocusControl';
import { useMcp } from './context/McpContext';

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';

export const ChatView: React.FC = () => {
  const {
    projects,
    activeProjectId,
    activeConversationId,
    updateProjectSettings,
    renameConversation,
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
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [selectedToolCall, setSelectedToolCall] = useState<{
    name: string;
    input: Record<string, unknown>;
    result: string | null;
  } | null>(null);

  // Handle scrolling
  useEffect(() => {
    if (!chatContainerRef.current) return;

    const container = chatContainerRef.current;
    const handleScroll = () => {
      const isAtBottom = Math.abs((container.scrollHeight - container.scrollTop) - container.clientHeight) < 10;
      setShouldAutoScroll(isAtBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll when messages change if shouldAutoScroll is true
  useEffect(() => {
    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeConversation?.messages, shouldAutoScroll]);

  const getUniqueTools = () => {
    if (!activeProject?.settings.mcpServers?.length) {
      return [];
    }

    const toolMap = new Map<string, Tool>();

    servers
      .filter(server =>
        activeProject.settings.mcpServers.some(
          configuredServer => configuredServer.id === server.id
        )
      )
      .flatMap(s => s.tools || [])
      .forEach(tool => {
        if (!toolMap.has(tool.name)) {
          toolMap.set(tool.name, {
            name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema
          });
        }
      });

    return Array.from(toolMap.values());
  };


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

      const availableTools = getUniqueTools();

      let apiMessages = currentMessages.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' ?
        [{
          type: 'text' as const,
          text: msg.content,
          cache_control: {type: 'ephemeral'} as CacheControlEphemeral,
        }]
        :
        msg.content.map((c, index, array) =>
          index !== array.length - 1 ? c :
          {
            ...c,
            cache_control: {type: 'ephemeral'} as CacheControlEphemeral,
          }
        )
      }));

      // TODO: make cache_control an option in AdminView
      while (true) {
        const response = await anthropic.messages.create({
          model: activeProject.settings.model || DEFAULT_MODEL,
          max_tokens: 8192,
          messages: apiMessages,
          ...(activeProject.settings.systemPrompt && {
            system: [
              {
                type: "text",
                text: activeProject.settings.systemPrompt,
                cache_control: {type: 'ephemeral'} as CacheControlEphemeral,
              }
            ],
          }),
          ...(availableTools.length > 0 && { tools: availableTools.map((t, index, array) => index != array.length - 1 ? t : { ...t, cache_control: {type: 'ephemeral'} as CacheControlEphemeral}) })
        });

        const transformedContent = response.content.map(content => {
          if (content.type === 'text') {
            return {
              type: 'text' as const,
              text: content.text,
            };
          } else if (content.type === 'tool_use') {
            return {
              type: 'tool_use' as const,
              id: content.id,
              name: content.name,
              input: content.input as Record<string, unknown>,
            };
          }
          throw new Error(`Unexpected content type: ${content}`);
        });
        apiMessages.push({
          role: response.role,
          content: transformedContent,
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

        // Generate conversation name after first exchange
        if (activeConversation && apiMessages.length === 2) {
          const userFirstMessage = apiMessages[0].content;
          const assistantFirstMessage = apiMessages[1].content;

          // Create a summary prompt for the model
          const summaryResponse = await anthropic.messages.create({
            model: activeProject.settings.model || DEFAULT_MODEL,
            max_tokens: 20,
            messages: [{
              role: "user",
              content: `User: ${JSON.stringify(userFirstMessage)}\nAssistant: ${Array.isArray(assistantFirstMessage)
                ? assistantFirstMessage.filter(c => c.type === 'text').map(c => c.type === 'text' ? c.text : '').join(' ')
                : assistantFirstMessage}\n\n# Based on the above chat exchange, generate a very brief (2-5 words) title that captures the main topic or purpose.`
            }]
          });

          const type = summaryResponse.content[0].type;
          if (type == 'text') {
            const suggestedTitle = summaryResponse.content[0].text
              .replace(/["']/g, '')
              .replace('title:', '')
              .replace('Title:', '')
              .replace('title', '')
              .replace('Title', '')
              .trim();
            if (suggestedTitle) {
              renameConversation(activeProject.id, activeConversationId, suggestedTitle);
            }
          } else {
            console.log(`Failed to rename conversation. Got back: ${summaryResponse}`);
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
                  input: content.input as Record<string, unknown>,
                }],
                timestamp: new Date()
              };

              currentMessages.push(toolUseMessage);
              updateConversationMessages(activeProject.id, activeConversationId, currentMessages);

              const result = await executeTool(
                serverWithTool.id,
                content.name,
                content.input as Record<string, unknown>,
              );

              const toolResultMessage: Message = {
                role: 'user',
                content: [{
                  type: 'tool_result',
                  tool_use_id: content.id,
                  content: result,
                }],
                timestamp: new Date()
              };

              currentMessages.push(toolResultMessage);
              updateConversationMessages(activeProject.id, activeConversationId, currentMessages);

              apiMessages = apiMessages.map(m => m.content[0].type !== 'tool_result' ?
                m :
                {
                  ...m,
                  content: [{
                    ...m.content[0],
                    content: 'elided',
                  }],
                }
              );

              apiMessages.push({
                role: 'user',
                content: [{
                  type: 'tool_result',
                  tool_use_id: content.id,
                  content: result,
                  //cache_control: {type: 'ephemeral'} as CacheControlEphemeral,
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
                  is_error: true,
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
            if (resultContent && resultContent.type === 'tool_result') {
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

  // Use the focus control hook for managing conversation focus
  useFocusControl();

  if (!activeConversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
    <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {activeConversation.messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-muted text-primary-foreground'
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
          className="flex-1"
          maxRows={8}
          disabled={isLoading}
        />
        <Button
          onClick={handleSendMessage}
          disabled={isLoading || !activeProjectId || !activeConversationId}
          className="self-end relative"
        >
          {isLoading ? (
            <Spinner />
          ) : (
            <Send className="w-4 h-4" />
          )}
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
