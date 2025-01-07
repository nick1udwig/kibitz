"use client";

import React, { useState } from 'react';
import { McpProvider } from './context/McpContext';
import { ProjectProvider } from './context/ProjectContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './ThemeToggle';
import { ChatView } from './ChatView';
import { AdminView } from './AdminView';
import { ConversationSidebar } from './ConversationSidebar';

export const ChatApp = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Handle initial mobile state
  React.useEffect(() => {
    setIsMobileMenuOpen(window.innerWidth >= 768);
  }, []);
  const handleExportConversation = (projectId: string, conversationId?: string) => {
    console.log('Export', { projectId, conversationId });
  };

  return (
    <ProjectProvider>
      <McpProvider>
        <div className="min-h-screen bg-background text-foreground flex relative">
          {/* Mobile menu overlay */}
          {isMobileMenuOpen && (
            <div
              className="fixed inset-0 bg-black/50 md:hidden z-40 backdrop-blur-sm transition-opacity duration-200"
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}

          <ConversationSidebar
            onExportConversation={handleExportConversation}
            isMobileMenuOpen={isMobileMenuOpen}
            onMobileMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          />

          {/* Floating menu button when sidebar is hidden */}
          <Button
            variant="outline"
            size="icon"
            className={`fixed left-4 top-4 z-50 md:hidden shadow-lg ${isMobileMenuOpen ? 'hidden' : 'flex'} w-9 h-9 rounded-full`}
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className="w-4 h-4" />
          </Button>

          <div className="flex-1">
            <div className="p-4 border-b flex justify-end">
              <ThemeToggle />
            </div>

            <div className="p-4">
              <Tabs defaultValue="chat" className="max-w-4xl mx-auto">
                <TabsList className="mb-4">
                  <TabsTrigger value="chat">Chat</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>

                <TabsContent value="chat" className="h-[calc(100vh-12rem)]">
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
