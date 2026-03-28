# Receipt & Voucher Verifier

A Next.js application that automates the verification of financial documents for supermarkets. It uses AI to extract data from receipts and payment vouchers, cross-references them to identify discrepancies, and generates detailed PDF audit reports.

## Features

- **AI-Powered Extraction**: Automatically extract structured data from receipts and vouchers using multiple AI models
- **Smart Verification**: Cross-reference payment vouchers with supplier receipts to detect mismatches
- **Model Fallback**: Automatic fallback to different AI models if one fails (ensures reliability)
- **PDF Report Generation**: Generate comprehensive audit reports with verification results
- **File Upload Support**: Supports both image files (JPEG, PNG) and PDF documents
- **Real-time Verification**: Instant feedback on document verification status

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **AI**: OpenRouter API with multiple free models (NVIDIA, Mistral, Google Gemma)
- **PDF Generation**: PDF-lib for report creation
- **File Handling**: React Dropzone for drag-and-drop uploads

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   Copy `.env.example` to `.env.local` and fill in your values:
   ```bash
   cp .env.example .env.local
   ```
   
   Required environment variables:
   - `OPENROUTERAI_API_KEY`: Your OpenRouter API key from [openrouter.ai/keys](https://openrouter.ai/keys)
4. Run the development server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) to access the application

## Usage

1. Navigate to the verification page
2. Upload multiple supplier receipts (images or PDFs)
3. Upload a payment voucher (image or PDF)
4. Click "Verify Documents" to process the files
5. Review the verification results
6. Export a PDF audit report if needed

## API Endpoints

- `POST /api/extract-receipt` - Extract data from receipt files using OpenRouter AI models with fallback
- `POST /api/extract-voucher` - Extract data from voucher files using OpenRouter AI models with fallback
- `POST /api/export-report` - Generate PDF audit report

### AI Models (Fallback Order)

The application uses multiple free AI models from OpenRouter with automatic fallback:

1. `nvidia/nemotron-nano-12b-v2-vl:free`
2. `mistralai/mistral-small-3.1-24b-instruct:free`
3. `google/gemma-3-27b-it:free`
4. `google/gemma-3-12b-it:free`
5. `google/gemma-3-4b-it:free`

If one model fails, the next one is automatically tried.

## Project Structure

```
├── .next
app/
├── api/
│   ├── extract-receipt/
│   ├── extract-voucher/
│   └── export-report/
├── verify/
│   └── page.tsx
├── layout.tsx
├── page.tsx
└── globals.css

lib/
├── verificationEngine.ts
└── exportReport.ts
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This project is licensed under the MIT License.
