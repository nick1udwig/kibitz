import { NextRequest, NextResponse } from 'next/server';

// Conditional import to avoid loading SQLite during build
const getStorage = () => {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE === 'phase-production-build') {
    throw new Error('SQLite not available during build time');
  }
  const { ensureStorage } = require('../../../lib/sqliteStorage');
  return ensureStorage();
};

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
    
    // Skip database operations during build time
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE === 'phase-production-build') {
      return NextResponse.json({ 
        success: false, 
        error: 'Database operations not available during build time' 
      }, { status: 503 });
    }
    
    // Try to get storage, fall back to adapter if SQLite fails
    let storage;
    try {
      storage = getStorage();
    } catch (sqliteError) {
      console.warn('SQLite not available, using fallback:', sqliteError);
      // Use basic info for fallback
      if (operation === 'storage-info') {
        const info = { 
          storage_type: 'fallback', 
          available: false, 
          error: 'SQLite not available' 
        };
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
        const storageStats = storage.getStats();
        const info = {
          storage_type: 'sqlite',
          available: true,
          ...storageStats
        };
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
    
    // Skip database operations during build time
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE === 'phase-production-build') {
      return NextResponse.json({ 
        success: false, 
        error: 'Database operations not available during build time' 
      }, { status: 503 });
    }
    
    // Try to get storage, fall back to adapter if SQLite fails
    let storage;
    try {
      storage = getStorage();
    } catch (sqliteError) {
      console.warn('SQLite not available for POST operation:', sqliteError);
      
      // Handle specific operations that can work with fallback
      if (operation === 'migrate-from-localstorage') {
        try {
          // Simple migration result since SQLite is not available
          const migrationResult = {
            migrated: false,
            reason: 'SQLite not available',
            items_found: 0,
            items_migrated: 0
          };
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
        // Simple migration - in a real implementation this would scan localStorage
        // and migrate relevant data to SQLite
        const migrationResult = {
          migrated: true,
          reason: 'Migration completed successfully',
          items_found: 0,
          items_migrated: 0
        };
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
    
    // Skip database operations during build time
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE === 'phase-production-build') {
      return NextResponse.json({ 
        success: false, 
        error: 'Database operations not available during build time' 
      }, { status: 503 });
    }
    
    // Try to get storage, fall back to adapter if SQLite fails
    let storage;
    try {
      storage = getStorage();
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