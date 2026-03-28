// lib/verificationEngine.ts

export interface VoucherEntry {
  sn: number;
  date: string;
  supplier_name: string;
  product_supplied: string;
  account_name: string;
  account_number: string;
  bank: string;
  amount: number;
}

export interface ExtractedReceipt {
  supplier_name: string;
  invoice_number?: string;
  date: string;
  account_name: string;
  account_number: string;
  bank: string;
  line_items: {
    description: string;
    quantity?: number;
    unit_price?: number;
    amount: number;
  }[];
  subtotal: number;
  total_amount: number;
  amount_in_words: string;
  product_category: string;
  confidence: string;
  notes: string;
}

export interface ExtractedVoucher {
  voucher_title: string;
  date_range: string;
  entries: VoucherEntry[];
  grand_total: number;
}

export interface MatchResult {
  entry: VoucherEntry;
  receipt: ExtractedReceipt;
  status: string;
}

export interface Discrepancy {
  type: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  voucherEntry?: VoucherEntry;
  receiptAmount?: number;
  message: string;
}

export interface VerificationResult {
  status: 'PASS' | 'FAIL' | 'WARNING';
  matches: MatchResult[];
  discrepancies: Discrepancy[];
  summary: string;
  grandTotalCheck: {
    voucherTotal: number;
    receiptsTotal: number;
    difference: number;
    status: 'MATCH' | 'MISMATCH';
  };
}

export function verifyDocuments(
  receipts: ExtractedReceipt[],
  voucher: ExtractedVoucher
): VerificationResult {
  const discrepancies: Discrepancy[] = [];
  const matches: MatchResult[] = [];

  // 1. Match each voucher entry to a receipt
  for (const entry of voucher.entries) {
    const matchedReceipt = findBestMatch(entry, receipts);
    
    if (!matchedReceipt) {
      discrepancies.push({
        type: 'MISSING_RECEIPT',
        severity: 'HIGH',
        voucherEntry: entry,
        message: `No receipt found for ${entry.account_name} - ₦${entry.amount.toLocaleString()}`
      });
      continue;
    }

    // 2. Amount check
    const amountDiff = Math.abs(matchedReceipt.total_amount - entry.amount);
    if (amountDiff > 0) {
      discrepancies.push({
        type: 'AMOUNT_MISMATCH',
        severity: amountDiff > 1000 ? 'HIGH' : 'LOW', // Allow small rounding
        voucherEntry: entry,
        receiptAmount: matchedReceipt.total_amount,
        message: `Amount mismatch: Voucher ₦${entry.amount.toLocaleString()} vs Receipt ₦${matchedReceipt.total_amount.toLocaleString()} (diff: ₦${amountDiff})`
      });
    } else {
      matches.push({ entry, receipt: matchedReceipt, status: 'AMOUNT_OK' });
    }

    // 3. Account number check
    if (matchedReceipt.account_number !== entry.account_number) {
      discrepancies.push({
        type: 'ACCOUNT_MISMATCH',
        severity: 'HIGH',
        message: `Account number mismatch for ${entry.account_name}: Voucher has ${entry.account_number}, Receipt has ${matchedReceipt.account_number}`
      });
    }

    // 4. Bank check
    if (matchedReceipt.bank?.toLowerCase() !== entry.bank?.toLowerCase()) {
      discrepancies.push({
        type: 'BANK_MISMATCH', 
        severity: 'MEDIUM',
        message: `Bank mismatch for ${entry.account_name}: ${entry.bank} vs ${matchedReceipt.bank}`
      });
    }
  }

  // 5. Grand total verification
  const receiptsTotal = receipts.reduce((sum, r) => sum + r.total_amount, 0);
  const totalDiff = Math.abs(receiptsTotal - voucher.grand_total);

  return {
    status: discrepancies.some(d => d.severity === 'HIGH') ? 'FAIL' 
          : discrepancies.length > 0 ? 'WARNING' : 'PASS',
    matches,
    discrepancies,
    grandTotalCheck: {
      voucherTotal: voucher.grand_total,
      receiptsTotal,
      difference: totalDiff,
      status: totalDiff < 1 ? 'MATCH' : 'MISMATCH'
    },
    summary: generateSummary(matches, discrepancies, totalDiff)
  };
}

function findBestMatch(voucherEntry: VoucherEntry, receipts: ExtractedReceipt[]) {
  // Match by account number first (most reliable), then by amount, then by name
  return receipts.find(r => 
    r.account_number === voucherEntry.account_number ||
    (r.total_amount === voucherEntry.amount && 
     r.account_name?.toLowerCase().includes(
       voucherEntry.account_name?.toLowerCase().split(' ')[0]
     ))
  );
}

function generateSummary(matches: MatchResult[], discrepancies: Discrepancy[], totalDiff: number): string {
  const matchCount = matches.length;
  const discrepancyCount = discrepancies.length;
  const highSeverity = discrepancies.filter(d => d.severity === 'HIGH').length;
  
  let summary = `Verification complete: ${matchCount} matches, ${discrepancyCount} discrepancies`;
  if (highSeverity > 0) {
    summary += ` (${highSeverity} high severity)`;
  }
  if (totalDiff > 0) {
    summary += `. Grand total difference: ₦${totalDiff.toLocaleString()}`;
  }
  return summary;
}