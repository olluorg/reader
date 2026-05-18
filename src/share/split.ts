import { encode, newDocId, type EncodedShare } from './codec';
import type { DocumentPayload, Mode } from '../types';

export interface DocChunk {
  /** Markdown for this slice (already includes its leading heading, if any). */
  markdown: string;
  /** Human title for the slice — first heading text or "Part N". */
  title: string;
}

export interface SplitPlan {
  docId: string;
  chunks: DocChunk[];
}

export interface EncodedPart extends EncodedShare {
  url: string;
  index: number;
  total: number;
  title: string;
}

export interface SplitEncodeResult {
  docId: string;
  parts: EncodedPart[];
  partTitles: string[];
}

/**
 * Plan a split for a document. `count` is the desired number of parts.
 *
 * Strategy: collect H1/H2 boundaries; greedily group consecutive sections so
 * the resulting chunks are roughly equal-sized. If headings can't produce
 * `count` chunks (e.g. no headings, or fewer sections than parts), fall back
 * to even byte slicing.
 */
export function planSplit(markdown: string, count: number): SplitPlan {
  const safeCount = Math.max(2, Math.floor(count));
  const sections = splitByHeadings(markdown);

  let chunks: DocChunk[];
  if (sections.length >= safeCount) {
    chunks = groupSections(sections, safeCount);
  } else {
    chunks = sliceFixed(markdown, safeCount);
  }

  return { docId: newDocId(), chunks };
}

interface Section {
  title: string;
  markdown: string;
}

function splitByHeadings(markdown: string): Section[] {
  const lines = markdown.split('\n');
  const sections: Section[] = [];
  let cursor: { title: string; lines: string[] } | null = null;
  let inCode = false;

  const push = () => {
    if (cursor && cursor.lines.length) {
      sections.push({ title: cursor.title, markdown: cursor.lines.join('\n') });
    }
    cursor = null;
  };

  for (const raw of lines) {
    const trimmed = raw.trimStart();
    // Track fenced code blocks so we don't mistake "# foo" inside code for a heading.
    if (/^```/.test(trimmed) || /^~~~/.test(trimmed)) {
      inCode = !inCode;
    }
    const headingMatch = !inCode && raw.match(/^(#{1,2})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      push();
      cursor = { title: headingMatch[2].trim(), lines: [raw] };
    } else {
      if (!cursor) cursor = { title: '', lines: [] };
      cursor.lines.push(raw);
    }
  }
  push();

  // Leading prose with no heading still counts as a section.
  return sections.filter((s) => s.markdown.length > 0);
}

function groupSections(sections: Section[], target: number): DocChunk[] {
  const totalBytes = sections.reduce((sum, s) => sum + s.markdown.length + 1, 0);
  const idealPerChunk = totalBytes / target;
  const chunks: DocChunk[] = [];
  let buf: Section[] = [];
  let bufBytes = 0;
  let placed = 0;

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    buf.push(s);
    bufBytes += s.markdown.length + 1;
    const remainingSections = sections.length - i - 1;
    const remainingChunks = target - placed - 1;
    const shouldClose =
      placed < target - 1 &&
      (bufBytes >= idealPerChunk || remainingSections <= remainingChunks);
    if (shouldClose) {
      chunks.push(materializeChunk(buf, placed));
      buf = [];
      bufBytes = 0;
      placed++;
    }
  }
  if (buf.length) {
    chunks.push(materializeChunk(buf, placed));
  }
  // If rounding left us short of target, pad with empty trailing chunks.
  while (chunks.length < target) {
    chunks.push({ markdown: '', title: `Part ${chunks.length + 1}` });
  }
  return chunks;
}

function materializeChunk(sections: Section[], index: number): DocChunk {
  const markdown = sections.map((s) => s.markdown).join('\n\n');
  const title =
    sections.find((s) => s.title)?.title?.slice(0, 80) ?? `Part ${index + 1}`;
  return { markdown, title };
}

function sliceFixed(markdown: string, count: number): DocChunk[] {
  const chunkSize = Math.ceil(markdown.length / count);
  const chunks: DocChunk[] = [];
  for (let i = 0; i < count; i++) {
    const start = i * chunkSize;
    const end = Math.min(markdown.length, start + chunkSize);
    chunks.push({
      markdown: markdown.slice(start, end),
      title: `Part ${i + 1}`,
    });
  }
  return chunks;
}

/**
 * Encode a planned split into per-part hash URLs. Each part shares docId and
 * the full `partTitles` table of contents.
 */
export async function encodeSplit(
  plan: SplitPlan,
  base: DocumentPayload,
  opts: { mode: Mode; password?: string },
  buildUrl: (hash: string) => string,
): Promise<SplitEncodeResult> {
  const partTitles = plan.chunks.map((c, i) => c.title || `Part ${i + 1}`);
  const parts: EncodedPart[] = [];
  for (let i = 0; i < plan.chunks.length; i++) {
    // Each part carries the *same* metadata (comments, title, versions) so
    // the assembled doc reconstructs cleanly — but only this part's markdown.
    const partDoc: DocumentPayload = {
      ...base,
      markdown: plan.chunks[i].markdown,
    };
    const enc = await encode(partDoc, { mode: opts.mode, password: opts.password }, {
      docId: plan.docId,
      index: i,
      total: plan.chunks.length,
      partTitles,
    });
    parts.push({
      ...enc,
      url: buildUrl(enc.hash),
      index: i,
      total: plan.chunks.length,
      title: partTitles[i],
    });
  }
  return { docId: plan.docId, parts, partTitles };
}

/** Re-assemble loaded parts (by index) into a single markdown body. */
export function assembleMarkdown(
  partTitles: string[],
  loaded: Map<number, string>,
): string {
  const total = partTitles.length;
  const out: string[] = [];
  for (let i = 0; i < total; i++) {
    const md = loaded.get(i);
    if (md !== undefined) {
      // Prepend a boundary marker above every loaded part except the first.
      // (Missing parts get their own "..." widget, which acts as the seam.)
      if (i > 0) out.push(partBoundaryMarker(i, total, partTitles[i]));
      out.push(md);
    } else {
      out.push(missingPartPlaceholder(i, partTitles[i]));
    }
  }
  return out.join('\n\n');
}

/**
 * Markers we inject into the assembled markdown are vanilla links with custom
 * URL schemes. Commonmark parses them reliably and they round-trip through any
 * markdown renderer. The UI layer scans the rendered DOM for anchors whose
 * href starts with one of these prefixes and swaps them in for widgets.
 */
export const MISSING_PART_HREF_PREFIX = 'reader-missing:';
export const PART_BOUNDARY_HREF_PREFIX = 'reader-part-boundary:';

export function missingPartPlaceholder(index: number, title: string): string {
  const safeTitle = encodeURIComponent(title.replace(/[\r\n]+/g, ' '));
  return `[···](${MISSING_PART_HREF_PREFIX}${index}:${safeTitle})`;
}

/**
 * Marker placed above a loaded part (except the very first) so the reader can
 * see where one part ended and the next began. Format mirrors missing-part:
 * `[—](reader-part-boundary:INDEX:TOTAL:URL_ENCODED_TITLE)`.
 */
export function partBoundaryMarker(index: number, total: number, title: string): string {
  const safeTitle = encodeURIComponent(title.replace(/[\r\n]+/g, ' '));
  return `[—](${PART_BOUNDARY_HREF_PREFIX}${index}:${total}:${safeTitle})`;
}

export function parseMissingHref(href: string): { index: number; title: string } | null {
  if (!href.startsWith(MISSING_PART_HREF_PREFIX)) return null;
  const rest = href.slice(MISSING_PART_HREF_PREFIX.length);
  const colon = rest.indexOf(':');
  if (colon < 0) return null;
  const idx = Number(rest.slice(0, colon));
  if (!Number.isInteger(idx)) return null;
  let title = '';
  try {
    title = decodeURIComponent(rest.slice(colon + 1));
  } catch {
    title = rest.slice(colon + 1);
  }
  return { index: idx, title };
}

export function parseBoundaryHref(
  href: string,
): { index: number; total: number; title: string } | null {
  if (!href.startsWith(PART_BOUNDARY_HREF_PREFIX)) return null;
  const rest = href.slice(PART_BOUNDARY_HREF_PREFIX.length);
  const firstColon = rest.indexOf(':');
  if (firstColon < 0) return null;
  const secondColon = rest.indexOf(':', firstColon + 1);
  if (secondColon < 0) return null;
  const idx = Number(rest.slice(0, firstColon));
  const total = Number(rest.slice(firstColon + 1, secondColon));
  if (!Number.isInteger(idx) || !Number.isInteger(total)) return null;
  let title = '';
  try {
    title = decodeURIComponent(rest.slice(secondColon + 1));
  } catch {
    title = rest.slice(secondColon + 1);
  }
  return { index: idx, total, title };
}
