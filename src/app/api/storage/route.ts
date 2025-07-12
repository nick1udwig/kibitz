import { NextRequest, NextResponse } from 'next/server';
import { ensureStorage } from '../../../lib/sqliteStorage';
import { storageAdapter } from '../../../lib/storageAdapter';

// Force dynamic route - required for SQLite operations
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * API Route for SQLite Storage Operations
 * 
 * Handles all database operations on the server side since SQLite 
 * cannot run in the browser environment.
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const operation = searchParams.get('operation');
    const projectId = searchParams.get('projectId');
    
    // Try to get storage, fall back to adapter if SQLite fails
    let storage;
    try {
      storage = ensureStorage();
    } catch (sqliteError) {
      console.warn('SQLite not available, using fallback:', sqliteError);
      // Use storage adapter for fallback
      if (operation === 'storage-info') {
        const info = storageAdapter.getStorageInfo();
        return NextResponse.json({ success: true, data: info });
      }
      return NextResponse.json({ 
        success: false, 
        error: 'SQLite not available and operation not supported in fallback mode' 
      }, { status: 503 });
    }
    
    switch (operation) {
      case 'projects':
        const projects = storage.getAllProjects();
        return NextResponse.json({ success: true, data: projects });
        
      case 'project':
        if (!projectId) {
          return NextResponse.json({ success: false, error: 'Project ID required' }, { status: 400 });
        }
        const project = storage.getProject(projectId);
        return NextResponse.json({ success: true, data: project });
        
      case 'checkpoints':
        if (!projectId) {
          return NextResponse.json({ success: false, error: 'Project ID required' }, { status: 400 });
        }
        const limit = parseInt(searchParams.get('limit') || '50');
        const checkpoints = storage.getCheckpoints(projectId, limit);
        return NextResponse.json({ success: true, data: checkpoints });
        
      case 'branches':
        if (!projectId) {
          return NextResponse.json({ success: false, error: 'Project ID required' }, { status: 400 });
        }
        const branches = storage.getBranches(projectId);
        return NextResponse.json({ success: true, data: branches });
        
      case 'stats':
        const stats = storage.getStats();
        return NextResponse.json({ success: true, data: stats });
        
      case 'storage-info':
        const info = storageAdapter.getStorageInfo();
        return NextResponse.json({ success: true, data: info });
        
      default:
        return NextResponse.json({ success: false, error: 'Unknown operation' }, { status: 400 });
    }
  } catch (error) {
    console.error('Storage API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operation, data, nodeId } = body;
    
    // Try to get storage, fall back to adapter if SQLite fails
    let storage;
    try {
      storage = ensureStorage();
    } catch (sqliteError) {
      console.warn('SQLite not available for POST operation:', sqliteError);
      
      // Handle specific operations that can work with fallback
      if (operation === 'migrate-from-localstorage') {
        try {
          const migrationResult = await storageAdapter.migrateFromLocalStorage();
          return NextResponse.json({ success: true, data: migrationResult });
        } catch (error) {
          return NextResponse.json({ 
            success: false, 
            error: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
          }, { status: 500 });
        }
      }
      
      return NextResponse.json({ 
        success: false, 
        error: 'SQLite not available and operation not supported in fallback mode' 
      }, { status: 503 });
    }
    
    switch (operation) {
      case 'create-project':
        storage.createProject(data, nodeId);
        return NextResponse.json({ success: true });
        
      case 'update-project':
        storage.updateProject(data.projectId, data.updates, nodeId);
        return NextResponse.json({ success: true });
        
      case 'delete-project':
        storage.deleteProject(data.projectId, nodeId);
        return NextResponse.json({ success: true });
        
      case 'create-checkpoint':
        storage.createCheckpoint(data.checkpoint, data.files, nodeId);
        return NextResponse.json({ success: true });
        
      case 'create-branch':
        storage.createBranch(data.projectId, data.branchInfo, nodeId);
        return NextResponse.json({ success: true });
        
      case 'set-active-branch':
        storage.setActiveBranch(data.projectId, data.branchName);
        return NextResponse.json({ success: true });
        
      case 'cleanup-checkpoints':
        const cleaned = storage.cleanupOldCheckpoints(data.projectId, data.maxCheckpoints);
        return NextResponse.json({ success: true, data: { cleaned } });
        
      case 'migrate-from-localstorage':
        const migrationResult = await storageAdapter.migrateFromLocalStorage();
        return NextResponse.json({ success: true, data: migrationResult });
        
      case 'vacuum':
        storage.vacuum();
        return NextResponse.json({ success: true });
        
      default:
        return NextResponse.json({ success: false, error: 'Unknown operation' }, { status: 400 });
    }
  } catch (error) {
    console.error('Storage API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const operation = searchParams.get('operation');
    const projectId = searchParams.get('projectId');
    const checkpointId = searchParams.get('checkpointId');
    const nodeId = searchParams.get('nodeId');
    
    // Try to get storage, fall back to adapter if SQLite fails
    let storage;
    try {
      storage = ensureStorage();
    } catch (sqliteError) {
      console.warn('SQLite not available for DELETE operation:', sqliteError);
      return NextResponse.json({ 
        success: false, 
        error: 'SQLite not available and operation not supported in fallback mode' 
      }, { status: 503 });
    }
    
    switch (operation) {
      case 'project':
        if (!projectId) {
          return NextResponse.json({ success: false, error: 'Project ID required' }, { status: 400 });
        }
        storage.deleteProject(projectId, nodeId || undefined);
        return NextResponse.json({ success: true });
        
      case 'cleanup-sync-log':
        const days = parseInt(searchParams.get('days') || '7');
        const cleaned = storage.cleanupSyncLog(days);
        return NextResponse.json({ success: true, data: { cleaned } });
        
      default:
        return NextResponse.json({ success: false, error: 'Unknown operation' }, { status: 400 });
    }
  } catch (error) {
    console.error('Storage API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 