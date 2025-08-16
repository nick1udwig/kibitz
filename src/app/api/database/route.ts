import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

// Force dynamic route - required for SQLite operations
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DB_PATH = path.join(process.cwd(), 'data', 'kibitz.db');

/**
 * API Route for Database Operations
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operation, data } = body;

    const db = new Database(DB_PATH);
    
    try {
      switch (operation) {
        case 'create_project': {
          const { id, name, settings, created_at, updated_at, order_index, custom_path } = data;
          
          // Insert project
          const stmt = db.prepare(`
            INSERT INTO projects (id, name, settings, created_at, updated_at, order_index, custom_path)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          
          stmt.run(
            id,
            name,
            JSON.stringify(settings),
            created_at,
            updated_at,
            order_index,
            custom_path
          );

          // Insert conversation if provided
          if (data.conversation) {
            const convStmt = db.prepare(`
              INSERT INTO conversations (id, project_id, name, messages, created_at, last_updated)
              VALUES (?, ?, ?, ?, ?, ?)
            `);

            convStmt.run(
              data.conversation.id,
              id,
              data.conversation.name,
              JSON.stringify([]), // Empty messages array
              data.conversation.created_at,
              data.conversation.updated_at
            );
          }

          return NextResponse.json({ success: true });
        }

        case 'create_conversation': {
          const { id, project_id, name, created_at, updated_at } = data;
          
          const stmt = db.prepare(`
            INSERT INTO conversations (id, project_id, name, messages, created_at, last_updated)
            VALUES (?, ?, ?, ?, ?, ?)
          `);

          stmt.run(id, project_id, name, JSON.stringify([]), created_at, updated_at);
          
          // Update project's last activity
          const updateStmt = db.prepare(`
            UPDATE projects 
            SET updated_at = ?
            WHERE id = ?
          `);
          updateStmt.run(updated_at, project_id);

          return NextResponse.json({ success: true });
        }

        case 'initialize': {
          // Tables already exist, just verify the connection
          console.log('Database initialization - tables already exist');
          return NextResponse.json({ success: true });
        }

        default:
          return NextResponse.json(
            { success: false, error: 'Unknown operation' },
            { status: 400 }
          );
      }
    } finally {
      db.close();
    }
  } catch (error) {
    console.error('Database API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const operation = searchParams.get('operation');
    const projectId = searchParams.get('projectId');

    const db = new Database(DB_PATH);
    
    try {
      switch (operation) {
        case 'get_project': {
          if (!projectId) {
            return NextResponse.json(
              { success: false, error: 'Project ID required' },
              { status: 400 }
            );
          }

          const project = db.prepare(`
            SELECT p.*, 
                   c.id as conversation_id,
                   c.name as conversation_name,
                   0 as branch_count,
                   0 as checkpoint_count
            FROM projects p
            LEFT JOIN conversations c ON c.project_id = p.id
            WHERE p.id = ?
            GROUP BY p.id
          `).get(projectId);

          return NextResponse.json({ success: true, data: project });
        }

        case 'get_all_projects': {
          const projects = db.prepare(`
            SELECT p.*, 
                   c.id as conversation_id,
                   c.name as conversation_name,
                   0 as branch_count,
                   0 as checkpoint_count
            FROM projects p
            LEFT JOIN conversations c ON c.project_id = p.id
            GROUP BY p.id
          `).all();

          return NextResponse.json({ success: true, data: projects });
        }

        default:
          return NextResponse.json(
            { success: false, error: 'Unknown operation' },
            { status: 400 }
          );
      }
    } finally {
      db.close();
    }
  } catch (error) {
    console.error('Database API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 