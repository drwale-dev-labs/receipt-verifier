// app/verify/page.tsx
'use client';
import { useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { verifyDocuments, VerificationResult, ExtractedReceipt, ExtractedVoucher } from '../../lib/verificationEngine';

export default function VerifyPage() {
  const [receipts, setReceipts] = useState<File[]>([]);
  const [voucher, setVoucher] = useState<File | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState('');

  // Cache extracted data so export doesn't re-extract
  const cachedReceiptData = useRef<ExtractedReceipt[] | null>(null);
  const cachedVoucherData = useRef<ExtractedVoucher | null>(null);

  const removeReceipt = (index: number) => {
    setReceipts(prev => prev.filter((_, i) => i !== index));
    setResult(null);
    cachedReceiptData.current = null;
    cachedVoucherData.current = null;
  };

  const removeVoucher = () => {
    setVoucher(null);
    setResult(null);
    cachedReceiptData.current = null;
    cachedVoucherData.current = null;
  };

  const clearAllFiles = () => {
    setReceipts([]);
    setVoucher(null);
    setResult(null);
    cachedReceiptData.current = null;
    cachedVoucherData.current = null;
  };

  const processFiles = async () => {
    if (!voucher || receipts.length === 0) return;
    setLoading(true);
    setProgress('Extracting receipts with Claude AI…');

    try {
      const receiptData: ExtractedReceipt[] = await Promise.all(
        receipts.map((file, i) => {
          setProgress(`Extracting receipt ${i + 1} of ${receipts.length}…`);
          return extractReceipt(file);
        })
      );

      setProgress('Extracting payment voucher…');
      const voucherData: ExtractedVoucher = await extractVoucher(voucher);

      setProgress('Running verification…');
      const verification = verifyDocuments(receiptData, voucherData);

      // Cache for export
      cachedReceiptData.current = receiptData;
      cachedVoucherData.current = voucherData;

      setResult(verification);
      setProgress('');
    } catch (error: any) {
      console.error('Error processing files:', error);
      alert(`Error processing files: ${error.message}`);
      setProgress('');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!result) return;
    setExporting(true);

    try {
      // Use cached data — no re-extraction
      const receiptsPayload = cachedReceiptData.current;
      const voucherPayload = cachedVoucherData.current;

      if (!receiptsPayload || !voucherPayload) {
        alert('Please verify documents first before exporting.');
        return;
      }

      const response = await fetch('/api/export-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipts: receiptsPayload, voucher: voucherPayload }),
      });

      if (!response.ok) throw new Error('Failed to export report');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-report-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error('Error exporting report:', error);
      alert(`Error exporting report: ${error.message}`);
    } finally {
      setExporting(false);
    }
  };

  const canVerify = voucher && receipts.length > 0 && !loading;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Nav */}
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
          <p className="text-slate-500 text-sm">Upload supplier receipts and a payment voucher to run an AI-powered audit.</p>
        </div>

        {/* Upload Grid */}
        <div className="grid grid-cols-2 gap-5 mb-5">
          <DropZone
            label="Supplier Receipts"
            hint="Upload one or more receipts (JPG, PNG, PDF)"
            onDrop={(files) => { setReceipts(files); setResult(null); cachedReceiptData.current = null; }}
            multiple
          />
          <DropZone
            label="Payment Voucher"
            hint="Upload a single voucher document"
            onDrop={(files) => { setVoucher(files[0]); setResult(null); cachedVoucherData.current = null; }}
          />
        </div>

        {/* File Lists */}
        {(receipts.length > 0 || voucher) && (
          <div className="grid grid-cols-2 gap-5 mb-6">
            <FileList title="Receipts" files={receipts} onRemove={removeReceipt} />
            <FileList title="Voucher" files={voucher ? [voucher] : []} onRemove={removeVoucher} />
          </div>
        )}

        {/* Action Bar */}
        <div className="flex gap-3 items-center">
          {(receipts.length > 0 || voucher) && (
            <button
              onClick={clearAllFiles}
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
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner /> {progress || 'Verifying…'}
              </span>
            ) : (
              'Verify Documents'
            )}
          </button>

          {result && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="px-5 py-2.5 rounded-lg font-medium text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all disabled:opacity-60"
            >
              {exporting ? (
                <span className="flex items-center gap-2"><Spinner /> Exporting…</span>
              ) : (
                '↓ Export PDF'
              )}
            </button>
          )}
        </div>

        {/* Results */}
        {result && (
          <div className="mt-8">
            <VerificationResults result={result} />
          </div>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

function DropZone({
  label,
  hint,
  onDrop,
  multiple = false,
}: {
  label: string;
  hint: string;
  onDrop: (files: File[]) => void;
  multiple?: boolean;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png'],
      'application/pdf': ['.pdf'],
    },
  });

  return (
    <div
      {...getRootProps()}
      className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
        isDragActive
          ? 'border-blue-500 bg-blue-50'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <input {...getInputProps()} />
      <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center text-xl">
        📂
      </div>
      <p className="font-semibold text-slate-800 text-sm mb-1">{label}</p>
      <p className="text-xs text-slate-400">{isDragActive ? 'Drop here…' : hint}</p>
    </div>
  );
}

function FileList({
  title,
  files,
  onRemove,
}: {
  title: string;
  files: File[];
  onRemove?: (index: number) => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        {title} ({files.length})
      </p>
      <div className="space-y-2">
        {files.map((file, index) => (
          <div key={index} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg">{file.type.includes('pdf') ? '📄' : '🖼️'}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate max-w-48">{file.name}</p>
                <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
            {onRemove && (
              <button
                onClick={() => onRemove(index)}
                className="ml-2 text-slate-400 hover:text-red-500 transition-colors text-sm flex-shrink-0"
                title="Remove"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function VerificationResults({ result }: { result: VerificationResult }) {
  const statusConfig = {
    PASS: { bg: 'bg-emerald-50', border: 'border-emerald-500', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
    FAIL: { bg: 'bg-red-50', border: 'border-red-500', text: 'text-red-700', badge: 'bg-red-100 text-red-700' },
    WARNING: { bg: 'bg-amber-50', border: 'border-amber-500', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
  }[result.status];

  return (
    <div className="space-y-5">
      {/* Status Banner */}
      <div className={`p-5 rounded-xl border-2 ${statusConfig.bg} ${statusConfig.border}`}>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusConfig.badge}`}>
            {result.status}
          </span>
          <p className={`font-semibold ${statusConfig.text}`}>{result.summary}</p>
        </div>
      </div>

      {/* Grand Total Grid */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Grand Total Reconciliation</p>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Voucher Total', value: result.grandTotalCheck.voucherTotal, color: '' },
            { label: 'Receipts Total', value: result.grandTotalCheck.receiptsTotal, color: '' },
            {
              label: 'Difference',
              value: result.grandTotalCheck.difference,
              color: result.grandTotalCheck.difference > 0 ? 'text-red-600' : 'text-emerald-600',
            },
          ].map((item) => (
            <div key={item.label} className="bg-slate-50 rounded-lg p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">{item.label}</p>
              <p className={`text-lg font-bold ${item.color || 'text-slate-900'}`}>
                ₦{item.value.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Discrepancies */}
      {result.discrepancies.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Discrepancies ({result.discrepancies.length})
          </p>
          <div className="space-y-2">
            {result.discrepancies.map((d, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${
                  d.severity === 'HIGH'
                    ? 'border-red-500 bg-red-50'
                    : d.severity === 'MEDIUM'
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-yellow-400 bg-yellow-50'
                }`}
              >
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 ${
                    d.severity === 'HIGH' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {d.severity}
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-700">{d.type}</p>
                  <p className="text-sm text-slate-600">{d.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Matches */}
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

// ── API helpers ─────────────────────────────────────────────────────────────

async function extractReceipt(file: File): Promise<ExtractedReceipt> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/extract-receipt', { method: 'POST', body: formData });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to extract receipt');
  }
  return response.json();
}

async function extractVoucher(file: File): Promise<ExtractedVoucher> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/extract-voucher', { method: 'POST', body: formData });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to extract voucher');
  }
  return response.json();
}



// // app/verify/page.tsx
// 'use client';
// import { useState } from 'react';
// import { useDropzone } from 'react-dropzone';
// import { verifyDocuments, VerificationResult, ExtractedReceipt, ExtractedVoucher } from '../../lib/verificationEngine';

// export default function VerifyPage() {
//   const [receipts, setReceipts] = useState<File[]>([]);
//   const [voucher, setVoucher] = useState<File | null>(null);
//   const [result, setResult] = useState<VerificationResult | null>(null);
//   const [loading, setLoading] = useState(false);

//   const removeReceipt = (index: number) => {
//     setReceipts(receipts.filter((_, i) => i !== index));
//   };

//   const removeVoucher = () => {
//     setVoucher(null);
//   };

//   const clearAllFiles = () => {
//     setReceipts([]);
//     setVoucher(null);
//     setResult(null);
//   };

//   const processFiles = async () => {
//     if (!voucher || receipts.length === 0) return;
    
//     setLoading(true);
    
//     try {
//       // Extract all receipts in parallel
//       const receiptData: ExtractedReceipt[] = await Promise.all(
//         receipts.map(file => extractReceipt(file))
//       );
      
//       const voucherData: ExtractedVoucher = await extractVoucher(voucher);
//       const verification = verifyDocuments(receiptData, voucherData);
      
//       setResult(verification);
//     } catch (error) {
//       console.error('Error processing files:', error);
//       alert('Error processing files. Please try again.');
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <div className="max-w-6xl mx-auto p-6">
//       <h1 className="text-2xl font-bold mb-6">
//         Receipt & Voucher Verification
//       </h1>
      
//       {/* Upload Zones */}
//       <div className="grid grid-cols-2 gap-6 mb-6">
//         <DropZone 
//           label="Upload Supplier Receipts (Multiple)" 
//           onDrop={(files) => {
//             setReceipts(files);
//             setResult(null); // Clear previous results
//           }} 
//           multiple 
//         />
//         <DropZone 
//           label="Upload Payment Voucher" 
//           onDrop={(files: File[]) => {
//             setVoucher(files[0]);
//             setResult(null); // Clear previous results
//           }} 
//         />
//       </div>
      
//       {/* File Lists */}
//       <div className="grid grid-cols-2 gap-6 mb-6">
//         <FileList 
//           title="Uploaded Receipts" 
//           files={receipts} 
//           onRemove={removeReceipt}
//         />
//         <FileList 
//           title="Uploaded Voucher" 
//           files={voucher ? [voucher] : []} 
//           onRemove={() => removeVoucher()}
//         />
//       </div>
      
//       {/* Clear All Button */}
//       {(receipts.length > 0 || voucher) && (
//         <div className="mb-6 text-center">
//           <button
//             onClick={clearAllFiles}
//             className="bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded-lg text-sm"
//           >
//             Clear All Files
//           </button>
//         </div>
//       )}
      
//       <button onClick={processFiles} disabled={loading}
//         className="w-full bg-blue-600 text-white py-3 rounded-lg">
//         {loading ? 'Verifying...' : 'Verify Documents'}
//       </button>
      
//       {result && (
//         <button onClick={() => exportReport(result, receipts, voucher)} className="w-full bg-green-600 text-white py-3 rounded-lg mt-4">
//           Export PDF Report
//         </button>
//       )}
      
//       {/* Results Panel */}
//       {result && <VerificationResults result={result} />}
//     </div>
//   );
// }

// function VerificationResults({ result }: { result: VerificationResult }) {
//   const getStatusClasses = (status: string) => {
//     switch (status) {
//       case 'PASS': return 'bg-green-100 border-green-500';
//       case 'FAIL': return 'bg-red-100 border-red-500';
//       case 'WARNING': return 'bg-yellow-100 border-yellow-500';
//       default: return 'bg-gray-100 border-gray-500';
//     }
//   };
  
//   return (
//     <div className="mt-8 space-y-4">
//       {/* Overall Status Banner */}
//       <div className={`p-4 rounded-lg border-2 ${getStatusClasses(result.status)}`}>
//         <h2 className="text-xl font-bold">
//           Status: {result.status} — {result.summary}
//         </h2>
//       </div>
      
//       {/* Grand Total Check */}
//       <div className="bg-white border rounded-lg p-4">
//         <h3 className="font-semibold mb-2">Grand Total Reconciliation</h3>
//         <div className="grid grid-cols-3 gap-4 text-center">
//           <div>
//             <p className="text-gray-500 text-sm">Voucher Total</p>
//             <p className="text-lg font-bold">
//               ₦{result.grandTotalCheck.voucherTotal.toLocaleString()}
//             </p>
//           </div>
//           <div>
//             <p className="text-gray-500 text-sm">Receipts Total</p>
//             <p className="text-lg font-bold">
//               ₦{result.grandTotalCheck.receiptsTotal.toLocaleString()}
//             </p>
//           </div>
//           <div>
//             <p className="text-gray-500 text-sm">Difference</p>
//             <p className={`text-lg font-bold ${
//               result.grandTotalCheck.difference > 0 ? 'text-red-600' : 'text-green-600'
//             }`}>
//               ₦{result.grandTotalCheck.difference.toLocaleString()}
//             </p>
//           </div>
//         </div>
//       </div>
      
//       {/* Discrepancies */}
//       {result.discrepancies.map((d, i) => (
//         <div key={i} className={`p-3 rounded border-l-4 ${
//           d.severity === 'HIGH' ? 'border-red-500 bg-red-50' : 
//           'border-yellow-500 bg-yellow-50'
//         }`}>
//           <span className="font-medium">{d.type}:</span> {d.message}
//         </div>
//       ))}
      
//       {/* Matched Items */}
//       {result.matches.map((m, i) => (
//         <div key={i} className="p-3 rounded border-l-4 border-green-500 bg-green-50">
//           ✓ {m.entry.account_name} — ₦{m.entry.amount.toLocaleString()} verified
//         </div>
//       ))}
//     </div>
//   );
// }

// function DropZone({ label, onDrop, multiple = false }: { label: string; onDrop: (files: File[]) => void; multiple?: boolean }) {
//   const { getRootProps, getInputProps, isDragActive } = useDropzone({
//     onDrop,
//     multiple,
//     accept: {
//       'image/*': ['.jpeg', '.jpg', '.png'],
//       'application/pdf': ['.pdf']
//     }
//   });

//   return (
//     <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
//       isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
//     }`}>
//       <input {...getInputProps()} />
//       <p className="text-gray-600">{label}</p>
//       <p className="text-sm text-gray-400 mt-1">
//         {isDragActive ? 'Drop files here...' : 'Click to select or drag files here'}
//       </p>
//     </div>
//   );
// }

// function FileList({ title, files, onRemove }: { title: string; files: File[]; onRemove?: (index: number) => void }) {
//   if (files.length === 0) {
//     return (
//       <div className="bg-gray-50 rounded-lg p-4">
//         <h3 className="font-semibold text-gray-700 mb-2">{title}</h3>
//         <p className="text-gray-500 text-sm">No files uploaded yet</p>
//       </div>
//     );
//   }

//   return (
//     <div className="bg-white border rounded-lg p-4">
//       <h3 className="font-semibold text-gray-900 mb-3">{title} ({files.length})</h3>
//       <div className="space-y-2">
//         {files.map((file, index) => (
//           <div key={index} className="flex items-center justify-between bg-gray-50 rounded p-2">
//             <div className="flex items-center space-x-2">
//               <span className="text-2xl">
//                 {file.type.includes('pdf') ? '📄' : '🖼️'}
//               </span>
//               <div>
//                 <p className="text-sm font-medium text-gray-900 truncate max-w-32">
//                   {file.name}
//                 </p>
//                 <p className="text-xs text-gray-500">
//                   {(file.size / 1024 / 1024).toFixed(2)} MB
//                 </p>
//               </div>
//             </div>
//             <div className="flex items-center space-x-2">
//               <span className="text-xs text-gray-400 uppercase">
//                 {file.type.split('/')[1] || 'file'}
//               </span>
//               {onRemove && (
//                 <button
//                   onClick={() => onRemove(index)}
//                   className="text-red-500 hover:text-red-700 text-sm"
//                   title="Remove file"
//                 >
//                   ✕
//                 </button>
//               )}
//             </div>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

// async function extractReceipt(file: File) {
//   const formData = new FormData();
//   formData.append('file', file);

//   const response = await fetch('/api/extract-receipt', {
//     method: 'POST',
//     body: formData,
//   });

//   if (!response.ok) {
//     throw new Error('Failed to extract receipt');
//   }

//   return response.json();
// }

// async function extractVoucher(file: File) {
//   const formData = new FormData();
//   formData.append('file', file);

//   const response = await fetch('/api/extract-voucher', {
//     method: 'POST',
//     body: formData,
//   });

//   if (!response.ok) {
//     throw new Error('Failed to extract voucher');
//   }

//   return response.json();
// }

// async function exportReport(result: VerificationResult, receipts: File[], voucher: File | null) {
//   if (!voucher) return;
  
//   try {
//     const receiptData = await Promise.all(
//       receipts.map(file => extractReceipt(file))
//     );
    
//     const voucherData = await extractVoucher(voucher);
    
//     const response = await fetch('/api/export-report', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ receipts: receiptData, voucher: voucherData })
//     });
    
//     if (!response.ok) {
//       throw new Error('Failed to export report');
//     }
    
//     const blob = await response.blob();
//     const url = window.URL.createObjectURL(blob);
//     const a = document.createElement('a');
//     a.href = url;
//     a.download = 'audit-report.pdf';
//     document.body.appendChild(a);
//     a.click();
//     window.URL.revokeObjectURL(url);
//     document.body.removeChild(a);
//   } catch (error) {
//     console.error('Error exporting report:', error);
//     alert('Error exporting report. Please try again.');
//   }
// }