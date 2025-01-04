import { useState } from 'react';
import { Anthropic } from '@anthropic-ai/sdk';
import { Message, Conversation } from '../types';
import { useMcp } from '../context/McpContext';

export const useAnthropicChat = (
  activeConvo: Conversation | undefined,
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>
) => {
  const { executeTool, getServerTools, isServerConnected, connectToServer } = useMcp();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (inputMessage: string) => {
    if (!inputMessage.trim() || !activeConvo?.settings.apiKey) {
      setError(activeConvo?.settings.apiKey ? null : 'Please enter an API key in settings');
      return;
    }

    setIsLoading(true);
    setError(null);

    // Debug log active conversation
    console.log('Active conversation:', activeConvo);
    console.log('Active conversation settings:', activeConvo?.settings);
    console.log('MCP Servers:', activeConvo?.settings.mcpServers);

    const newMessage: Message = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    try {
      // Update conversation with user's message
      const updatedMessages = [...activeConvo.messages, newMessage];
      setConversations(convos => convos.map(convo =>
        convo.id === activeConvo.id
          ? { ...convo, messages: updatedMessages }
          : convo
      ));

      const anthropic = new Anthropic({
        apiKey: activeConvo.settings.apiKey,
        dangerouslyAllowBrowser: true,
      });

      // Check if all servers are connected
      const disconnectedServers = activeConvo?.settings.mcpServers.filter(
        server => !isServerConnected(server.id)
      );

      if (disconnectedServers?.length) {
        console.log('Reconnecting to disconnected servers:', disconnectedServers);
        await Promise.all(
          disconnectedServers.map(server => connectToServer(server))
        );
      }

      // Get tools from connected servers
      const serverTools = (activeConvo?.settings.mcpServers || [])
        .filter(server => isServerConnected(server.id))
        .flatMap(server => {
          const tools = getServerTools(server.id);
          console.log(`Tools for server ${server.id}:`, tools);
          return tools.map(tool => ({
            name: tool.name,
            description: tool.description || '',
            parameters: tool.inputSchema,
            serverId: server.id
          }));
        });

      // Combine local and server tools
      const allTools = [
        ...(activeConvo?.settings.tools || []).map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.schema
        })),
        ...serverTools
      ];

      console.log('All tools being sent to Anthropic:', allTools);

      // Initialize messages array
      let messages = updatedMessages.map(msg => ({
        role: msg.role,
        content: Array.isArray(msg.content)
          ? msg.content.map(c => {
              if (c.type === 'text') return c.text;
              if (c.type === 'tool_use') return `Using tool: ${c.name}`;
              if (c.type === 'tool_result') return `Tool result: ${c.content}`;
              return '';
            }).join('\n')
          : msg.content
      }));

      // Keep getting responses until we get a final response
      while (true) {
        // Log the request to Anthropic
        const requestParams = {
          model: activeConvo.settings.model,
          max_tokens: 8192,
          messages,
          ...(activeConvo.settings.systemPrompt && { system: activeConvo.settings.systemPrompt }),
          ...(allTools.length > 0 && { tools: allTools })
        };

        console.log('Request to Anthropic:', requestParams);

        const response = await anthropic.messages.create(requestParams);
        console.log('Response from Anthropic:', response);

        // Add Claude's response to messages history AND to the chat display
        messages.push({
          role: 'assistant',
          content: response.content
        });

        // Show any text content in the chat
        for (const content of response.content) {
          if (content.type === 'text') {
            setConversations(convos => convos.map(convo =>
              convo.id === activeConvo.id
                ? {
                    ...convo,
                    messages: [...convo.messages, {
                      role: 'assistant',
                      content: content.text,
                      timestamp: new Date()
                    }]
                  }
                : convo
            ));
          }
        }

        // Break if there's no tool use
        if (!response.content.some(c => c.type === 'tool_use') || response.stop_reason !== 'tool_use') {
          break;
        }

        // Handle tool usage
        for (const content of response.content) {
          if (content.type === 'tool_use') {
            try {
              //const serverWithTool = activeConvo.settings.mcpServers.find(s =>
              //  getServerTools(s.id).some(t => t.name === content.name)
              //);

              //if (!serverWithTool) {
              const toolInfo = serverTools.find(t => t.name === content.name);
              if (!toolInfo) {
                throw new Error(`No server found for tool ${content.name}`);
              }

              // Show tool usage in chat
              setConversations(convos => convos.map(convo =>
                convo.id === activeConvo.id
                  ? {
                      ...convo,
                      messages: [...convo.messages, {
                        role: 'assistant',
                        content: [{
                          type: 'tool_use',
                          id: content.id,
                          name: content.name,
                          input: content.input,
                        }],
                        timestamp: new Date()
                      }]
                    }
                  : convo
              ));

              // Execute the tool
              const result = await executeTool(
                toolInfo.serverId,
                //serverWithTool.id,
                content.name,
                content.input
              );

              // Add tool result to messages
              const toolResultMessage = {
                role: 'user',
                content: [{
                  type: 'tool_result',
                  tool_use_id: content.id,
                  content: result
                }]
              };
              messages.push(toolResultMessage);
              setConversations(convos => convos.map(convo =>
                convo.id === activeConvo.id
                  ? {
                      ...convo,
                      messages: [...convo.messages, toolResultMessage]
                    }
                  : convo
              ));

            } catch (error) {
              // Handle tool execution error
              const errorMessage = {
                role: 'user',
                content: [{
                  type: 'tool_result',
                  tool_use_id: content.id,
                  content: `Error: ${error.message}`,
                  is_error: true
                }]
              };
              messages.push(errorMessage);
            }
          }
        }
      }

    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    error,
    isLoading,
    sendMessage
  };
};
