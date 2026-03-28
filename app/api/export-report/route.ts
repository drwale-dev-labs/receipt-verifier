// app/api/export-report/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { generateAuditReport } from '../../../lib/exportReport';
import { verifyDocuments } from '../../../lib/verificationEngine';

export async function POST(req: NextRequest) {
  try {
    const { receipts, voucher } = await req.json();

    if (!receipts || !voucher) {
      return NextResponse.json({ error: 'Missing receipts or voucher data' }, { status: 400 });
    }

    const verification = verifyDocuments(receipts, voucher);
    const pdfBytes = await generateAuditReport(verification);

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="audit-report-${new Date().toISOString().split('T')[0]}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating report:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}

// import { NextRequest, NextResponse } from 'next/server';
// import { generateAuditReport } from '../../../lib/exportReport';
// import { verifyDocuments } from '../../../lib/verificationEngine';

// // app/api/export-report/route.ts
// export async function POST(req: NextRequest) {
//   try {
//     const { receipts, voucher } = await req.json();
    
//     const verification = verifyDocuments(receipts, voucher);
//     const pdfBytes = await generateAuditReport(verification);
    
//     return new NextResponse(Buffer.from(pdfBytes), {
//       headers: {
//         'Content-Type': 'application/pdf',
//         'Content-Disposition': 'attachment; filename="audit-report.pdf"'
//       }
//     });
//   } catch (error) {
//     console.error('Error generating report:', error);
//     return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
//   }
// }