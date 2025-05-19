import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createCheckpoint, rollbackToCheckpoint, listCheckpoints } from '../../../services/checkpointService';
import { processToolAction } from '../../../services/toolCallService';

const execPromise = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, payload } = body;

    switch (action) {
      case 'create': {
        const result = await createCheckpoint(payload.message);
        return NextResponse.json(result);
      }
      
      case 'rollback': {
        const result = await rollbackToCheckpoint(payload.hash);
        return NextResponse.json(result);
      }
      
      case 'list': {
        const result = await listCheckpoints(payload.count);
        return NextResponse.json(result);
      }
      
      case 'process_tool': {
        const result = await processToolAction(payload.actionJson);
        return NextResponse.json(result);
      }
      
      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
} 