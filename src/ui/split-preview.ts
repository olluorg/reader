/**
 * Renders boundary lines in the editor at predicted cut points so the author
 * can see, while writing, where the doc would split if shared right now.
 *
 * We deliberately don't inject anything into the ProseMirror document — it
 * would either get stripped on the next transaction or interfere with cursor
 * placement. Instead we maintain a sibling overlay layer (`.split-preview-
 * layer`) inside `.editor-shell__inner` and absolutely-position one line per
 * cut point at the offsetTop of the matching heading.
 *
 * Heuristics:
 *   - Preview is only shown when the doc would exceed the URL limit.
 *   - We map cut points to headings by chunk title (first H1/H2 in the chunk).
 *     If the split planner falls back to fixed-byte slicing (no headings),
 *     there's no good anchor and we render no preview.
 */

import { planSplit } from '../share/split';
import { t } from '../i18n';

const LAYER_CLASS = 'split-preview-layer';
const LINE_CLASS = 'split-preview-line';

export interface SplitPreviewOptions {
  /** The shell that contains both the editor and the overlay layer. */
  shellInner: HTMLElement;
  /** Current markdown being authored. */
  markdown: string;
  /** Estimated URL size in bytes for `markdown`. */
  urlBytes: number;
  /** Hard ceiling above which a split would actually happen. */
  urlLimitBytes: number;
  /** Max parts the auto-split could pick — keeps the preview reasonable. */
  maxParts?: number;
}

export function refreshSplitPreview(opts: SplitPreviewOptions): void {
  const layer = ensureLayer(opts.shellInner);
  layer.innerHTML = '';

  if (opts.urlBytes <= opts.urlLimitBytes) {
    // Under limit — no split would happen; nothing to preview.
    return;
  }

  const target = opts.urlLimitBytes * 0.75;
  const count = Math.max(2, Math.min(opts.maxParts ?? 12, Math.ceil(opts.urlBytes / target)));
  const plan = planSplit(opts.markdown, count);
  if (plan.chunks.length < 2) return;

  // First chunk has no boundary above it; we only mark seams.
  const cuts = plan.chunks
    .slice(1)
    .map((c, i) => ({ index: i + 1, total: plan.chunks.length, title: c.title }));

  const headings = Array.from(
    opts.shellInner.querySelectorAll<HTMLElement>('.milkdown h1, .milkdown h2'),
  );
  if (headings.length === 0) return;

  // The same title can repeat — bind each cut to the *next* unused occurrence.
  const used = new Set<HTMLElement>();
  let painted = 0;
  for (const cut of cuts) {
    const target = headings.find((h) => !used.has(h) && headingText(h) === cut.title);
    if (!target) continue;
    used.add(target);
    const line = createLine(cut.index, cut.total, cut.title);
    layer.appendChild(line);
    // offsetTop is relative to the nearest positioned ancestor — we make
    // .editor-shell__inner position:relative in CSS so this lines up.
    line.style.top = `${target.offsetTop}px`;
    painted++;
  }

  if (painted === 0) {
    // Couldn't anchor anywhere — show a single hint at the top instead so
    // the user at least knows the split is happening.
    const hint = document.createElement('div');
    hint.className = `${LINE_CLASS} ${LINE_CLASS}--hint`;
    hint.style.top = '0px';
    hint.textContent = t('preview.willSplitInto', { count: plan.chunks.length });
    layer.appendChild(hint);
  }
}

export function clearSplitPreview(shellInner: HTMLElement): void {
  shellInner.querySelector(`.${LAYER_CLASS}`)?.remove();
}

function ensureLayer(shellInner: HTMLElement): HTMLDivElement {
  let layer = shellInner.querySelector<HTMLDivElement>(`:scope > .${LAYER_CLASS}`);
  if (!layer) {
    layer = document.createElement('div');
    layer.className = LAYER_CLASS;
    layer.setAttribute('aria-hidden', 'true');
    shellInner.appendChild(layer);
  }
  return layer;
}

function createLine(index: number, total: number, title: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = LINE_CLASS;
  el.innerHTML = `
    <span class="${LINE_CLASS}__rule"></span>
    <span class="${LINE_CLASS}__label">
      <span class="${LINE_CLASS}__index"></span>
      <span class="${LINE_CLASS}__title"></span>
    </span>
    <span class="${LINE_CLASS}__rule"></span>
  `;
  (el.querySelector(`.${LINE_CLASS}__index`) as HTMLElement).textContent = t(
    'preview.lineIndex',
    { n: index + 1, total },
  );
  (el.querySelector(`.${LINE_CLASS}__title`) as HTMLElement).textContent =
    title ? `· ${title}` : '';
  el.title = t('preview.lineTitle', { n: index + 1, total });
  return el;
}

function headingText(h: HTMLElement): string {
  return (h.textContent ?? '').trim();
}
