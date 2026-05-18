/**
 * Perceptual image hash (dHash variant) — 64 bits.
 *
 * Robust against the kinds of mutations chat apps apply to images on the wire:
 * JPEG re-compression, minor downscaling, mild color shifts. The hash is built
 * from the *shape* of the image, not its byte stream, so two pixel-different
 * files that look the same to a human collapse onto the same (or nearly the
 * same) hash.
 *
 * Algorithm:
 *   1. Decode the image and draw it into a 9×8 grayscale canvas.
 *   2. For each row, compare each pixel to its right neighbour.
 *      That's 8 comparisons × 8 rows = 64 bits.
 *   3. Each bit = 1 if left > right, else 0.
 *
 * Matching across compression noise: compare two hashes by Hamming distance.
 * Distances ≤ 10 bits (out of 64) are typically the same image — Telegram's
 * "compressed" recipe shifts ~3-6 bits in practice.
 */

const SIDE = 8;
const COLS = SIDE + 1; // 9 — one extra column to make 8 horizontal comparisons.

export type DHash = Uint8Array; // 8 bytes

export class ImageDecodeError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Decode the bytes (any browser-supported image format) and compute a dHash.
 * Returns the raw 64-bit hash plus the natural dimensions of the source.
 */
export async function computeDHash(
  bytes: Uint8Array,
  mime: string,
): Promise<{ hash: DHash; width: number; height: number }> {
  const bitmap = await decodeImage(bytes, mime);
  try {
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(COLS, SIDE)
        : (() => {
            const c = document.createElement('canvas');
            c.width = COLS;
            c.height = SIDE;
            return c;
          })();
    const ctx = (canvas as any).getContext('2d', {
      willReadFrequently: true,
    }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new ImageDecodeError('Canvas 2D context unavailable');
    // High-quality downscale so the grayscale row comparisons stay stable.
    (ctx as any).imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap as any, 0, 0, COLS, SIDE);
    const img = ctx.getImageData(0, 0, COLS, SIDE);

    const gray = new Uint8Array(COLS * SIDE);
    for (let i = 0; i < gray.length; i++) {
      const o = i * 4;
      // Rec. 709 luma — matches what most JPEG encoders use as their luminance
      // channel, so survives chroma subsampling cleanly.
      gray[i] = Math.round(
        0.2126 * img.data[o] + 0.7152 * img.data[o + 1] + 0.0722 * img.data[o + 2],
      );
    }

    const hash = new Uint8Array(8);
    for (let row = 0; row < SIDE; row++) {
      let byte = 0;
      for (let col = 0; col < SIDE; col++) {
        const left = gray[row * COLS + col];
        const right = gray[row * COLS + col + 1];
        if (left > right) byte |= 1 << (7 - col);
      }
      hash[row] = byte;
    }

    return {
      hash,
      width: (bitmap as any).width ?? 0,
      height: (bitmap as any).height ?? 0,
    };
  } finally {
    if (bitmap && typeof (bitmap as any).close === 'function') {
      (bitmap as ImageBitmap).close();
    }
  }
}

async function decodeImage(
  bytes: Uint8Array,
  mime: string,
): Promise<ImageBitmap | HTMLImageElement> {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime || 'image/*' });
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch (err) {
      // Some browsers can't decode certain formats via createImageBitmap (e.g.
      // SVG). Fall through to the HTMLImageElement path.
      void err;
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
      reject(new ImageDecodeError(`Cannot decode image (${mime || 'unknown mime'})`));
    };
    img.src = url;
  });
}

export function dhashToHex(hash: DHash): string {
  let s = '';
  for (const b of hash) s += b.toString(16).padStart(2, '0');
  return s;
}

export function dhashFromHex(s: string): DHash {
  if (s.length !== 16 || !/^[0-9a-f]+$/i.test(s)) {
    throw new Error(`Invalid dHash hex: ${s}`);
  }
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Number of differing bits between two 64-bit hashes. 0 = identical. */
export function hammingDistance(a: DHash, b: DHash): number {
  if (a.length !== b.length) return Math.max(a.length, b.length) * 8;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = a[i] ^ b[i];
    // Brian Kernighan's bit count.
    while (x) {
      x &= x - 1;
      d++;
    }
  }
  return d;
}

/**
 * Threshold below which two dHashes are considered the same image after
 * lossy transport (Telegram, WhatsApp, screenshot-then-paste, etc.).
 * Empirically: identical = 0, recompressed = 2–6, scaled+compressed ≈ 4–10,
 * different image = usually > 20.
 */
export const HAMMING_MATCH_THRESHOLD = 10;

/**
 * Find the best perceptual match for `needle` among `candidates` (passed as
 * hex strings — the canonical media-id representation). Returns the matching
 * candidate id and its distance, or null if nothing is within threshold.
 */
export function findClosestMatch(
  needle: DHash,
  candidates: Iterable<string>,
  threshold: number = HAMMING_MATCH_THRESHOLD,
): { id: string; distance: number } | null {
  let best: { id: string; distance: number } | null = null;
  for (const id of candidates) {
    let candidateHash: DHash;
    try {
      candidateHash = dhashFromHex(id);
    } catch {
      continue;
    }
    const d = hammingDistance(needle, candidateHash);
    if (d <= threshold && (best === null || d < best.distance)) {
      best = { id, distance: d };
      if (d === 0) break;
    }
  }
  return best;
}
