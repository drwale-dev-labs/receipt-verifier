'use server';
// lib/actions.ts
//
// WHY SERVER ACTIONS INSTEAD OF ROUTE HANDLERS:
//
// Vercel's infrastructure imposes a hard 4.5MB body limit on HTTP requests
// to Route Handlers (app/api/*/route.ts). This cannot be overridden in code.
//
// Server Actions are different — they go through Next.js's own multipart
// handling, and next.config.js `experimental.serverActions.bodySizeLimit`
// DOES apply to them. Setting it to '20mb' allows files up to 20MB.
//
// This is the only way to accept >4.5MB files on Vercel Hobby without
// switching to Vercel Blob or an external storage service.

import Anthropic from '@anthropic-ai/sdk';
import { verifyDocuments } from './verificationEngine';
import type { ExtractedReceipt, ExtractedVoucher, VerificationResult } from './verificationEngine';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const RECEIPT_PROMPT = `You are a financial document auditor for a Nigerian supermarket business.

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
If handwriting is unclear, use your best judgment and set confidence to LOW.`;

const VOUCHER_PROMPT = `Extract the payment voucher data from this document.

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

For Nigerian Naira amounts, strip the symbol and return pure numbers.`;

function parseClaudeJSON(text: string) {
  const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

async function extractWithClaude(base64: string, mediaType: string, prompt: string) {
  const isDocument = mediaType === 'application/pdf';

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
                source: {
                  type: 'base64' as const,
                  media_type: 'application/pdf' as const,
                  data: base64,
                },
              }
            : {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
                  data: base64,
                },
              },
          { type: 'text' as const, text: prompt },
        ],
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected Claude response type');
  return parseClaudeJSON(content.text);
}

// ── Exported Server Actions ──────────────────────────────────────────────────

export async function extractReceiptAction(formData: FormData): Promise<ExtractedReceipt> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured on the server.');
  }

  const file = formData.get('file') as File;
  if (!file) throw new Error('No file provided');

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');

  return extractWithClaude(base64, file.type, RECEIPT_PROMPT);
}

export async function extractVoucherAction(formData: FormData): Promise<ExtractedVoucher> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured on the server.');
  }

  const file = formData.get('file') as File;
  if (!file) throw new Error('No file provided');

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');

  return extractWithClaude(base64, file.type, VOUCHER_PROMPT);
}

export async function verifyAction(
  receiptFiles: FormData[],
  voucherFormData: FormData,
): Promise<VerificationResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured on the server.');
  }

  // Extract all receipts sequentially
  const receipts: ExtractedReceipt[] = [];
  for (const fd of receiptFiles) {
    receipts.push(await extractReceiptAction(fd));
  }

  // Extract voucher
  const voucher = await extractVoucherAction(voucherFormData);

  // Run verification
  return verifyDocuments(receipts, voucher);
}