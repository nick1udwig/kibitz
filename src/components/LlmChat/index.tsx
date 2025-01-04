"use client";

import React from 'react';
import { McpProvider } from './context/McpContext';
import { ProjectProvider } from './context/ProjectContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ThemeToggle } from './ThemeToggle';
import { ChatView } from './ChatView';
import { AdminView } from './AdminView';
import { ConversationSidebar } from './ConversationSidebar';

export const ChatApp = () => {
  const handleExportConversation = (projectId: string, conversationId?: string) => {
    // TODO: Implement export functionality
    console.log('Export', { projectId, conversationId });
  };

  return (
    <ProjectProvider>
      <McpProvider>
        <div className="min-h-screen bg-background text-foreground flex">
          <ConversationSidebar onExportConversation={handleExportConversation} />

          <div className="flex-1">
            <div className="p-4 border-b">
              <ThemeToggle />
            </div>

            <div className="p-4">
              <Tabs defaultValue="chat" className="max-w-4xl mx-auto">
                <TabsList className="mb-4">
                  <TabsTrigger value="chat">Chat</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>

                <TabsContent value="chat">
                  <ChatView />
                </TabsContent>

                <TabsContent value="settings">
                  <AdminView />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </McpProvider>
    </ProjectProvider>
  );
};

export default ChatApp;
