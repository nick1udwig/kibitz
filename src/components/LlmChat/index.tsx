"use client";

import React, { useState, useRef } from 'react';
import { McpProvider } from './context/McpContext';
import { ProjectProvider } from './context/ProjectContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatView } from './ChatView';
import { AdminView } from './AdminView';
import { ConversationSidebar } from './ConversationSidebar';

export const ChatApp = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'settings'>('chat');
  const chatViewRef = useRef<import('./ChatView').ChatViewRef>(null);

  const handleTabChange = (value: string) => {
    const newTab = value as 'chat' | 'settings';
    setActiveTab(newTab);
    if (newTab === 'chat') {
      // Focus the input when switching to chat view
      setTimeout(() => {
        chatViewRef.current?.focus();
      }, 0);
    }
  };

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
        <div className="min-h-screen bg-background text-foreground flex relative overflow-x-hidden">
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

          <div className="flex-1 relative">
            {/* Floating navigation - only visible on desktop or when mobile menu is open */}
            <div className={`absolute right-4 top-4 z-50 flex items-center gap-4 transition-opacity duration-200
              ${!isMobileMenuOpen ? 'md:opacity-100 opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <Tabs value={activeTab} onValueChange={handleTabChange}>
                <div className="flex items-center gap-4 bg-background/80 backdrop-blur-sm rounded-lg shadow-lg p-1">
                  <TabsList className="bg-transparent">
                    <TabsTrigger value="chat">Chat</TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                  </TabsList>
                </div>
              </Tabs>
            </div>

            <div className="flex flex-col h-full">
              <div className="flex-1">
                {/* Keep the ChatView always mounted to preserve conversation state */}
                <div className={activeTab === 'settings' ? 'hidden' : ''}>
                  <Tabs value={activeTab}>
                    <TabsContent value="chat" forceMount>
                      <ChatView ref={chatViewRef} />
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Show AdminView only when settings tab is active */}
                <div className={activeTab === 'chat' ? 'hidden' : ''}>
                  <Tabs value={activeTab}>
                    <TabsContent value="settings" forceMount>
                      <AdminView />
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </div>
          </div>
        </div>
      </McpProvider>
    </ProjectProvider>
  );
};

export default ChatApp;
