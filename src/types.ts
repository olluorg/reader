export type Mode = 'view' | 'comment' | 'edit';

export interface Comment {
  id: string;
  from: number;
  to: number;
  text: string;
  author?: string;
  createdAt: number;
}

export interface DocumentVersion {
  /** Full markdown snapshot at the moment this version was shared. */
  markdown: string;
  /** Unix ms timestamp of the share that created this version. */
  createdAt: number;
  /** Optional human label. */
  label?: string;
}

export interface DocumentPayload {
  markdown: string;
  comments: Comment[];
  title?: string;
  /** Present only when the author opted in to versioning. */
  versions?: DocumentVersion[];
  /**
   * Manifest of images referenced from the markdown body as `reader-media:<id>`.
   * The bytes themselves are NOT inlined — they live in IndexedDB on the
   * author's machine and travel as their own share URLs on the wire (so the
   * main document URL stays short). This array carries enough metadata to
   * render a "missing image" placeholder when the recipient has neither the
   * resource URL nor a local file to import.
   */
  media?: MediaRef[];
}

export interface MediaRef {
  /** Perceptual-hash id (hex dHash). Matches the IndexedDB row key. */
  id: string;
  mime: string;
  /** Original filename, if known — used as the placeholder label. */
  name?: string;
  /** Bytes (decoded) — also used as a sanity check on imported files. */
  size: number;
  width?: number;
  height?: number;
  /**
   * LQIP: a tiny ~32px WebP encoded as a `data:` URL string, rendered with a
   * heavy blur while the full image isn't loaded. Lives on the ref (not in
   * IDB) so it travels inside the doc share-URL itself — the recipient sees
   * a recognisable blurred shape at the correct aspect ratio even before
   * they paste the media URL. Omitted for SVG and on encode failures.
   */
  preview?: string;
}

/**
 * When a document is too large for a single URL, it's sliced into N parts.
 * Every part-URL carries this header so the reader can assemble them.
 *
 * `docId` is shared by all parts of one document. Index is 0-based.
 * The part payload's `markdown` field holds *only* this part's slice;
 * the assembled markdown is reconstructed by concatenating parts in order.
 *
 * `partTitles` is duplicated into every part so we can show the table of
 * contents (and what's missing) even when only one part has been pasted.
 */
export interface PartHeader {
  docId: string;
  index: number;
  total: number;
  partTitles: string[];
}

export interface ShareOptions {
  mode: Mode;
  password?: string;
  /** When true, append a new DocumentVersion before encoding. Off by default. */
  saveVersion?: boolean;
  /** When set, force split into N parts even if the doc would fit one URL. */
  forceSplit?: number;
}
