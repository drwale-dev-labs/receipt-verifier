// lib/compressImage.ts
//
// WHY THIS EXISTS:
// Vercel's infrastructure enforces a 4.5MB hard limit on ALL incoming request
// bodies regardless of Next.js config. This fires BEFORE your route handler runs,
// returning a 413 with no way to catch it server-side.
//
// The only fix is to guarantee the file is under TARGET_BYTES before fetch().
// This function iterates — reducing quality, then dimensions — until it fits.
// It VERIFIES the output size before returning, unlike a single-pass approach.

const TARGET_BYTES = 3.5 * 1024 * 1024;  // 3.5MB — safe margin under Vercel's 4.5MB cap
const MAX_DIMENSION = 1800;               // start here, halve if needed
const QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]; // step through these

function toBlob(img: HTMLImageElement, w: number, h: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { reject(new Error('Canvas 2D context unavailable')); return; }
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null')),
      'image/jpeg',
      quality,
    );
  });
}

function scaleDimensions(srcW: number, srcH: number, maxDim: number): { w: number; h: number } {
  if (srcW <= maxDim && srcH <= maxDim) return { w: srcW, h: srcH };
  const ratio = maxDim / Math.max(srcW, srcH);
  return { w: Math.round(srcW * ratio), h: Math.round(srcH * ratio) };
}

export async function compressImage(file: File): Promise<File> {
  if (file.type === 'application/pdf') return file;
  if (!file.type.startsWith('image/')) return file;

  if (file.size <= TARGET_BYTES) {
    console.log(`[compress] ${file.name} — ${mb(file.size)} — under limit, skipped`);
    return file;
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    const url = URL.createObjectURL(file);
    el.onload  = () => { URL.revokeObjectURL(url); resolve(el); };
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Failed to load image: ${file.name}`)); };
    el.src = url;
  });

  // Try progressively more aggressive settings
  const dimensionCaps = [MAX_DIMENSION, Math.round(MAX_DIMENSION / 1.5), Math.round(MAX_DIMENSION / 2)];

  for (const maxDim of dimensionCaps) {
    const { w, h } = scaleDimensions(img.naturalWidth, img.naturalHeight, maxDim);

    for (const quality of QUALITIES) {
      let blob: Blob;
      try {
        blob = await toBlob(img, w, h, quality);
      } catch {
        continue;
      }

      console.log(`[compress] ${file.name}: ${mb(file.size)} → ${mb(blob.size)} (${w}×${h}, q=${quality}) ${blob.size <= TARGET_BYTES ? '✓' : '✗'}`);

      if (blob.size <= TARGET_BYTES) {
        return new File(
          [blob],
          file.name.replace(/\.[^.]+$/, '.jpg'),
          { type: 'image/jpeg', lastModified: Date.now() },
        );
      }
    }
  }

  throw new Error(
    `Could not compress "${file.name}" (${mb(file.size)}) below ${mb(TARGET_BYTES)}. ` +
    `Please resize the image manually before uploading.`,
  );
}

export async function compressImages(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) out.push(await compressImage(f));
  return out;
}

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}