// app/api/anthropic-key/route.ts
// Returns the Anthropic API key to the browser so it can call Claude directly.
// This bypasses Vercel's 4.5MB body limit entirely — the file goes from the
// browser straight to api.anthropic.com, never touching your server.
//
// Security note: restrict this key to only claude-* models in your Anthropic
// dashboard (Settings → API Keys → Add restrictions). Do NOT use your root key.
import { NextResponse } from 'next/server';

export async function GET() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured' },
      { status: 500 }
    );
  }
  return NextResponse.json({ key });
}