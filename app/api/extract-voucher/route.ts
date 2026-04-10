// app/api/extract-voucher/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// ── FIX 1: Raise body size limit ────────────────────────────────────────────
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_BASE64_BYTES = 5 * 1024 * 1024; // 5MB base64 safety cap

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY environment variable is required' },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err: any) {
    console.error('[extract-voucher] formData parse error:', err.message);
    return NextResponse.json(
      { error: 'File too large or malformed. Please compress your image and try again.' },
      { status: 413 }
    );
  }

  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Use JPEG, PNG, WEBP, or PDF.` },
      { status: 415 }
    );
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const base64 = buffer.toString('base64');

  if (base64.length > MAX_BASE64_BYTES) {
    return NextResponse.json(
      {
        error: `Image is too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB). ` +
               `Please compress it below 3MB before uploading.`,
      },
      { status: 413 }
    );
  }

  const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'application/pdf';
  const isDocument = mediaType === 'application/pdf';

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            isDocument
              ? {
                  type: 'document' as const,
                  source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
                }
              : {
                  type: 'image' as const,
                  source: { type: 'base64' as const, media_type: mediaType, data: base64 },
                },
            {
              type: 'text' as const,
              text: `Extract the payment voucher data from this document.

Return ONLY valid JSON with no markdown, no code fences, no extra text:
{
  "voucher_title": "string",
  "date_range": "string",
  "entries": [
    {
      "sn": number,
      "date": "string",
      "supplier_name": "string",
      "product_supplied": "string",
      "account_name": "string",
      "account_number": "string",
      "bank": "string",
      "amount": number
    }
  ],
  "grand_total": number
}

For Nigerian Naira amounts, strip the symbol and return pure numbers.`,
            },
          ],
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const cleaned = content.text.replace(/```json\n?|```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error('[extract-voucher] Error:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Failed to parse Claude response as JSON' },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: `Failed to extract voucher: ${error.message}` },
      { status: 500 }
    );
  }
}