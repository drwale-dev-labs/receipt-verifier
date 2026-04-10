// app/api/extract-receipt/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';


// NOTE: In Next.js App Router, Route Handler body size cannot be configured
// via `export const config`. Vercel enforces a 4.5MB hard limit at the
// infrastructure level. Files must be compressed client-side before upload.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── FIX 2: Compress image before sending to Claude ─────────────────────────
// Claude's vision API has its own limit (~5MB per image in base64 ≈ ~3.75MB raw).
// We resize large images client-side but also guard server-side here.
// A 1200px-wide JPEG at quality 85 is more than sufficient for OCR.
// Claude's vision API accepts images up to ~5MB raw (≈6.7MB base64).
// We target 3MB raw on the client, so 4MB base64 is a generous server guard.
const MAX_BASE64_BYTES = 5 * 1024 * 1024; // 5MB base64 safety cap

function truncationWarning(originalSize: number, base64Size: number) {
  if (base64Size > MAX_BASE64_BYTES) {
    console.warn(
      `[extract-receipt] Image too large after base64 (${(base64Size / 1024 / 1024).toFixed(1)}MB). ` +
      `Original: ${(originalSize / 1024 / 1024).toFixed(1)}MB. ` +
      `Ask client to compress before upload.`
    );
  }
}

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
    // If formData parsing itself throws, it's almost certainly a size issue
    // that slipped past the config (e.g. running behind a custom proxy).
    console.error('[extract-receipt] formData parse error:', err.message);
    return NextResponse.json(
      { error: 'File too large or malformed. Please compress your image and try again.' },
      { status: 413 }
    );
  }

  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // ── FIX 3: Validate MIME type before sending to Claude ─────────────────
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

  truncationWarning(buffer.length, base64.length);

  // Guard: if after base64 encoding it's still too large, reject cleanly
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
              text: `You are a financial document auditor for a Nigerian supermarket business.

Extract ALL data from this supplier receipt/invoice precisely.

Return ONLY valid JSON with no markdown, no code fences, no extra text:
{
  "supplier_name": "string",
  "invoice_number": "string or null",
  "date": "DD/MM/YYYY",
  "account_name": "string",
  "account_number": "string",
  "bank": "string",
  "line_items": [
    {
      "description": "string",
      "quantity": number or null,
      "unit_price": number or null,
      "amount": number
    }
  ],
  "subtotal": number,
  "total_amount": number,
  "amount_in_words": "string",
  "product_category": "FANICE|KILISHI|PARFAIT|CARBONATED|FRUIT_SALAD|EGG|VALUES_WATER|OTHER",
  "confidence": "HIGH|MEDIUM|LOW",
  "notes": "any anomalies or unclear items"
}

For Nigerian Naira amounts, strip the symbol and return pure numbers.
If handwriting is unclear, use your best judgment and set confidence to LOW.`,
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
    console.error('[extract-receipt] Error:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Failed to parse Claude response as JSON' },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: `Failed to extract receipt: ${error.message}` },
      { status: 500 }
    );
  }
}