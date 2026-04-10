// lib/compressImage.ts
// Compresses an image File using a canvas before uploading.
// Uses an iterative loop — reduces quality each pass until the file
// fits under TARGET_SIZE_BYTES. Handles high-DPI phone scans reliably.
// PDFs are passed through unchanged (canvas resize not possible).

const MAX_WIDTH = 1600;         // px — enough detail for handwritten receipts
const MAX_HEIGHT = 2200;        // px
const INITIAL_QUALITY = 0.85;   // start high, step down if still too big
const QUALITY_STEP = 0.1;       // reduce by this each iteration
const MIN_QUALITY = 0.4;        // never go below this (text becomes unreadable)
const TARGET_SIZE_BYTES = 3 * 1024 * 1024;  // 3MB — safe for Claude's 4.5MB base64 limit
const COMPRESS_THRESHOLD = 3 * 1024 * 1024; // only compress if file exceeds 3MB

/**
 * Loads an image File into an HTMLImageElement.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

/**
 * Renders an image onto a canvas at the given dimensions and returns
 * a Blob at the specified JPEG quality.
 */
function renderToBlob(img: HTMLImageElement, width: number, height: number, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { resolve(null); return; }
    ctx.fillStyle = '#ffffff'; // white bg for transparent PNGs
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });
}

/**
 * Compresses a receipt/voucher image before upload.
 * Iterates through quality levels until the result is under TARGET_SIZE_BYTES.
 * Returns the original File if it's a PDF or already small enough.
 */
export async function compressImage(file: File): Promise<File> {
  // Pass PDFs through — canvas can't decode them
  if (file.type === 'application/pdf') return file;

  // Pass through non-images
  if (!file.type.startsWith('image/')) return file;

  // Skip compression entirely if already small enough
  if (file.size <= COMPRESS_THRESHOLD) {
    console.log(`[compressImage] ${file.name}: ${(file.size / 1024 / 1024).toFixed(2)}MB — skipped (under threshold)`);
    return file;
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    console.warn(`[compressImage] Could not load ${file.name}, passing original`);
    return file;
  }

  // Scale down dimensions preserving aspect ratio
  let { naturalWidth: width, naturalHeight: height } = img;
  if (width > MAX_WIDTH || height > MAX_HEIGHT) {
    const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  // ── Iterative quality reduction ────────────────────────────────────────────
  let quality = INITIAL_QUALITY;
  let blob: Blob | null = null;

  while (quality >= MIN_QUALITY) {
    blob = await renderToBlob(img, width, height, quality);

    if (!blob) break; // canvas unavailable — fall through to original

    console.log(
      `[compressImage] ${file.name}: ` +
      `${(file.size / 1024 / 1024).toFixed(2)}MB → ` +
      `${(blob.size / 1024 / 1024).toFixed(2)}MB ` +
      `(${width}×${height}px, q=${quality.toFixed(2)})`
    );

    if (blob.size <= TARGET_SIZE_BYTES) break; // ✓ fits — done

    quality = Math.round((quality - QUALITY_STEP) * 100) / 100;
  }

  if (!blob || blob.size > TARGET_SIZE_BYTES) {
    // Last resort: halve the dimensions and try once more at MIN_QUALITY
    console.warn(`[compressImage] ${file.name}: still too large after quality steps — halving dimensions`);
    width = Math.round(width / 2);
    height = Math.round(height / 2);
    blob = await renderToBlob(img, width, height, MIN_QUALITY);
  }

  if (!blob) {
    console.warn(`[compressImage] ${file.name}: canvas failed — passing original`);
    return file;
  }

  return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

/**
 * Compresses an array of files. Runs sequentially to avoid
 * spawning too many canvases at once on mobile devices.
 */
export async function compressImages(files: File[]): Promise<File[]> {
  const results: File[] = [];
  for (const file of files) {
    results.push(await compressImage(file));
  }
  return results;
}