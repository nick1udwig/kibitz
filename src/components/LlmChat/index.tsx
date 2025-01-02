"use client";

import React, { useState } from 'react';
import { Settings, MessageCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ThemeToggle } from './ThemeToggle';
import { ChatView } from './ChatView';
import { AdminView } from './AdminView';
import { ConversationSidebar } from './ConversationSidebar';
import { useConversations } from './hooks/useConversations';
import { useAnthropicChat } from './hooks/useAnthropicChat';

export const ChatApp = () => {
  const [inputMessage, setInputMessage] = useState('');
  const [isSettingsView, setIsSettingsView] = useState(false);

  const {
    conversations,
    activeConvoId,
    activeConvo,
    setActiveConvoId,
    setConversations,
    createNewConversation,
    updateConversationSettings
  } = useConversations();

  const { error, isLoading, sendMessage } = useAnthropicChat(
    activeConvo,
    setConversations
  );

  const handleExportConversation = (convoId?: string) => {
    let dataToExport;
    if (convoId) {
      dataToExport = conversations.find(c => c.id === convoId);
    } else {
      dataToExport = conversations;
    }

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = convoId ? `conversation-${convoId}.json` : 'all-conversations.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!activeConvo) return null;

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <ConversationSidebar
        conversations={conversations}
        activeConvoId={activeConvoId}
        onNewConversation={createNewConversation}
        onSelectConversation={setActiveConvoId}
        onExportConversation={handleExportConversation}
      />

      <div className="flex-1 p-4">
        <ThemeToggle />

        <div className="max-w-4xl mx-auto">
          <Tabs defaultValue="chat" value={isSettingsView ? "settings" : "chat"}>
            <div className="flex items-center justify-between mb-4">
              <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                <TabsTrigger
                  value="chat"
                  onClick={() => setIsSettingsView(false)}
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Chat
                </TabsTrigger>
                <TabsTrigger
                  value="settings"
                  onClick={() => setIsSettingsView(true)}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </TabsTrigger>
              </TabsList>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <TabsContent value="settings">
              <AdminView
                settings={activeConvo.settings}
                onSettingsChange={updateConversationSettings}
              />
            </TabsContent>

            <TabsContent value="chat">
              <Card className="mt-0 border rounded-lg min-h-[600px] p-4 bg-background">
                <ChatView
                  messages={activeConvo.messages}
                  inputMessage={inputMessage}
                  onInputChange={setInputMessage}
                  onSendMessage={() => {
                    sendMessage(inputMessage);
                    setInputMessage('');
                  }}
                  isLoading={isLoading}
                />
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default ChatApp;
