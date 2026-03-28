// app/api/health/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    anthropicKey: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing',
  });
}

// import { NextRequest, NextResponse } from 'next/server';

// // Health check endpoint to test OpenRouter connectivity
// export async function GET(req: NextRequest) {
//   const results: any = {
//     timestamp: new Date().toISOString(),
//     tests: {}
//   };

//   // Test 1: DNS Resolution
//   try {
//     console.log('[HEALTH] Testing DNS resolution for openrouter.ai...');
//     const dnsResponse = await fetch('https://1.1.1.1/dns-query?name=openrouter.ai&type=A', {
//       headers: { 'Accept': 'application/dns-json' }
//     }).then(r => r.json());
//     results.tests.dns = { status: 'ok', details: 'DNS resolution successful' };
//     console.log('[HEALTH] DNS OK');
//   } catch (error: any) {
//     results.tests.dns = { status: 'failed', error: error.message };
//     console.log('[HEALTH] DNS failed:', error.message);
//   }

//   // Test 2: Connection to OpenRouter API
//   try {
//     console.log('[HEALTH] Testing connection to OpenRouter API...');
//     const startTime = Date.now();
//     const response = await Promise.race([
//       fetch('https://openrouter.ai/api/v1/chat/completions', {
//         method: 'OPTIONS',
//         headers: { 'Authorization': `Bearer ${process.env.OPENROUTERAI_API_KEY}` }
//       }),
//       new Promise((_, reject) => 
//         setTimeout(() => reject(new Error('Timeout after 10s')), 10000)
//       )
//     ]);
//     const duration = Date.now() - startTime;
    
//     results.tests.connection = {
//       status: response ? 'ok' : 'failed',
//       responseTime: `${duration}ms`,
//       ...((response as Response) && { statusCode: (response as Response).status })
//     };
//     console.log('[HEALTH] Connection OK, response time:', duration, 'ms');
//   } catch (error: any) {
//     results.tests.connection = {
//       status: 'failed',
//       error: error.message,
//       errorCode: error.code
//     };
//     console.log('[HEALTH] Connection failed:', error.message);
//   }

//   // Test 3: API Key Validation
//   results.tests.apiKey = {
//     status: process.env.OPENROUTERAI_API_KEY ? 'configured' : 'missing',
//     keyLength: process.env.OPENROUTERAI_API_KEY?.length || 0
//   };

//   // Summary
//   const failed = Object.values(results.tests).filter((t: any) => t.status === 'failed').length;
//   results.overall = failed === 0 ? 'healthy' : `degraded (${failed} failures)`;

//   return NextResponse.json(results);
// }
