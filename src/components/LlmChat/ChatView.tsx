import React, { useEffect, useState, useRef } from 'react';
import { Anthropic } from '@anthropic-ai/sdk';
import { Tool, CacheControlEphemeral, TextBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ReactMarkdown from 'react-markdown';
import { Message, MessageContent } from './types';
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
  const [selectedToolCall, setSelectedToolCall] = useState<{
    name: string;
    input: Record<string, unknown>;
    result: string | null;
  } | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages]);

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

    return Array.from(toolMap.values())
      .map((t, index, array) => index != array.length - 1 ? t : { ...t, cache_control: {type: 'ephemeral'} as CacheControlEphemeral});
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

      // Track which tool results are saved and shouldn't be dropped
      const savedToolResults = new Set<string>();

      const tools = getUniqueTools();

      const apiMessages = currentMessages.map(msg => ({
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

      const systemPromptContent = [
        {
          type: "text",
          text: `${activeProject.settings.systemPrompt || ''}`,
        },
      ] as TextBlockParam[];

      while (true) {
        // Get the ID of the newest tool result
        const newestToolResultId = currentMessages
          .filter((msg): msg is Message & { content: MessageContent[] } =>
            Array.isArray(msg.content)
          )
          .flatMap(msg => msg.content)
          .filter((content): content is MessageContent & { tool_use_id: string } =>
            'tool_use_id' in content && content.type === 'tool_result'
          )
          .map(content => content.tool_use_id)
          .pop();

        if (activeProject.settings.elideToolResults) {
          const apiMessagesToUpdateSavedResults = apiMessages
            .map(msg => {
              // Keep non-tool-result messages
              if (!Array.isArray(msg.content)) return msg;

              // Check if message contains a tool result
              const toolResult = msg.content.find(c =>
                c.type === 'tool_result'
              );
              if (!toolResult) return msg;

              // Keep if it's the newest tool result or if it's saved
              const toolUseId = (toolResult as { tool_use_id: string }).tool_use_id;
              return toolUseId === newestToolResultId ?
                msg :
                {
                  ...msg,
                  content: [{
                    ...msg.content[0],
                    content: 'elided',
                  }],
                };
            });

          if (apiMessagesToUpdateSavedResults[apiMessagesToUpdateSavedResults.length - 1].content[0].type === 'tool_result') {
            const keepToolResponse = await anthropic.messages.create({
              model: DEFAULT_MODEL,
              max_tokens: 8192,
              messages: [
                ...apiMessagesToUpdateSavedResults,
                {
                  role: 'user',
                  content: [{
                    type: 'text' as const,
                    text: 'Given the message history as context, will the most recent tool_result message be required in the future beyond an immediate response? Reply only with `Yes` or `No`.',
                  }],
                },
              ],
              ...(tools.length > 0 && {
                tools: tools
              })
            });
            console.log(`keepToolResponse: ${JSON.stringify(keepToolResponse)}`);
            if (keepToolResponse.content[0].type === 'text' && keepToolResponse.content[0].text === 'Yes') {
              const content = apiMessagesToUpdateSavedResults[apiMessagesToUpdateSavedResults.length - 1].content[0];
              if (content.type === 'tool_result') {
                savedToolResults.add(content.tool_use_id as string);
                console.log(`added ${content.tool_use_id}`);
              }
            }
          }
        }

        const apiMessagesToSend = !activeProject.settings.elideToolResults ? apiMessages :
        apiMessages
          .map(msg => {
            // Keep non-tool-result messages
            if (!Array.isArray(msg.content)) return msg;

            // Check if message contains a tool result
            const toolResult = msg.content.find(c =>
              c.type === 'tool_result'
            );
            if (!toolResult) return msg;

            // Keep if it's the newest tool result or if it's saved
            const toolUseId = (toolResult as { tool_use_id: string }).tool_use_id;
            return toolUseId === newestToolResultId || savedToolResults.has(toolUseId) ?
              msg :
              {
                ...msg,
                content: [{
                  ...msg.content[0],
                  content: 'elided',
                }],
              };
          });

        const response = await anthropic.messages.create({
          model: activeProject.settings.model || DEFAULT_MODEL,
          max_tokens: 8192,
          messages: apiMessagesToSend,
          ...(systemPromptContent && {
            system: systemPromptContent
          }),
          ...(tools.length > 0 && {
            tools: tools
          })
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
          } else if (content.type === 'tool_use') {
            try {
              const serverWithTool = servers.find(s =>
                s.tools?.some(t => t.name === content.name)
              );

              if (!serverWithTool) {
                throw new Error(`No server found for tool ${content.name}`);
              }

              const result = await executeTool(
                serverWithTool.id,
                content.name,
                content.input as Record<string, unknown>,
              );


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

              const toolResultMessage: Message = {
                role: 'user',
                content: [{
                  type: 'tool_result',
                  tool_use_id: content.id,
                  content: result,
                }],
                timestamp: new Date()
              };

              currentMessages.push(toolUseMessage, toolResultMessage);
              updateConversationMessages(activeProject.id, activeConversationId, currentMessages);

              apiMessages.push({
                role: 'user',
                content: [{
                  type: 'tool_result',
                  tool_use_id: content.id,
                  content: result,
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

        // Break if no tool use or if response is complete
        if (!response.content.some(c => c.type === 'tool_use') || response.stop_reason !== 'tool_use') {
          break;
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
