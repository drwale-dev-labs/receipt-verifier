// tests/extract-receipt.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── What changed and why ──────────────────────────────────────────────────────
// The old test imported POST from app/api/extract-receipt/route.ts, which was
// deleted when we switched to calling Anthropic directly from the browser via
// lib/claudeClient.ts. The route no longer exists so the import errored.
//
// claudeClient.ts uses the browser fetch API (not the Anthropic SDK class), so
// we mock globalThis.fetch instead of @anthropic-ai/sdk.
// ─────────────────────────────────────────────────────────────────────────────

const mockReceiptJSON = {
  supplier_name: 'Fanice Nigeria Ltd',
  invoice_number: 'INV-001',
  date: '01/03/2025',
  account_name: 'Fanice Nigeria Ltd',
  account_number: '0123456789',
  bank: 'GTBank',
  line_items: [{ description: 'Ice Cream', quantity: 10, unit_price: 5000, amount: 50000 }],
  subtotal: 50000,
  total_amount: 50000,
  amount_in_words: 'Fifty Thousand Naira Only',
  product_category: 'FANICE',
  confidence: 'HIGH',
  notes: '',
};

// Helper: build a fake Anthropic API response wrapping the given text
function makeAnthropicResponse(text: string) {
  return {
    ok: true,
    json: async () => ({
      content: [{ type: 'text', text }],
    }),
  };
}

// Helper: fake the /api/anthropic-key response
function makeKeyResponse() {
  return {
    ok: true,
    json: async () => ({ key: 'sk-ant-test-key' }),
  };
}

function makeFile(name = 'receipt.jpg', type = 'image/jpeg') {
  return new File(['fake-image-bytes'], name, { type });
}

describe('claudeClient — extractReceipt', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    // Reset module-level key cache between tests
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('fetches the key then calls Anthropic and returns parsed JSON', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeKeyResponse() as any)           // /api/anthropic-key
      .mockResolvedValueOnce(                                     // api.anthropic.com
        makeAnthropicResponse(JSON.stringify(mockReceiptJSON)) as any
      );

    const { extractReceipt } = await import('../lib/claudeClient');
    const result = await extractReceipt(makeFile());

    expect(result.supplier_name).toBe('Fanice Nigeria Ltd');
    expect(result.total_amount).toBe(50000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Second call must go to Anthropic, not our server
    const [anthropicUrl] = fetchSpy.mock.calls[1] as [string, ...unknown[]];
    expect(anthropicUrl).toContain('anthropic.com');
  });

  it('strips markdown fences from Claude response', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeKeyResponse() as any)
      .mockResolvedValueOnce(
        makeAnthropicResponse(`\`\`\`json\n${JSON.stringify(mockReceiptJSON)}\n\`\`\``) as any
      );

    const { extractReceipt } = await import('../lib/claudeClient');
    const result = await extractReceipt(makeFile());

    expect(result.supplier_name).toBe('Fanice Nigeria Ltd');
  });

  it('throws if the key endpoint fails', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, json: async () => ({}) } as any);

    const { extractReceipt } = await import('../lib/claudeClient');
    await expect(extractReceipt(makeFile())).rejects.toThrow('Failed to load API configuration');
  });

  it('throws if Anthropic returns a non-ok status', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeKeyResponse() as any)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'Invalid API key' } }),
      } as any);

    const { extractReceipt } = await import('../lib/claudeClient');
    await expect(extractReceipt(makeFile())).rejects.toThrow('Invalid API key');
  });

  it('throws if Claude returns invalid JSON', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeKeyResponse() as any)
      .mockResolvedValueOnce(
        makeAnthropicResponse('not valid json at all') as any
      );

    const { extractReceipt } = await import('../lib/claudeClient');
    await expect(extractReceipt(makeFile())).rejects.toThrow(
      'Claude returned an unreadable response'
    );
  });

  it('sends the anthropic-dangerous-direct-browser-access header', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeKeyResponse() as any)
      .mockResolvedValueOnce(
        makeAnthropicResponse(JSON.stringify(mockReceiptJSON)) as any
      );

    const { extractReceipt } = await import('../lib/claudeClient');
    await extractReceipt(makeFile());

    const [, anthropicInit] = fetchSpy.mock.calls[1] as [string, RequestInit];
    const headers = anthropicInit.headers as Record<string, string>;
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });
});