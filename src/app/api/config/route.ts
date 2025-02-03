import { NextResponse } from 'next/server';

export async function GET() {
  // Only send what's needed
  const config = {
    anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  };
  
  return NextResponse.json(config);
}