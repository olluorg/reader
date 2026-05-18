/**
 * Pre-processing pipeline for imported images: decode, downscale to a sane
 * ceiling, re-encode as WebP. Reader's content width is 680 px (≤ 1360 px
 * on retina), so anything larger is wasted bytes in IndexedDB and in the
 * share URL. WebP at quality 0.82 typically halves PNG/JPEG sizes while
 * preserving alpha — strictly a win for thumbnails, screenshots, diagrams.
 *
 * Vector inputs (SVG) are passed through unchanged: there's no meaningful
 * "raster" representation to compress.
 *
 * If the round-trip would *grow* the file (rare: already-tight JPEG smaller
 * than the WebP re-encode), the original bytes win.
 */
export interface ResizeOptions {
  /** Hard pixel ceiling. Either dimension above this triggers downscale. */
  maxDimension: number;
  /** WebP quality in [0, 1]. 0.82 is the sweet spot for photos & screenshots. */
  quality: number;
}

export interface ResizedImage {
  bytes: Uint8Array;
  mime: string;
  width: number;
  height: number;
  /** True iff bytes differ from the input (resize and/or transcode happened). */
  changed: boolean;
  originalSize: number;
  /** Reason the original was kept untouched, when applicable. */
  skippedReason?: 'svg' | 'webp-bigger' | 'decode-failed';
}

const SVG_MIME_RE = /^image\/svg(\+xml)?$/;

export async function preprocessImage(
  bytes: Uint8Array,
  mime: string,
  opts: ResizeOptions,
): Promise<ResizedImage> {
  const originalSize = bytes.length;
  // SVG is vector — no rasterisation, just hand it back.
  if (SVG_MIME_RE.test(mime)) {
    return {
      bytes,
      mime,
      width: 0,
      height: 0,
      changed: false,
      originalSize,
      skippedReason: 'svg',
    };
  }

  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await decode(bytes, mime);
  } catch {
    // Decode failed — pass through and let the upstream dHash step report
    // a friendlier error if it also can't decode.
    return {
      bytes,
      mime,
      width: 0,
      height: 0,
      changed: false,
      originalSize,
      skippedReason: 'decode-failed',
    };
  }

  try {
    const srcW = (bitmap as ImageBitmap).width;
    const srcH = (bitmap as ImageBitmap).height;
    const scale = Math.min(1, opts.maxDimension / Math.max(srcW, srcH));
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));

    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(dstW, dstH)
        : (() => {
            const c = document.createElement('canvas');
            c.width = dstW;
            c.height = dstH;
            return c;
          })();
    const ctx = (canvas as any).getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    (ctx as any).imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap as any, 0, 0, dstW, dstH);

    const blob = await canvasToBlob(canvas, 'image/webp', opts.quality);
    const out = new Uint8Array(await blob.arrayBuffer());

    // If we didn't actually shrink the dimensions AND the WebP is bigger
    // than the source (already-tight JPEG, tiny PNG), keep the original.
    const sameSize = dstW === srcW && dstH === srcH;
    if (sameSize && out.length >= originalSize) {
      return {
        bytes,
        mime,
        width: srcW,
        height: srcH,
        changed: false,
        originalSize,
        skippedReason: 'webp-bigger',
      };
    }
    return {
      bytes: out,
      mime: 'image/webp',
      width: dstW,
      height: dstH,
      changed: true,
      originalSize,
    };
  } finally {
    if ((bitmap as ImageBitmap).close) (bitmap as ImageBitmap).close();
  }
}

async function decode(bytes: Uint8Array, mime: string): Promise<ImageBitmap | HTMLImageElement> {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime || 'image/*' });
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* fall through */
    }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Cannot decode ${mime || 'image'}`));
    };
    img.src = url;
  });
}

async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return await (canvas as OffscreenCanvas).convertToBlob({ type, quality });
  }
  return await new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error(`toBlob returned null for ${type}`))),
      type,
      quality,
    );
  });
}

/**
 * Compare two LQIP `data:` URLs (whatever sizes they came in at) by drawing
 * both onto a fixed 32×32 grayscale canvas and averaging the per-pixel
 * absolute difference.
 *
 * Why: the perceptual hash (dHash) is a 64-bit summary — it's lenient by
 * design to survive recompression, which means it can occasionally match
 * unrelated images at the loose ≤10/64 Hamming threshold. Comparing the
 * actual LQIP pixels is a wholly independent signal: two pictures that
 * look the same to a human always score below ~30/255 in this metric;
 * unrelated pictures land 60+. Combine with dHash to gate file imports.
 *
 * Returns `Infinity` if either preview can't be decoded — callers should
 * treat that as "no signal, fall back to dHash alone".
 */
export async function comparePreviewDistance(
  previewA: string,
  previewB: string,
): Promise<number> {
  const [a, b] = await Promise.all([
    toGrayscaleGrid(previewA),
    toGrayscaleGrid(previewB),
  ]);
  if (!a || !b) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** Above this mean per-pixel grayscale delta, the LQIPs are different images. */
export const PREVIEW_MATCH_THRESHOLD = 55;

async function toGrayscaleGrid(dataUrl: string): Promise<Uint8Array | null> {
  try {
    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('decode failed'));
      im.src = dataUrl;
    });
    const SIDE = 32;
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(SIDE, SIDE)
        : (() => {
            const c = document.createElement('canvas');
            c.width = SIDE;
            c.height = SIDE;
            return c;
          })();
    const ctx = (canvas as any).getContext('2d', {
      willReadFrequently: true,
    }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return null;
    (ctx as any).imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, SIDE, SIDE);
    const data = ctx.getImageData(0, 0, SIDE, SIDE).data;
    const out = new Uint8Array(SIDE * SIDE);
    for (let i = 0; i < out.length; i++) {
      const o = i * 4;
      out[i] = Math.round(0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]);
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Build a tiny LQIP-style placeholder ("low-quality image placeholder") that
 * fits in a `data:` URL string and rides along inside the doc share-URL as a
 * field on MediaRef. Returns a complete `data:image/webp;base64,…` string so
 * callers can drop it straight into an `<img src>`.
 *
 * Tuning: 32px on the longest side at WebP q=0.5 typically lands in the
 * 300–600 byte range — barely visible in the URL budget, but enough for the
 * recipient to see a recognisable blurred shape at the correct aspect ratio
 * while the full image is still being loaded (or before they paste its URL).
 *
 * SVG and decode failures return null — the caller falls back to the generic
 * icon placeholder.
 */
export async function generateBlurPreview(
  bytes: Uint8Array,
  mime: string,
  opts: { maxDimension?: number; quality?: number } = {},
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (SVG_MIME_RE.test(mime)) return null;
  const maxDim = opts.maxDimension ?? 32;
  const quality = opts.quality ?? 0.5;
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await decode(bytes, mime);
  } catch {
    return null;
  }
  try {
    const srcW = (bitmap as ImageBitmap).width;
    const srcH = (bitmap as ImageBitmap).height;
    if (!srcW || !srcH) return null;
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(dstW, dstH)
        : (() => {
            const c = document.createElement('canvas');
            c.width = dstW;
            c.height = dstH;
            return c;
          })();
    const ctx = (canvas as any).getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) return null;
    (ctx as any).imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap as any, 0, 0, dstW, dstH);
    const blob = await canvasToBlob(canvas, 'image/webp', quality);
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) {
      bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    }
    return {
      dataUrl: `data:image/webp;base64,${btoa(bin)}`,
      width: srcW,
      height: srcH,
    };
  } finally {
    if ((bitmap as ImageBitmap).close) (bitmap as ImageBitmap).close();
  }
}
