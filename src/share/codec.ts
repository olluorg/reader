import { compress, decompress, COMPRESSION, type CompressionAlgo } from './compress';
import { encrypt, decrypt } from './crypto';
import { toBase64Url, fromBase64Url, type Bytes } from './base64';
import type { DocumentPayload, MediaRef, Mode, PartHeader, ShareOptions } from '../types';

// Binary payload layout:
//   byte 0       version (1 = legacy, 2 = with part-flag / extension bit)
//   byte 1       flags
//                  bits 0-1: mode (00 view, 01 comment, 10 edit)
//                  bit  2:   encrypted
//                  bits 3-4: compression algo (00 deflate-raw, 01 brotli)
//                  bit  5:   isPart — part envelope follows immediately after flags
//                  bits 6-7: reserved
//   if isPart (v2 only):
//     bytes 2..9   docId (8 bytes random)
//     byte 10      partIndex
//     byte 11      partTotal
//   if encrypted:
//     <salt 16> <iv 12>
//   rest          compressed (and optionally encrypted) JSON
//
// The JSON shape is:
//   - standalone:   DocumentPayload
//   - is-part:      { header: { partTitles: string[] }, doc: DocumentPayload }
//     (docId/index/total live in the binary header so we can read them
//      without decrypting; partTitles only matters once we've decrypted.)

const VERSION_LEGACY = 1;
const VERSION_PARTS = 2;
const VERSION_MEDIA = 3;
const VERSION_MEDIA_V2 = 4;
const SALT_LEN = 16;
const IV_LEN = 12;
const DOC_ID_LEN = 8;

const FLAG_ENCRYPTED = 1 << 2;
const FLAG_IS_PART = 1 << 5;

const MODE_BITS: Record<Mode, number> = { view: 0, comment: 1, edit: 2 };
const BITS_TO_MODE: Mode[] = ['view', 'comment', 'edit'];

export class WrongPasswordError extends Error {
  constructor() {
    super('Wrong password');
  }
}
export class PasswordRequiredError extends Error {
  constructor() {
    super('Password required');
  }
}

export interface EncodedShare {
  hash: string;
  mode: Mode;
  size: number;
}

export interface PartEncodeInput {
  docId: string;
  index: number;
  total: number;
  partTitles: string[];
}

function sliceCopy(src: Bytes, start: number, end?: number): Bytes {
  const sub = src.subarray(start, end);
  const out = new Uint8Array(sub.length);
  out.set(sub);
  return out;
}

export function newDocId(): string {
  const bytes = new Uint8Array(DOC_ID_LEN);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

function docIdToBytes(id: string): Bytes {
  const b = fromBase64Url(id);
  if (b.length !== DOC_ID_LEN) {
    throw new Error(`Invalid docId length: ${b.length}`);
  }
  return b;
}

interface PartBody {
  header: { partTitles: string[] };
  doc: DocumentPayload;
}

export async function encode(
  doc: DocumentPayload,
  opts: ShareOptions,
  part?: PartEncodeInput,
): Promise<EncodedShare> {
  const isPart = !!part;
  const bodyObj: DocumentPayload | PartBody = isPart
    ? { header: { partTitles: part!.partTitles }, doc }
    : doc;
  const json = new TextEncoder().encode(JSON.stringify(bodyObj)) as Bytes;
  const { data: compressed, algo } = await compress(json);

  let body: Bytes = compressed;
  let salt: Bytes | null = null;
  let iv: Bytes | null = null;

  if (opts.password) {
    const enc = await encrypt(compressed, opts.password);
    body = enc.ciphertext;
    salt = enc.salt;
    iv = enc.iv;
  }

  const encrypted = !!opts.password;
  const flags =
    MODE_BITS[opts.mode] |
    (encrypted ? FLAG_ENCRYPTED : 0) |
    ((algo & 0b11) << 3) |
    (isPart ? FLAG_IS_PART : 0);

  const partHeaderLen = isPart ? DOC_ID_LEN + 2 : 0;
  const cryptoHeaderLen = encrypted ? SALT_LEN + IV_LEN : 0;
  const headerLen = 2 + partHeaderLen + cryptoHeaderLen;

  const out = new Uint8Array(headerLen + body.length);
  out[0] = isPart ? VERSION_PARTS : VERSION_LEGACY;
  out[1] = flags;
  let off = 2;
  if (isPart) {
    out.set(docIdToBytes(part!.docId), off);
    off += DOC_ID_LEN;
    out[off++] = part!.index;
    out[off++] = part!.total;
  }
  if (salt && iv) {
    out.set(salt, off);
    off += SALT_LEN;
    out.set(iv, off);
    off += IV_LEN;
  }
  out.set(body, off);

  return { hash: toBase64Url(out), mode: opts.mode, size: out.length };
}

export interface DecodedShare {
  doc: DocumentPayload;
  mode: Mode;
  part: PartHeader | null;
}

/**
 * Inspect the unencrypted header of a hash to detect whether it's a part of
 * a split document. Returns docId/index/total without needing the password.
 */
export function peekPart(hash: string): { docId: string; index: number; total: number } | null {
  let bytes: Bytes;
  try {
    bytes = fromBase64Url(hash);
  } catch {
    return null;
  }
  if (bytes.length < 2) return null;
  const version = bytes[0];
  if (version !== VERSION_PARTS) return null;
  const flags = bytes[1];
  if ((flags & FLAG_IS_PART) === 0) return null;
  if (bytes.length < 2 + DOC_ID_LEN + 2) return null;
  const docId = toBase64Url(sliceCopy(bytes, 2, 2 + DOC_ID_LEN));
  const index = bytes[2 + DOC_ID_LEN];
  const total = bytes[2 + DOC_ID_LEN + 1];
  return { docId, index, total };
}

export async function decode(hash: string, password?: string): Promise<DecodedShare> {
  const bytes = fromBase64Url(hash);
  if (bytes.length < 2) throw new Error('Invalid payload');
  const version = bytes[0];
  if (version !== VERSION_LEGACY && version !== VERSION_PARTS) {
    throw new Error(`Unsupported payload version: ${version}`);
  }

  const flags = bytes[1];
  const mode = BITS_TO_MODE[flags & 0b11];
  if (!mode) throw new Error('Invalid mode bits');
  const encrypted = (flags & FLAG_ENCRYPTED) !== 0;
  const isPart = version === VERSION_PARTS && (flags & FLAG_IS_PART) !== 0;
  const algoBits = (flags >> 3) & 0b11;
  if (algoBits !== COMPRESSION.DEFLATE_RAW && algoBits !== COMPRESSION.BROTLI) {
    throw new Error(`Unsupported compression algo: ${algoBits}`);
  }
  const algo = algoBits as CompressionAlgo;

  let off = 2;
  let partInfo: { docId: string; index: number; total: number } | null = null;
  if (isPart) {
    if (bytes.length < off + DOC_ID_LEN + 2) throw new Error('Truncated part header');
    const docId = toBase64Url(sliceCopy(bytes, off, off + DOC_ID_LEN));
    off += DOC_ID_LEN;
    const index = bytes[off++];
    const total = bytes[off++];
    partInfo = { docId, index, total };
  }

  let salt: Bytes | null = null;
  let iv: Bytes | null = null;
  if (encrypted) {
    if (bytes.length < off + SALT_LEN + IV_LEN) throw new Error('Truncated payload');
    salt = sliceCopy(bytes, off, off + SALT_LEN);
    off += SALT_LEN;
    iv = sliceCopy(bytes, off, off + IV_LEN);
    off += IV_LEN;
  }
  let body: Bytes = sliceCopy(bytes, off);

  if (encrypted) {
    if (!password) throw new PasswordRequiredError();
    try {
      body = await decrypt(body, password, salt!, iv!);
    } catch {
      throw new WrongPasswordError();
    }
  }

  let decompressed: Bytes;
  try {
    decompressed = await decompress(body, algo);
  } catch (err) {
    throw new Error(`Decompression failed: ${(err as Error).message}`);
  }

  const json = new TextDecoder().decode(decompressed);
  const parsed = JSON.parse(json);

  let doc: DocumentPayload;
  let part: PartHeader | null = null;
  if (partInfo) {
    const partBody = parsed as PartBody;
    doc = partBody.doc;
    part = {
      docId: partInfo.docId,
      index: partInfo.index,
      total: partInfo.total,
      partTitles: partBody.header?.partTitles ?? [],
    };
  } else {
    doc = parsed as DocumentPayload;
  }

  if (!doc.comments) doc.comments = [];
  return { doc, mode, part };
}

export function buildUrl(hash: string): string {
  return `${location.origin}${location.pathname}#${hash}`;
}

// ───────────────────────────────────────────────────────────
// Media envelopes
//
// Version 3 (legacy):
//   byte 0:  version = 3
//   byte 1:  flags (bit 2 encrypted, bits 3-4 compression — same layout as
//            the doc envelope so the crypto/compression code can be shared)
//   if encrypted: salt(16) iv(12)
//   rest: compressed (and optionally encrypted) JSON:
//         { id, mime, name?, width?, height?, bytesB64 }
//
// Version 4 (current): same envelope, but the inner body is binary:
//   [u16 LE: jsonLen][headerJsonBytes][rawImageBytes]
// where headerJson is { id, mime, name?, width?, height? } — no bytes field.
// Skipping base64-in-JSON avoids the 4/3 inflation that brotli only partially
// recovers, saving ~5–15% on the final URL depending on image entropy.
//
// Media URLs do NOT carry mode bits (an image is just an image). The peek
// path looks at byte 0 only, so this slots in next to the doc envelopes
// without disturbing peekPart.
// ───────────────────────────────────────────────────────────

export interface MediaPayload {
  id: string;
  mime: string;
  name?: string;
  width?: number;
  height?: number;
  /** Raw decoded image bytes. */
  bytes: Bytes;
}

interface MediaHeader {
  id: string;
  mime: string;
  name?: string;
  width?: number;
  height?: number;
}

export interface EncodedMedia {
  hash: string;
  url: string;
  size: number;
  ref: MediaRef;
}

export interface MediaEncodeOptions {
  password?: string;
}

export function isMediaHash(hash: string): boolean {
  let bytes: Bytes;
  try {
    bytes = fromBase64Url(hash);
  } catch {
    return false;
  }
  return bytes.length >= 2 && (bytes[0] === VERSION_MEDIA || bytes[0] === VERSION_MEDIA_V2);
}

export async function encodeMedia(
  payload: MediaPayload,
  opts: MediaEncodeOptions = {},
): Promise<EncodedMedia> {
  const header: MediaHeader = {
    id: payload.id,
    mime: payload.mime,
    name: payload.name,
    width: payload.width,
    height: payload.height,
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header)) as Bytes;
  if (headerBytes.length > 0xffff) throw new Error('media header too large');

  const inner = new Uint8Array(2 + headerBytes.length + payload.bytes.length);
  inner[0] = headerBytes.length & 0xff;
  inner[1] = (headerBytes.length >> 8) & 0xff;
  inner.set(headerBytes, 2);
  inner.set(payload.bytes, 2 + headerBytes.length);

  const { data: compressed, algo } = await compress(inner as Bytes);

  let body: Bytes = compressed;
  let salt: Bytes | null = null;
  let iv: Bytes | null = null;
  if (opts.password) {
    const enc = await encrypt(compressed, opts.password);
    body = enc.ciphertext;
    salt = enc.salt;
    iv = enc.iv;
  }

  const encrypted = !!opts.password;
  const flags = (encrypted ? FLAG_ENCRYPTED : 0) | ((algo & 0b11) << 3);
  const cryptoHeaderLen = encrypted ? SALT_LEN + IV_LEN : 0;
  const headerLen = 2 + cryptoHeaderLen;

  const out = new Uint8Array(headerLen + body.length);
  out[0] = VERSION_MEDIA_V2;
  out[1] = flags;
  let off = 2;
  if (salt && iv) {
    out.set(salt, off);
    off += SALT_LEN;
    out.set(iv, off);
    off += IV_LEN;
  }
  out.set(body, off);

  const hash = toBase64Url(out);
  return {
    hash,
    url: buildUrl(hash),
    size: out.length,
    ref: {
      id: payload.id,
      mime: payload.mime,
      name: payload.name,
      width: payload.width,
      height: payload.height,
      size: payload.bytes.length,
    },
  };
}

/**
 * Replace every `reader-media:<id>` href in a markdown body with the matching
 * payload's data: URL. Used by the share flow to try inlining all images
 * before deciding whether a single self-contained URL is feasible — for SVG
 * and small images this is usually a big win: the recipient gets one URL with
 * the entire document, no extra "resource" links to chase.
 *
 * The payloads map is by media id. Refs without a payload are left untouched
 * (will render as missing-media on the recipient side, same as today).
 */
export function inlineMediaInMarkdown(
  markdown: string,
  payloads: Map<string, MediaPayload>,
): string {
  return markdown.replace(/reader-media:([0-9a-f]{16})/g, (match, id) => {
    const p = payloads.get(id);
    if (!p) return match;
    return `data:${p.mime};base64,${bytesToStandardBase64(p.bytes)}`;
  });
}

function bytesToStandardBase64(bytes: Bytes): string {
  let str = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    str += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(str);
}

export async function decodeMedia(
  hash: string,
  password?: string,
): Promise<MediaPayload> {
  const bytes = fromBase64Url(hash);
  if (bytes.length < 2) throw new Error('Invalid media payload');
  const version = bytes[0];
  if (version !== VERSION_MEDIA && version !== VERSION_MEDIA_V2) {
    throw new Error('Not a media payload');
  }

  const flags = bytes[1];
  const encrypted = (flags & FLAG_ENCRYPTED) !== 0;
  const algoBits = (flags >> 3) & 0b11;
  if (algoBits !== COMPRESSION.DEFLATE_RAW && algoBits !== COMPRESSION.BROTLI) {
    throw new Error(`Unsupported compression algo: ${algoBits}`);
  }
  const algo = algoBits as CompressionAlgo;

  let off = 2;
  let salt: Bytes | null = null;
  let iv: Bytes | null = null;
  if (encrypted) {
    if (bytes.length < off + SALT_LEN + IV_LEN) throw new Error('Truncated media payload');
    salt = sliceCopy(bytes, off, off + SALT_LEN);
    off += SALT_LEN;
    iv = sliceCopy(bytes, off, off + IV_LEN);
    off += IV_LEN;
  }
  let body: Bytes = sliceCopy(bytes, off);

  if (encrypted) {
    if (!password) throw new PasswordRequiredError();
    try {
      body = await decrypt(body, password, salt!, iv!);
    } catch {
      throw new WrongPasswordError();
    }
  }

  let decompressed: Bytes;
  try {
    decompressed = await decompress(body, algo);
  } catch (err) {
    throw new Error(`Decompression failed: ${(err as Error).message}`);
  }

  if (version === VERSION_MEDIA) {
    // Legacy: JSON with base64 bytes field.
    const json = new TextDecoder().decode(decompressed);
    const legacy = JSON.parse(json) as MediaHeader & { bytesB64: string };
    return {
      id: legacy.id,
      mime: legacy.mime,
      name: legacy.name,
      width: legacy.width,
      height: legacy.height,
      bytes: fromBase64Url(legacy.bytesB64),
    };
  }

  // v4: [u16 LE jsonLen][headerJson][rawBytes]
  if (decompressed.length < 2) throw new Error('Truncated media body');
  const jsonLen = decompressed[0] | (decompressed[1] << 8);
  if (decompressed.length < 2 + jsonLen) throw new Error('Truncated media header');
  const headerJson = new TextDecoder().decode(decompressed.subarray(2, 2 + jsonLen));
  const header = JSON.parse(headerJson) as MediaHeader;
  return {
    id: header.id,
    mime: header.mime,
    name: header.name,
    width: header.width,
    height: header.height,
    bytes: sliceCopy(decompressed, 2 + jsonLen),
  };
}
