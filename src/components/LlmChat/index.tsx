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
  const [activeTab, setActiveTab] = useState<'chat' | 'settings'>('chat');

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
            onConversationSelect={() => setActiveTab('chat')}
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
            <div className="flex flex-col h-full">
              <div className="p-4 flex justify-between items-center">
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'chat' | 'settings')}>
                  <TabsList>
                    <TabsTrigger value="chat">Chat</TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                  </TabsList>
                  
                  <div className="h-[calc(100vh-5rem)]">
                    {/* Keep the ChatView always mounted to preserve conversation state */}
                    <div className={activeTab === 'settings' ? 'hidden' : ''}>
                      <TabsContent value="chat" forceMount>
                        <ChatView />
                      </TabsContent>
                    </div>

                    {/* Show AdminView only when settings tab is active */}
                    <div className={activeTab === 'chat' ? 'hidden' : ''}>
                      <TabsContent value="settings" forceMount>
                        <AdminView />
                      </TabsContent>
                    </div>
                  </div>
                </Tabs>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      </McpProvider>
    </ProjectProvider>
  );
};

export default ChatApp;
