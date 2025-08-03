import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory storage for demo purposes
// In production, you'd want to use a proper database or encrypted storage
let apiKeysStorage: Record<string, string> = {};

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ keys: apiKeysStorage });
  } catch (error) {
    console.error('Error retrieving API keys:', error);
    return NextResponse.json({ error: 'Failed to retrieve API keys' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { keys } = body;
    
    if (!keys || typeof keys !== 'object') {
      return NextResponse.json({ error: 'Invalid keys format' }, { status: 400 });
    }
    
    // Update the storage
    apiKeysStorage = { ...apiKeysStorage, ...keys };
    
    return NextResponse.json({ success: true, keys: apiKeysStorage });
  } catch (error) {
    console.error('Error saving API keys:', error);
    return NextResponse.json({ error: 'Failed to save API keys' }, { status: 500 });
  }
} 