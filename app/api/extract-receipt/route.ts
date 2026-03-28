// app/api/extract-receipt/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY environment variable is required' }, { status: 500 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString('base64');
  const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'application/pdf';

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: mediaType === 'application/pdf' ? 'document' : 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64,
              },
            } as any,
            {
              type: 'text',
              text: `You are a financial document auditor for a Nigerian supermarket business.

Extract ALL data from this supplier receipt/invoice precisely.

Return ONLY valid JSON with no markdown, no code fences, no extra text:
{
  "supplier_name": "string",
  "invoice_number": "string or null",
  "date": "DD/MM/YYYY",
  "account_name": "string",
  "account_number": "string",
  "bank": "string",
  "line_items": [
    {
      "description": "string",
      "quantity": number or null,
      "unit_price": number or null,
      "amount": number
    }
  ],
  "subtotal": number,
  "total_amount": number,
  "amount_in_words": "string",
  "product_category": "FANICE|KILISHI|PARFAIT|CARBONATED|FRUIT_SALAD|EGG|VALUES_WATER|OTHER",
  "confidence": "HIGH|MEDIUM|LOW",
  "notes": "any anomalies or unclear items"
}

For Nigerian Naira amounts, strip the ₦ symbol and return pure numbers.
If handwriting is unclear, use your best judgment and set confidence to LOW.`,
            },
          ],
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Strip any accidental markdown fences
    const cleaned = content.text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error('[extract-receipt] Error:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Failed to parse Claude response as JSON' }, { status: 502 });
    }
    return NextResponse.json(
      { error: `Failed to extract receipt: ${error.message}` },
      { status: 500 }
    );
  }
}




// // app/api/extract-receipt/route.ts
// import { NextRequest, NextResponse } from 'next/server';

// // List of OpenRouter models - prioritizing faster, more reliable ones
// const OPENROUTER_MODELS = [
//   'meta-llama/llama-2-90b-chat:free',  // Meta Llama (fast)
//   'openchat/openchat-7b:free',         // OpenChat (reliable)
//   'mistralai/mistral-7b-instruct:free', // Mistral (good quality)
// ];

// // Retry configuration
// const MAX_RETRIES = 2;
// const RETRY_DELAY = 5000; // 5s - increased for rate limits
// const REQUEST_TIMEOUT = 180000; // 180 seconds for slow models

// async function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
//   const controller = new AbortController();
//   const timeoutId = setTimeout(() => {
//     console.log(`[TIMEOUT] Request exceeded ${timeout}ms, aborting...`);
//     controller.abort();
//   }, timeout);
  
//   try {
//     console.log(`[FETCH] Starting request to OpenRouter with ${timeout}ms timeout...`);
//     const response = await fetch(url, {
//       ...options,
//       signal: controller.signal,
//       keepalive: true
//     });
//     clearTimeout(timeoutId);
//     console.log(`[FETCH] Request completed with status ${response.status}`);
//     return response;
//   } catch (error) {
//     clearTimeout(timeoutId);
//     throw error;
//   }
// }

// export async function POST(req: NextRequest) {
//   if (!process.env.OPENROUTERAI_API_KEY) {
//     return NextResponse.json({ error: 'OPENROUTERAI_API_KEY environment variable is required' }, { status: 500 });
//   }

//   const formData = await req.formData();
//   const file = formData.get('file') as File;

//   // Convert file to base64
//   const bytes = await file.arrayBuffer();
//   const base64 = Buffer.from(bytes).toString('base64');
//   const mediaType = file.type;

//   // Try each model in sequence until one works
//   for (const model of OPENROUTER_MODELS) {
//     let lastError: any = null;
    
//     for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
//       try {
//         console.log(`[${model}] Attempt ${attempt + 1}/${MAX_RETRIES + 1}`);

//         const response = await fetchWithTimeout(
//           'https://openrouter.ai/api/v1/chat/completions',
//           {
//             method: 'POST',
//             headers: {
//               'Authorization': `Bearer ${process.env.OPENROUTERAI_API_KEY}`,
//               'Content-Type': 'application/json',
//               'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
//               'X-OpenRouter-Title': 'Receipt Verifier'
//             },
//             body: JSON.stringify({
//               model: model,
//               messages: [{
//                 role: 'user',
//                 content: [
//                   {
//                     type: 'image_url',
//                     image_url: {
//                       url: `data:${mediaType};base64,${base64}`
//                     }
//                   },
//                   {
//                     type: 'text',
//                     text: `You are a financial document auditor for a Nigerian supermarket business.

// Extract ALL data from this supplier receipt/invoice precisely.

// Return ONLY valid JSON:
// {
//   "supplier_name": "string",
//   "invoice_number": "string or null",
//   "date": "DD/MM/YYYY",
//   "account_name": "string",
//   "account_number": "string",
//   "bank": "string",
//   "line_items": [
//     {
//       "description": "string",
//       "quantity": number or null,
//       "unit_price": number or null,
//       "amount": number
//     }
//   ],
//   "subtotal": number,
//   "total_amount": number,
//   "amount_in_words": "string",
//   "product_category": "FANICE|KILISHI|PARFAIT|CARBONATED|FRUIT_SALAD|EGG|VALUES_WATER|OTHER",
//   "confidence": "HIGH|MEDIUM|LOW",
//   "notes": "any anomalies or unclear items"
// }

// For Nigerian Naira amounts, strip the ₦ symbol and return pure numbers.
// If handwriting is unclear, use your best judgment and set confidence to LOW.`
//                   }
//                 ]
//               }]
//             })
//           },
//           REQUEST_TIMEOUT
//         );

//         if (!response.ok) {
//           const errorText = await response.text();
          
//           // Handle rate limiting
//           if (response.status === 429) {
//             console.warn(`[${model}] Rate limited (429), retrying in ${RETRY_DELAY}ms...`);
//             if (attempt < MAX_RETRIES) {
//               await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)));
//               continue;
//             }
//             break;
//           }
          
//           console.warn(`[${model}] HTTP ${response.status}: ${errorText.substring(0, 100)}`);
          
//           if (response.status >= 500 && attempt < MAX_RETRIES) {
//             console.log(`[${model}] Server error, retrying in ${RETRY_DELAY}ms...`);
//             await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
//             continue;
//           }
//           // Don't retry on 4xx errors (except 429 which is handled above)
//           break;
//         }

//         const data = await response.json();

//         if (data.choices && data.choices[0] && data.choices[0].message) {
//           const content = data.choices[0].message.content;

//           try {
//             const parsed = JSON.parse(content);
//             console.log(`✓ Model ${model} succeeded`);
//             return NextResponse.json(parsed);
//           } catch (parseError) {
//             console.warn(`[${model}] Invalid JSON response`);
//             break;
//           }
//         } else {
//           console.warn(`[${model}] Unexpected response format`);
//           break;
//         }

//       } catch (error: any) {
//         lastError = error;
//         const errorCode = error?.code || error?.name || 'UNKNOWN';
//         const isNetworkError = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'AbortError', 'UND_ERR_CONNECT_TIMEOUT'].some(
//           code => String(errorCode).includes(code)
//         );
        
//         console.warn(`[${model}] Error (${errorCode}): ${error?.message}`);
        
//         if (isNetworkError && attempt < MAX_RETRIES) {
//           console.log(`[${model}] Network error, retrying in ${RETRY_DELAY}ms...`);
//           await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
//           continue;
//         }
//         break;
//       }
//     }
    
//     console.log(`[${model}] Moving to next model...`);
//   }

//   // All models failed
//   return NextResponse.json({
//     error: 'All AI models failed. This could be due to: 1) OpenRouter API connectivity issues, 2) Network problems, 3) Invalid API key. Please check your OPENROUTERAI_API_KEY and try again.',
//     details: 'Try one of these: 1) Wait a few minutes and retry, 2) Check openrouter.ai status, 3) Verify your internet connection'
//   }, { status: 503 });
// }