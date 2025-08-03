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
    
    // For now, use a mock executeTool - in production this would come from your MCP system
    const mockExecuteTool = async (serverId: string, toolName: string, args: any) => {
      // This would normally interface with your MCP system
      return 'mock-result';
    };
    
    const result = await switchToConversationBranch(
      projectId,
      'New Project', // Default project name - could be fetched from database
      branchName,
      'localhost-mcp',
      mockExecuteTool
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