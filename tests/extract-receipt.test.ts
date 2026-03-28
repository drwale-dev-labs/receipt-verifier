import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock setup ───────────────────────────────────────────────────────────────
// Anthropic is instantiated with `new Anthropic()` so the mock must be a class,
// not an arrow function. We use a proper vi.fn() class with a shared mockCreate
// so each test can control what messages.create() returns.

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(function (this: { messages: { create: typeof mockCreate } }) {
      this.messages = { create: mockCreate };
    }),
  };
});

vi.mock('next/server', () => ({
  NextRequest: class {
    constructor(public url: string, public init?: RequestInit) {}
    async formData() { return new FormData(); }
  },
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

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

function makeFile(type = 'image/jpeg') {
  return new File(['fake-image-bytes'], 'receipt.jpg', { type });
}

function makeRequest(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return { formData: async () => formData } as any;
}

function makeEmptyRequest() {
  return { formData: async () => new FormData() } as any;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/extract-receipt', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
  });

  it('returns parsed JSON from Claude on success', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(mockReceiptJSON) }],
    });

    const { POST } = await import('../app/api/extract-receipt/route');
    const response = await POST(makeRequest(makeFile()));
    const data = await response.json();

    expect(data.supplier_name).toBe('Fanice Nigeria Ltd');
    expect(data.total_amount).toBe(50000);
  });

  it('strips markdown fences from Claude response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: `\`\`\`json\n${JSON.stringify(mockReceiptJSON)}\n\`\`\`` }],
    });

    const { POST } = await import('../app/api/extract-receipt/route');
    const response = await POST(makeRequest(makeFile()));
    const data = await response.json();

    expect(data.supplier_name).toBe('Fanice Nigeria Ltd');
  });

  it('returns 500 if ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const { POST } = await import('../app/api/extract-receipt/route');
    const response = await POST(makeRequest(makeFile()));

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('returns 400 if no file is provided', async () => {
    const { POST } = await import('../app/api/extract-receipt/route');
    const response = await POST(makeEmptyRequest());

    expect(response.status).toBe(400);
  });

  it('returns 502 if Claude returns invalid JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not valid json at all' }],
    });

    const { POST } = await import('../app/api/extract-receipt/route');
    const response = await POST(makeRequest(makeFile()));

    expect(response.status).toBe(502);
  });
});