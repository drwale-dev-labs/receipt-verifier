// lib/claudeClient.ts
// Calls the Anthropic API directly from the browser.
// Files are converted to base64 in the browser and sent to api.anthropic.com
// directly — never through Vercel, so no 4.5MB infrastructure limit applies.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cachedKey: string | null = null;

async function getKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  const res = await fetch('/api/anthropic-key');
  if (!res.ok) throw new Error('Failed to load API configuration');
  const { key } = await res.json();
  cachedKey = key;
  return key;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Anthropic build tier: 30,000 input tokens/minute.
// A high-res receipt image costs ~1,500–4,000 tokens.
// 8s between calls ≈ 7 calls/minute — safe with headroom.
const INTER_REQUEST_DELAY_MS = 8_000;
let callCount = 0;

export function resetCallCount() {
  callCount = 0;
}

// ── Core API call with retry on 429 ───────────────────────────────────────────

async function callClaude(
  base64: string,
  mediaType: string,
  prompt: string,
  attempt = 1,
): Promise<any> {
  const key = await getKey();
  const isPdf = mediaType === 'application/pdf';

  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          isPdf
            ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
            : { type: 'image',    source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  };

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    if (attempt > 3) {
      throw new Error(
        'Rate limit exceeded after 3 retries. Please wait a minute and try again, ' +
        'or upload fewer receipts at once.',
      );
    }
    const retryAfter = res.headers.get('retry-after');
    const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 15_000 * attempt;
    console.warn(`[claudeClient] 429 — waiting ${waitMs / 1000}s (retry ${attempt}/3)`);
    await sleep(waitMs);
    return callClaude(base64, mediaType, prompt, attempt + 1);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Anthropic API error: ${res.status}`);
  }

  const data = await res.json();

  // ── Stop-reason guard ─────────────────────────────────────────────────────
  // If Claude hit max_tokens mid-JSON, stop_reason = 'max_tokens' and the
  // text will be truncated/invalid. Detect and raise max_tokens instead.
  const stopReason: string = data.stop_reason ?? '';
  if (stopReason === 'max_tokens') {
    throw new Error(
      'Response was cut off (max_tokens reached). ' +
      'This receipt may be too complex. Try uploading it alone.',
    );
  }

  const text: string = data.content?.[0]?.text ?? '';

  // Log the raw response so you can inspect it in the browser console
  console.log('[claudeClient] raw response:', text);

  // Strip markdown fences if Claude wrapped the JSON anyway
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // If the response is empty, give a specific message
  if (!cleaned) {
    throw new Error(
      'Claude returned an empty response. ' +
      'The image may be too blurry or low contrast to read.',
    );
  }

  try {
    return JSON.parse(cleaned);
  } catch (parseErr) {
    // Log the exact text that failed to parse so you can see it in DevTools
    console.error('[claudeClient] JSON.parse failed on:', cleaned);
    throw new Error(
      `Could not parse Claude's response as JSON. ` +
      `Open the browser console to see what was returned. ` +
      `Raw text: "${cleaned.slice(0, 120)}${cleaned.length > 120 ? '…' : ''}"`,
    );
  }
}

async function throttledCall(base64: string, mediaType: string, prompt: string) {
  if (callCount > 0) {
    await sleep(INTER_REQUEST_DELAY_MS);
  }
  callCount++;
  return callClaude(base64, mediaType, prompt);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function extractReceipt(file: File) {
  const base64 = await fileToBase64(file);
  return throttledCall(base64, file.type, RECEIPT_PROMPT);
}

export async function extractVoucher(file: File) {
  const base64 = await fileToBase64(file);
  return throttledCall(base64, file.type, VOUCHER_PROMPT);
}