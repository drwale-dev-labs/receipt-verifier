// lib/compressImage.ts
// Compresses an image File using a canvas before uploading.
// Target: ≤ 1400px wide, quality 0.82 — sharp enough for OCR, small enough for Claude.
// PDFs are passed through unchanged (no canvas resize possible).

const MAX_WIDTH = 1400;   // px — sufficient detail for handwritten receipts
const MAX_HEIGHT = 1960;  // px
const QUALITY = 0.82;     // JPEG quality
const SIZE_THRESHOLD = 2 * 1024 * 1024; // Only compress if > 2MB

/**
 * Compresses a receipt/voucher image before upload.
 * Returns the original File if it's a PDF or already small enough.
 */
export async function compressImage(file: File): Promise<File> {
  // PDFs and small images — pass through unchanged
  if (file.type === 'application/pdf' || file.size <= SIZE_THRESHOLD) {
    return file;
  }

  // Only compress actual images
  if (!file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Calculate new dimensions, preserving aspect ratio
      let { width, height } = img;
      if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Canvas not available — just return original
        resolve(file);
        return;
      }

      // White background (handles transparent PNGs gracefully)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file); // fallback to original
            return;
          }
          const compressed = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });

          console.log(
            `[compressImage] ${file.name}: ` +
            `${(file.size / 1024 / 1024).toFixed(2)}MB → ` +
            `${(compressed.size / 1024 / 1024).toFixed(2)}MB ` +
            `(${width}×${height}px)`
          );

          resolve(compressed);
        },
        'image/jpeg',
        QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // fallback
    };

    img.src = objectUrl;
  });
}

/**
 * Compresses an array of files in parallel.
 */
export async function compressImages(files: File[]): Promise<File[]> {
  return Promise.all(files.map(compressImage));
}