// lib/exportReport.ts
import { PDFDocument, rgb, StandardFonts, PDFPage } from 'pdf-lib';
import { VerificationResult } from './verificationEngine';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const LINE_HEIGHT = 16;
const MIN_Y = 80;

// ₦ cannot be encoded by WinAnsi (Helvetica/standard PDF fonts).
// We use "NGN" prefix instead — clear, professional, no encoding errors.
function naira(amount: number): string {
  return `NGN ${amount.toLocaleString()}`;
}

function createPageContext(pdfDoc: PDFDocument) {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - 60;
  return { page, y };
}

function ensureSpace(
  pdfDoc: PDFDocument,
  ctx: { page: PDFPage; y: number },
  needed = LINE_HEIGHT
) {
  if (ctx.y - needed < MIN_Y) {
    ctx.page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    ctx.y = PAGE_HEIGHT - 60;
  }
}

export async function generateAuditReport(result: VerificationResult) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const ctx = createPageContext(pdfDoc);

  const statusColor =
    result.status === 'PASS'
      ? rgb(0, 0.6, 0)
      : result.status === 'WARNING'
      ? rgb(0.8, 0.5, 0)
      : rgb(0.8, 0, 0);

  // ── Header ──────────────────────────────────────────────────────────
  ctx.page.drawText('LEAD SUPERSTORE', {
    x: MARGIN, y: ctx.y, size: 16, font: boldFont, color: rgb(0.05, 0.25, 0.55),
  });
  ctx.y -= 18;

  ctx.page.drawText('Payment Verification Report', {
    x: MARGIN, y: ctx.y, size: 11, font, color: rgb(0.4, 0.4, 0.4),
  });
  ctx.page.drawText(
    `Generated: ${new Date().toLocaleDateString('en-NG', { dateStyle: 'long' })}`,
    { x: PAGE_WIDTH - MARGIN - 160, y: ctx.y, size: 9, font, color: rgb(0.5, 0.5, 0.5) }
  );
  ctx.y -= 6;

  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
    thickness: 1.5,
    color: rgb(0.05, 0.25, 0.55),
  });
  ctx.y -= 24;

  // ── Status Banner ───────────────────────────────────────────────────
  ctx.page.drawRectangle({
    x: MARGIN, y: ctx.y - 28,
    width: PAGE_WIDTH - MARGIN * 2, height: 36,
    color: result.status === 'PASS' ? rgb(0.9, 1, 0.92)
         : result.status === 'WARNING' ? rgb(1, 0.97, 0.88)
         : rgb(1, 0.92, 0.92),
    borderColor: statusColor,
    borderWidth: 1,
  });
  ctx.page.drawText(`STATUS: ${result.status}`, {
    x: MARGIN + 12, y: ctx.y - 14, size: 12, font: boldFont, color: statusColor,
  });
  ctx.page.drawText(result.summary, {
    x: MARGIN + 100, y: ctx.y - 14, size: 9, font, color: rgb(0.3, 0.3, 0.3),
  });
  ctx.y -= 52;

  // ── Grand Total Section ─────────────────────────────────────────────
  ensureSpace(pdfDoc, ctx, 90);
  ctx.page.drawText('Grand Total Reconciliation', {
    x: MARGIN, y: ctx.y, size: 11, font: boldFont, color: rgb(0.1, 0.1, 0.1),
  });
  ctx.y -= 20;

  const col = (PAGE_WIDTH - MARGIN * 2) / 3;
  const totals = [
    { label: 'Voucher Total',  value: naira(result.grandTotalCheck.voucherTotal) },
    { label: 'Receipts Total', value: naira(result.grandTotalCheck.receiptsTotal) },
    {
      label: 'Difference',
      value: naira(result.grandTotalCheck.difference),
      color: result.grandTotalCheck.difference === 0 ? rgb(0, 0.6, 0) : rgb(0.8, 0, 0),
    },
  ];

  totals.forEach((t, i) => {
    const x = MARGIN + i * col;
    ctx.page.drawRectangle({ x, y: ctx.y - 34, width: col - 8, height: 42, color: rgb(0.97, 0.97, 0.97) });
    ctx.page.drawText(t.label, { x: x + 8, y: ctx.y - 10, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
    ctx.page.drawText(t.value, { x: x + 8, y: ctx.y - 26, size: 11, font: boldFont, color: t.color ?? rgb(0.1, 0.1, 0.1) });
  });
  ctx.y -= 58;

  // ── Discrepancies ───────────────────────────────────────────────────
  if (result.discrepancies.length > 0) {
    ensureSpace(pdfDoc, ctx, 30);
    ctx.page.drawText('Discrepancies Found', {
      x: MARGIN, y: ctx.y, size: 11, font: boldFont, color: rgb(0.75, 0.1, 0.1),
    });
    ctx.y -= 18;

    for (const d of result.discrepancies) {
      ensureSpace(pdfDoc, ctx, LINE_HEIGHT + 4);
      const dotColor = d.severity === 'HIGH' ? rgb(0.8, 0, 0) : rgb(0.85, 0.55, 0);
      ctx.page.drawCircle({ x: MARGIN + 5, y: ctx.y - 4, size: 3, color: dotColor });
      const label = `[${d.type}] ${d.message}`;
      const display = label.length > 90 ? label.substring(0, 90) + '...' : label;
      ctx.page.drawText(display, {
        x: MARGIN + 14, y: ctx.y - 8, size: 8.5, font, color: rgb(0.2, 0.2, 0.2),
      });
      ctx.y -= LINE_HEIGHT + 2;
    }
    ctx.y -= 10;
  }

  // ── Verified Matches ────────────────────────────────────────────────
  if (result.matches.length > 0) {
    ensureSpace(pdfDoc, ctx, 30);
    ctx.page.drawText('Verified Matches', {
      x: MARGIN, y: ctx.y, size: 11, font: boldFont, color: rgb(0, 0.55, 0.2),
    });
    ctx.y -= 18;

    for (const m of result.matches) {
      ensureSpace(pdfDoc, ctx, LINE_HEIGHT + 4);
      ctx.page.drawText('OK', { x: MARGIN + 3, y: ctx.y - 8, size: 8, font: boldFont, color: rgb(0, 0.6, 0.2) });
      const label = `${m.entry.account_name}  |  ${m.entry.bank}  |  Acct: ${m.entry.account_number}  |  ${naira(m.entry.amount)}`;
      ctx.page.drawText(label, {
        x: MARGIN + 22, y: ctx.y - 8, size: 8.5, font, color: rgb(0.15, 0.15, 0.15),
      });
      ctx.y -= LINE_HEIGHT + 2;
    }
    ctx.y -= 10;
  }

  // ── Footer on every page ────────────────────────────────────────────
  const pages = pdfDoc.getPages();
  pages.forEach((p, idx) => {
    p.drawLine({
      start: { x: MARGIN, y: 55 },
      end: { x: PAGE_WIDTH - MARGIN, y: 55 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    p.drawText('Lead Superstore - Confidential Audit Report', {
      x: MARGIN, y: 42, size: 7.5, font, color: rgb(0.6, 0.6, 0.6),
    });
    p.drawText(`Page ${idx + 1} of ${pages.length}`, {
      x: PAGE_WIDTH - MARGIN - 50, y: 42, size: 7.5, font, color: rgb(0.6, 0.6, 0.6),
    });
  });

  return await pdfDoc.save();
}

// // lib/exportReport.ts
// import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
// import { VerificationResult } from './verificationEngine';

// export async function generateAuditReport(result: VerificationResult) {
//   const pdfDoc = await PDFDocument.create();
//   const page = pdfDoc.addPage([595, 842]); // A4
//   const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
//   const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
//   let y = 780;
  
//   // Header
//   page.drawText('LEAD SUPERSTORE — PAYMENT VERIFICATION REPORT', {
//     x: 50, y, size: 14, font: boldFont,
//     color: rgb(0, 0, 0.7)
//   });
  
//   y -= 30;
//   page.drawText(`Status: ${result.status}`, {
//     x: 50, y, size: 12, font,
//     color: result.status === 'PASS' ? rgb(0, 0.6, 0) : result.status === 'WARNING' ? rgb(0.8, 0.6, 0) : rgb(0.8, 0, 0)
//   });
  
//   y -= 20;
//   page.drawText(`Summary: ${result.summary}`, {
//     x: 50, y, size: 10, font
//   });
  
//   y -= 40;
  
//   // Grand Total Section
//   page.drawText('Grand Total Reconciliation', {
//     x: 50, y, size: 12, font: boldFont
//   });
  
//   y -= 20;
//   page.drawText(`Voucher Total: ₦${result.grandTotalCheck.voucherTotal.toLocaleString()}`, {
//     x: 50, y, size: 10, font
//   });
  
//   y -= 15;
//   page.drawText(`Receipts Total: ₦${result.grandTotalCheck.receiptsTotal.toLocaleString()}`, {
//     x: 50, y, size: 10, font
//   });
  
//   y -= 15;
//   page.drawText(`Difference: ₦${result.grandTotalCheck.difference.toLocaleString()} (${result.grandTotalCheck.status})`, {
//     x: 50, y, size: 10, font,
//     color: result.grandTotalCheck.difference === 0 ? rgb(0, 0.6, 0) : rgb(0.8, 0, 0)
//   });
  
//   y -= 40;
  
//   // Discrepancies
//   if (result.discrepancies.length > 0) {
//     page.drawText('Discrepancies Found:', {
//       x: 50, y, size: 12, font: boldFont,
//       color: rgb(0.8, 0, 0)
//     });
    
//     y -= 20;
//     result.discrepancies.forEach((d, i) => {
//       if (y < 100) {
//         // Add new page if needed
//         const newPage = pdfDoc.addPage([595, 842]);
//         y = 780;
//       }
//       page.drawText(`${i + 1}. ${d.message}`, {
//         x: 50, y, size: 9, font
//       });
//       y -= 15;
//     });
//   }
  
//   y -= 20;
  
//   // Matches
//   if (result.matches.length > 0) {
//     page.drawText('Verified Matches:', {
//       x: 50, y, size: 12, font: boldFont,
//       color: rgb(0, 0.6, 0)
//     });
    
//     y -= 20;
//     result.matches.forEach((m, i) => {
//       if (y < 100) {
//         const newPage = pdfDoc.addPage([595, 842]);
//         y = 780;
//       }
//       page.drawText(`${i + 1}. ${m.entry.account_name} — ₦${m.entry.amount.toLocaleString()}`, {
//         x: 50, y, size: 9, font
//       });
//       y -= 15;
//     });
//   }
  
//   // Footer
//   page.drawText(`Generated on ${new Date().toLocaleDateString()}`, {
//     x: 50, y: 50, size: 8, font,
//     color: rgb(0.5, 0.5, 0.5)
//   });
  
//   return await pdfDoc.save(); // Returns Uint8Array for download
// }