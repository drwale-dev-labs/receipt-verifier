'use client';
// app/verify/page.tsx
import { useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { extractReceipt, extractVoucher, resetCallCount } from '../../lib/claudeClient';
import { verifyDocuments } from '../../lib/verificationEngine';
import type { VerificationResult, ExtractedReceipt, ExtractedVoucher } from '../../lib/verificationEngine';

export default function VerifyPage() {
  const [receipts, setReceipts] = useState<File[]>([]);
  const [voucher, setVoucher] = useState<File | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cachedReceiptData = useRef<ExtractedReceipt[] | null>(null);
  const cachedVoucherData = useRef<ExtractedVoucher | null>(null);

  const reset = () => {
    setResult(null);
    setError(null);
    cachedReceiptData.current = null;
    cachedVoucherData.current = null;
  };

  const processFiles = async () => {
    if (!voucher || receipts.length === 0) return;
    resetCallCount();
    setLoading(true);
    setError(null);

    try {
      // Files are read in the browser and sent directly to api.anthropic.com.
      // They never pass through Vercel — no 4.5MB limit applies.
      const receiptData: ExtractedReceipt[] = [];
      for (let i = 0; i < receipts.length; i++) {
        setProgress(`Reading receipt ${i + 1} of ${receipts.length}…`);
        receiptData.push(await extractReceipt(receipts[i]));
      }

      setProgress('Reading payment voucher…');
      const voucherData = await extractVoucher(voucher);

      setProgress('Running verification…');
      const verification = verifyDocuments(receiptData, voucherData);

      cachedReceiptData.current = receiptData;
      cachedVoucherData.current = voucherData;
      setResult(verification);
      setProgress('');
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
      setProgress('');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!result || !cachedReceiptData.current || !cachedVoucherData.current) return;
    setExporting(true);
    try {
      const res = await fetch('/api/export-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipts: cachedReceiptData.current,
          voucher: cachedVoucherData.current,
        }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-report-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const canVerify = !!voucher && receipts.length > 0 && !loading;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center">
            <span className="text-white font-bold text-sm">LS</span>
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm leading-none">Lead Superstore</p>
            <p className="text-xs text-slate-500 leading-none mt-0.5">Audit & Verification</p>
          </div>
        </div>
        <span className="text-xs text-slate-400">Powered by Claude AI</span>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Receipt & Voucher Verification</h1>
          <p className="text-slate-500 text-sm">
            Upload supplier receipts and a payment voucher. Files up to 20MB are supported.
          </p>
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
            <span className="text-red-500 flex-shrink-0 mt-0.5">⚠</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">Something went wrong</p>
              <p className="text-sm text-red-700 mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-5 mb-5">
          <DropZone
            label="Supplier Receipts"
            hint="JPG, PNG or PDF · up to 20MB each"
            onDrop={(files) => { setReceipts(files); reset(); }}
            multiple
          />
          <DropZone
            label="Payment Voucher"
            hint="JPG, PNG or PDF · up to 20MB"
            onDrop={(files) => { setVoucher(files[0]); reset(); }}
          />
        </div>

        {(receipts.length > 0 || voucher) && (
          <div className="grid grid-cols-2 gap-5 mb-6">
            <FileList
              title="Receipts"
              files={receipts}
              onRemove={(i) => { setReceipts(p => p.filter((_, j) => j !== i)); reset(); }}
            />
            <FileList
              title="Voucher"
              files={voucher ? [voucher] : []}
              onRemove={() => { setVoucher(null); reset(); }}
            />
          </div>
        )}

        <div className="flex gap-3 items-center">
          {(receipts.length > 0 || voucher) && (
            <button
              onClick={() => { setReceipts([]); setVoucher(null); reset(); }}
              className="px-4 py-2.5 rounded-lg text-sm text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Clear All
            </button>
          )}

          <button
            onClick={processFiles}
            disabled={!canVerify}
            className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all ${
              canVerify
                ? 'bg-blue-700 hover:bg-blue-800 text-white shadow-sm'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {loading
              ? <span className="flex items-center justify-center gap-2"><Spinner />{progress || 'Verifying…'}</span>
              : 'Verify Documents'
            }
          </button>

          {result && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="px-5 py-2.5 rounded-lg font-medium text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-60"
            >
              {exporting
                ? <span className="flex items-center gap-2"><Spinner />Exporting…</span>
                : '↓ Export PDF'
              }
            </button>
          )}
        </div>

        {result && <div className="mt-8"><VerificationResults result={result} /></div>}
      </main>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

function DropZone({ label, hint, onDrop, multiple = false }: {
  label: string; hint: string; onDrop: (f: File[]) => void; multiple?: boolean;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'application/pdf': ['.pdf'],
    },
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
        isDragActive
          ? 'border-blue-500 bg-blue-50'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <input {...getInputProps()} />
      <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center text-xl">📂</div>
      <p className="font-semibold text-slate-800 text-sm mb-1">{label}</p>
      <p className="text-xs text-slate-400">{isDragActive ? 'Drop here…' : hint}</p>
    </div>
  );
}

function FileList({ title, files, onRemove }: {
  title: string; files: File[]; onRemove?: (i: number) => void;
}) {
  if (!files.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        {title} ({files.length})
      </p>
      <div className="space-y-2">
        {files.map((file, i) => (
          <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg">{file.type.includes('pdf') ? '📄' : '🖼️'}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate max-w-48">{file.name}</p>
                <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
            {onRemove && (
              <button
                onClick={() => onRemove(i)}
                className="ml-2 text-slate-400 hover:text-red-500 transition-colors text-sm flex-shrink-0"
              >✕</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function VerificationResults({ result }: { result: VerificationResult }) {
  const s = {
    PASS:    { bg: 'bg-emerald-50', border: 'border-emerald-500', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
    FAIL:    { bg: 'bg-red-50',     border: 'border-red-500',     text: 'text-red-700',     badge: 'bg-red-100 text-red-700'     },
    WARNING: { bg: 'bg-amber-50',   border: 'border-amber-500',   text: 'text-amber-700',   badge: 'bg-amber-100 text-amber-700' },
  }[result.status];

  return (
    <div className="space-y-5">
      <div className={`p-5 rounded-xl border-2 ${s.bg} ${s.border}`}>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${s.badge}`}>{result.status}</span>
          <p className={`font-semibold ${s.text}`}>{result.summary}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Grand Total Reconciliation</p>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Voucher Total',  value: result.grandTotalCheck.voucherTotal },
            { label: 'Receipts Total', value: result.grandTotalCheck.receiptsTotal },
            { label: 'Difference',     value: result.grandTotalCheck.difference,
              color: result.grandTotalCheck.difference > 0 ? 'text-red-600' : 'text-emerald-600' },
          ].map(item => (
            <div key={item.label} className="bg-slate-50 rounded-lg p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">{item.label}</p>
              <p className={`text-lg font-bold ${'color' in item ? item.color : 'text-slate-900'}`}>
                ₦{item.value.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {result.discrepancies.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Discrepancies ({result.discrepancies.length})
          </p>
          <div className="space-y-2">
            {result.discrepancies.map((d, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${
                d.severity === 'HIGH'   ? 'border-red-500 bg-red-50' :
                d.severity === 'MEDIUM' ? 'border-amber-500 bg-amber-50' :
                                          'border-yellow-400 bg-yellow-50'
              }`}>
                <span className={`text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 ${
                  d.severity === 'HIGH' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}>{d.severity}</span>
                <div>
                  <p className="text-xs font-semibold text-slate-700">{d.type}</p>
                  <p className="text-sm text-slate-600">{d.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.matches.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Verified Matches ({result.matches.length})
          </p>
          <div className="space-y-2">
            {result.matches.map((m, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border-l-4 border-emerald-500">
                <span className="text-emerald-600 font-bold text-sm">✓</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{m.entry.account_name}</p>
                  <p className="text-xs text-slate-500">{m.entry.bank} · Acct: {m.entry.account_number}</p>
                </div>
                <span className="text-sm font-bold text-emerald-700 flex-shrink-0">
                  ₦{m.entry.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}