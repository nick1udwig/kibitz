"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Project, ProjectSettings, ProjectState, ConversationBrief } from './types';
import { Message } from '../types';
import { McpServer } from '../types/mcp';

const ProjectContext = createContext<ProjectState | null>(null);

const generateId = () => Math.random().toString(36).substring(7);

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  apiKey: '',
  model: 'claude-3-5-sonnet-20241022',
  systemPrompt: '',
  mcpServers: [],
  elideToolResults: false
};

interface ProjectUpdates {
  settings?: Partial<ProjectSettings>;
  conversations?: ConversationBrief[];
}

export const useProjects = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjects must be used within a ProjectProvider');
  }
  return context;
};

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Use ref to track if initial load has happened
  const initialized = useRef(false);

  const createDefaultProject = useCallback(() => {
    const defaultProject: Project = {
      id: generateId(),
      name: 'Default Project',
      settings: {
        ...DEFAULT_PROJECT_SETTINGS,
        mcpServers: []
      },
      conversations: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    setProjects([defaultProject]);
    setActiveProjectId(defaultProject.id);
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const savedData = localStorage.getItem('chat_app_projects');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setProjects(parsed.projects.map((proj: Project & { settings: ProjectSettings }) => ({
          ...proj,
          settings: {
            apiKey: proj.settings.apiKey,
            model: proj.settings.model,
            systemPrompt: proj.settings.systemPrompt,
            mcpServers: (proj.settings.mcpServers || []).map((server: McpServer) => ({
              ...server,
              status: 'disconnected'
            })),
          },
          conversations: proj.conversations.map((conv: ConversationBrief & { messages: Message[] }) => ({
            ...conv,
            lastUpdated: new Date(conv.lastUpdated),
            messages: conv.messages.map((msg: Message) => ({
              ...msg,
              timestamp: new Date(msg.timestamp)
            }))
          })),
          createdAt: new Date(proj.createdAt),
          updatedAt: new Date(proj.updatedAt)
        })));
        setActiveProjectId(parsed.activeProjectId);
        setActiveConversationId(parsed.activeConversationId);
      } catch (error) {
        console.error('Error parsing saved data:', error);
        createDefaultProject();
      }
    } else {
      createDefaultProject();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save state changes with debounce
  const saveToLocalStorage = useCallback(() => {
    if (projects.length > 0) {
      localStorage.setItem('chat_app_projects', JSON.stringify({
        projects,
        activeProjectId,
        activeConversationId
      }));
    }
  }, [projects, activeProjectId, activeConversationId]);

  useEffect(() => {
    const timeoutId = setTimeout(saveToLocalStorage, 1000);
    return () => clearTimeout(timeoutId);
  }, [saveToLocalStorage]);

  const updateProjectSettings = useCallback((id: string, updates: ProjectUpdates) => {
    setProjects(current =>
      current.map(p => {
        if (p.id !== id) return p;
        return {
          ...p,
          settings: updates.settings ? {
            ...p.settings,
            ...updates.settings,
            mcpServers: updates.settings.mcpServers !== undefined
              ? updates.settings.mcpServers
              : p.settings.mcpServers
          } : p.settings,
          conversations: updates.conversations || p.conversations,
          updatedAt: new Date()
        };
      })
    );
  }, []);

  const createProject = useCallback((name: string, settings?: Partial<ProjectSettings>) => {
    const currentProject = projects.find(p => p.id === activeProjectId);
    const projectId = generateId();
    const conversationId = generateId();
    const newProject: Project = {
      id: projectId,
      name,
      settings: {
        ...DEFAULT_PROJECT_SETTINGS,
        ...(currentProject && {
          apiKey: currentProject.settings.apiKey,
          systemPrompt: currentProject.settings.systemPrompt,
        }),
        ...settings,
      },
      conversations: [{
        id: conversationId,
        name: 'Conversation 1',
        lastUpdated: new Date(),
        messages: []
      }],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    setProjects(prev => [...prev, newProject]);
    setActiveProjectId(projectId);
    setActiveConversationId(conversationId);
    return projectId;
  }, [activeProjectId, projects]);

  const deleteProject = useCallback((id: string) => {
    setProjects(current => {
      const updatedProjects = current.filter(p => p.id !== id);
      return updatedProjects;
    });

    if (activeProjectId === id) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      setActiveProjectId(prev => {
        const newActiveId = projects.find(p => p.id !== id)?.id ?? null;
        setActiveConversationId(null);
        return newActiveId;
      });
    }
  }, [activeProjectId, projects]);

  const createConversation = useCallback((projectId: string, name?: string) => {
    const conversationId = generateId();
    setProjects(current =>
      current.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          conversations: [
            ...p.conversations,
            {
              id: conversationId,
              name: name || `Conversation ${p.conversations.length + 1}`,
              lastUpdated: new Date(),
              messages: []
            }
          ],
          updatedAt: new Date()
        };
      })
    );
    setActiveConversationId(conversationId);
  }, []);

  const deleteConversation = useCallback((projectId: string, conversationId: string) => {
    setProjects(current =>
      current.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          conversations: p.conversations.filter(c => c.id !== conversationId),
          updatedAt: new Date()
        };
      })
    );

    if (activeConversationId === conversationId) {
      const project = projects.find(p => p.id === projectId);
      const nextConvoId = project?.conversations.find(c => c.id !== conversationId)?.id ?? null;
      setActiveConversationId(nextConvoId);
    }
  }, [activeConversationId, projects]);

  const renameConversation = useCallback((projectId: string, conversationId: string, newName: string) => {
    setProjects(current =>
      current.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          conversations: p.conversations.map(c =>
            c.id === conversationId
              ? { ...c, name: newName }
              : c
          ),
          updatedAt: new Date()
        };
      })
    );
  }, []);

  const renameProject = useCallback((projectId: string, newName: string) => {
    setProjects(current =>
      current.map(p =>
        p.id === projectId
          ? { ...p, name: newName, updatedAt: new Date() }
          : p
      )
    );
  }, []);

  const value: ProjectState = {
    projects,
    activeProjectId,
    activeConversationId,
    createProject,
    deleteProject,
    updateProjectSettings,
    createConversation,
    deleteConversation,
    renameConversation,
    setActiveProject: setActiveProjectId,
    setActiveConversation: setActiveConversationId,
    renameProject
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};
