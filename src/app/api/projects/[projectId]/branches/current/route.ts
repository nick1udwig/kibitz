import { NextRequest, NextResponse } from 'next/server';

export async function GET(
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

    const { getCurrentBranch } = await import('../../../../../../lib/conversationBranchService');
    
    // For now, use a mock executeTool - in production this would come from your MCP system
    const mockExecuteTool = async (serverId: string, toolName: string, args: any) => {
      // This would normally interface with your MCP system
      return 'mock-result';
    };
    
    const currentBranch = await getCurrentBranch(
      projectId,
      'New Project', // Default project name - could be fetched from database
      'localhost-mcp',
      mockExecuteTool
    );
    
    return NextResponse.json({
      projectId,
      currentBranch,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('Error getting current branch:', error);
    return NextResponse.json(
      { error: 'Failed to get current branch' },
      { status: 500 }
    );
  }
} 