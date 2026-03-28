import { describe, it, expect } from 'vitest';
import { generateAuditReport } from '../lib/exportReport';
import type { VerificationResult } from '../lib/verificationEngine';

const makeResult = (overrides: Partial<VerificationResult> = {}): VerificationResult => ({
  status: 'PASS',
  summary: 'Verification complete: 1 matches, 0 discrepancies',
  matches: [
    {
      entry: {
        sn: 1,
        date: '01/03/2025',
        supplier_name: 'Fanice Nigeria Ltd',
        product_supplied: 'Ice Cream',
        account_name: 'Fanice Nigeria Ltd',
        account_number: '0123456789',
        bank: 'GTBank',
        amount: 50000,
      },
      receipt: {} as any,
      status: 'AMOUNT_OK',
    },
  ],
  discrepancies: [],
  grandTotalCheck: {
    voucherTotal: 50000,
    receiptsTotal: 50000,
    difference: 0,
    status: 'MATCH',
  },
  ...overrides,
});

describe('generateAuditReport', () => {
  it('returns a non-empty Uint8Array (valid PDF bytes)', async () => {
    const bytes = await generateAuditReport(makeResult());
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it('PDF starts with %PDF magic bytes', async () => {
    const bytes = await generateAuditReport(makeResult());
    const header = String.fromCharCode(...bytes.slice(0, 4));
    expect(header).toBe('%PDF');
  });

  it('generates PDF for FAIL status with discrepancies', async () => {
    const result = makeResult({
      status: 'FAIL',
      matches: [],
      discrepancies: [
        {
          type: 'MISSING_RECEIPT',
          severity: 'HIGH',
          message: 'No receipt found for Fanice Nigeria Ltd - ₦50,000',
        },
        {
          type: 'AMOUNT_MISMATCH',
          severity: 'LOW',
          message: 'Amount mismatch: Voucher ₦50,000 vs Receipt ₦49,500',
        },
      ],
      grandTotalCheck: {
        voucherTotal: 50000,
        receiptsTotal: 0,
        difference: 50000,
        status: 'MISMATCH',
      },
    });

    const bytes = await generateAuditReport(result);
    expect(bytes.length).toBeGreaterThan(1000);
    const header = String.fromCharCode(...bytes.slice(0, 4));
    expect(header).toBe('%PDF');
  });

  it('generates PDF for WARNING status', async () => {
    const result = makeResult({
      status: 'WARNING',
      discrepancies: [
        { type: 'BANK_MISMATCH', severity: 'MEDIUM', message: 'Bank mismatch: GTBank vs Zenith Bank' },
      ],
    });

    const bytes = await generateAuditReport(result);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it('handles many discrepancies without crashing (overflow to new page)', async () => {
    const discrepancies = Array.from({ length: 40 }, (_, i) => ({
      type: 'AMOUNT_MISMATCH',
      severity: 'HIGH' as const,
      message: `Discrepancy number ${i + 1}: some long message about a mismatch that occurred`,
    }));

    const result = makeResult({ status: 'FAIL', discrepancies, matches: [] });
    const bytes = await generateAuditReport(result);
    expect(bytes.length).toBeGreaterThan(1000);
  });
});