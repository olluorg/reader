import type { DocumentPayload } from '../types';

/**
 * Custom URL scheme used inside markdown to reference an image stored in
 * IndexedDB. `![alt](reader-media:<dHash hex>)` parses cleanly as a regular
 * markdown image — the editor sees an <img> and our render hook swaps the
 * src to a `data:` URL.
 */
export const MEDIA_HREF_PREFIX = 'reader-media:';
export const MEDIA_HREF_REGEX = /reader-media:([0-9a-f]{16})/g;

/** Extract the unique set of media ids referenced from a markdown body. */
export function extractMediaIds(markdown: string): string[] {
  const seen = new Set<string>();
  for (const m of markdown.matchAll(MEDIA_HREF_REGEX)) seen.add(m[1]);
  return Array.from(seen);
}

/**
 * Union of media ids reachable from a document — both its in-body refs
 * and the explicit `media` manifest carried alongside (the latter survives
 * even when the recipient hasn't loaded the doc body yet).
 */
export function collectDocMediaIds(doc: DocumentPayload): string[] {
  const ids = new Set<string>();
  for (const r of doc.media ?? []) ids.add(r.id);
  for (const id of extractMediaIds(doc.markdown)) ids.add(id);
  return Array.from(ids);
}
