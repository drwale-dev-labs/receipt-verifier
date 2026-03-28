import { describe, it, expect } from 'vitest';
import { verifyDocuments } from '../lib/verificationEngine';
import type { ExtractedReceipt, ExtractedVoucher } from '../lib/verificationEngine';

// ── Fixtures ────────────────────────────────────────────────────────────────

const makeReceipt = (overrides: Partial<ExtractedReceipt> = {}): ExtractedReceipt => ({
  supplier_name: 'Fanice Nigeria Ltd',
  invoice_number: 'INV-001',
  date: '01/03/2025',
  account_name: 'Fanice Nigeria Ltd',
  account_number: '0123456789',
  bank: 'GTBank',
  line_items: [{ description: 'Ice Cream x 10', quantity: 10, unit_price: 5000, amount: 50000 }],
  subtotal: 50000,
  total_amount: 50000,
  amount_in_words: 'Fifty Thousand Naira Only',
  product_category: 'FANICE',
  confidence: 'HIGH',
  notes: '',
  ...overrides,
});

const makeVoucher = (overrides: Partial<ExtractedVoucher> = {}): ExtractedVoucher => ({
  voucher_title: 'March 2025 Payment Voucher',
  date_range: '01/03/2025 - 31/03/2025',
  entries: [
    {
      sn: 1,
      date: '01/03/2025',
      supplier_name: 'Fanice Nigeria Ltd',
      product_supplied: 'Ice Cream',
      account_name: 'Fanice Nigeria Ltd',
      account_number: '0123456789',
      bank: 'GTBank',
      amount: 50000,
    },
  ],
  grand_total: 50000,
  ...overrides,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('verifyDocuments', () => {
  it('returns PASS when receipt matches voucher exactly', () => {
    const result = verifyDocuments([makeReceipt()], makeVoucher());

    expect(result.status).toBe('PASS');
    expect(result.matches).toHaveLength(1);
    expect(result.discrepancies).toHaveLength(0);
    expect(result.grandTotalCheck.status).toBe('MATCH');
    expect(result.grandTotalCheck.difference).toBe(0);
  });

  it('returns FAIL when no receipt matches a voucher entry', () => {
    const result = verifyDocuments([], makeVoucher());

    expect(result.status).toBe('FAIL');
    expect(result.discrepancies.some(d => d.type === 'MISSING_RECEIPT')).toBe(true);
    expect(result.discrepancies[0].severity).toBe('HIGH');
  });

  it('detects HIGH severity amount mismatch > ₦1000', () => {
    const receipt = makeReceipt({ total_amount: 45000 }); // ₦5000 short
    const result = verifyDocuments([receipt], makeVoucher());

    const mismatch = result.discrepancies.find(d => d.type === 'AMOUNT_MISMATCH');
    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).toBe('HIGH');
    expect(result.status).toBe('FAIL');
  });

  it('detects LOW severity amount mismatch <= ₦1000 (rounding)', () => {
    const receipt = makeReceipt({ total_amount: 49500 }); // ₦500 diff
    const result = verifyDocuments([receipt], makeVoucher());

    const mismatch = result.discrepancies.find(d => d.type === 'AMOUNT_MISMATCH');
    expect(mismatch?.severity).toBe('LOW');
    expect(result.status).toBe('WARNING');
  });

  it('detects account number mismatch', () => {
    const receipt = makeReceipt({ account_number: '9999999999' });
    const result = verifyDocuments([receipt], makeVoucher());

    expect(result.discrepancies.some(d => d.type === 'ACCOUNT_MISMATCH')).toBe(true);
  });

  it('detects bank mismatch (case-insensitive)', () => {
    const receipt = makeReceipt({ bank: 'zenith bank' });
    // Match by account number so it gets to bank check
    const result = verifyDocuments([receipt], makeVoucher());

    expect(result.discrepancies.some(d => d.type === 'BANK_MISMATCH')).toBe(true);
  });

  it('grand total MISMATCH when receipts sum differs from voucher', () => {
    const voucher = makeVoucher({ grand_total: 100000 }); // expects 100k
    const receipt = makeReceipt({ total_amount: 50000 });  // only 50k
    const result = verifyDocuments([receipt], voucher);

    expect(result.grandTotalCheck.status).toBe('MISMATCH');
    expect(result.grandTotalCheck.difference).toBe(50000);
  });

  it('handles multiple receipts and multiple voucher entries', () => {
    const receipts = [
      makeReceipt({ account_number: '0000000001', total_amount: 30000 }),
      makeReceipt({ account_number: '0000000002', total_amount: 70000 }),
    ];
    const voucher = makeVoucher({
      entries: [
        {
          sn: 1,
          date: '01/03/2025',
          supplier_name: 'Supplier A',
          product_supplied: 'Goods A',
          account_name: 'Supplier A',
          account_number: '0000000001',
          bank: 'GTBank',
          amount: 30000,
        },
        {
          sn: 2,
          date: '02/03/2025',
          supplier_name: 'Supplier B',
          product_supplied: 'Goods B',
          account_name: 'Supplier B',
          account_number: '0000000002',
          bank: 'GTBank',
          amount: 70000,
        },
      ],
      grand_total: 100000,
    });

    const result = verifyDocuments(receipts, voucher);
    expect(result.status).toBe('PASS');
    expect(result.matches).toHaveLength(2);
    expect(result.grandTotalCheck.status).toBe('MATCH');
  });

  it('summary string contains match and discrepancy counts', () => {
    const result = verifyDocuments([makeReceipt()], makeVoucher());
    expect(result.summary).toMatch(/1 match/i);
    expect(result.summary).toMatch(/0 discrepanc/i);
  });
});