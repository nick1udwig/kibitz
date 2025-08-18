import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
): Promise<NextResponse> {
  try {
    const { projectId } = await context.params;
    
    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { branchName } = body;
    
    if (!branchName) {
      return NextResponse.json(
        { error: 'Branch name is required' },
        { status: 400 }
      );
    }

    const { switchToConversationBranch } = await import('../../../../../../lib/conversationBranchService');
    const { useStore } = await import('../../../../../../stores/rootStore');
    
    // Get the real executeTool from the store
    const rootStore = useStore.getState();
    
    // Find the project and get an active MCP server
    const project = rootStore.projects.find(p => p.id === projectId);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }
    
    const activeMcpServers = rootStore.servers.filter(server => 
      server.status === 'connected' && project.settings.mcpServerIds?.includes(server.id)
    );
    
    if (!activeMcpServers.length) {
      return NextResponse.json(
        { error: 'No active MCP servers available' },
        { status: 500 }
      );
    }
    
    const mcpServerId = activeMcpServers[0].id;
    
    const result = await switchToConversationBranch(
      projectId,
      project.name,
      branchName,
      mcpServerId,
      rootStore.executeTool
    );
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        projectId,
        currentBranch: result.currentBranch,
        files: result.files,
        timestamp: Date.now()
      });
    } else {
      return NextResponse.json(
        { error: result.error || 'Failed to switch branch' },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Error switching branch:', error);
    return NextResponse.json(
      { error: 'Failed to switch branch' },
      { status: 500 }
    );
  }
} 