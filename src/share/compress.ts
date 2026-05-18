import type { Bytes } from './base64';

export const COMPRESSION = {
  DEFLATE_RAW: 0,
  BROTLI: 1,
} as const;

export type CompressionAlgo = (typeof COMPRESSION)[keyof typeof COMPRESSION];

let detected: CompressionAlgo | null = null;

function detect(): CompressionAlgo {
  if (detected !== null) return detected;
  try {
    // Brotli is only supported in Chromium 138+ / Safari 17.4+.
    // Firefox supports only gzip/deflate in CompressionStream as of 2026.
    new CompressionStream('br' as CompressionFormat);
    detected = COMPRESSION.BROTLI;
  } catch {
    detected = COMPRESSION.DEFLATE_RAW;
  }
  return detected;
}

function formatName(algo: CompressionAlgo): CompressionFormat {
  return (algo === COMPRESSION.BROTLI ? 'br' : 'deflate-raw') as CompressionFormat;
}

export async function compress(
  input: Bytes,
): Promise<{ data: Bytes; algo: CompressionAlgo }> {
  const algo = detect();
  const cs = new CompressionStream(formatName(algo));
  const stream = new Blob([input]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return { data: new Uint8Array(buf), algo };
}

export async function decompress(input: Bytes, algo: CompressionAlgo): Promise<Bytes> {
  const ds = new DecompressionStream(formatName(algo));
  const stream = new Blob([input]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}
