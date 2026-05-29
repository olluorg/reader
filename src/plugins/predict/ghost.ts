/**
 * Inline ghost-text completion for the Milkdown/ProseMirror editor.
 *
 * Two suggestion sources feed one ghost decoration sitting just after the
 * caret:
 *
 *   • Tier 0 (engine) — synchronous n-gram completion, computed inside
 *     `apply` on every keystroke so the ghost is *instant*: half-typed words
 *     and an immediate next word.
 *   • Tier 1 (optional LM) — asynchronous, runs in a worker on a short pause.
 *     When it returns a longer, more coherent phrase for the *current* caret
 *     context, it upgrades the ghost in place via a meta transaction.
 *
 * Tier 1 is only consulted for "next word" contexts (caret after a space):
 * mid-word completion stays with Tier 0, where token-based LMs are awkward.
 *
 * Accept with Tab or by clicking the ghost; Esc dismisses until the next
 * keystroke or caret move.
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorState } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { PredictEngine } from './engine';

export interface Tier1Source {
  isReady: () => boolean;
  suggest: (context: string) => Promise<string | null>;
}

export interface GhostSources {
  engine: PredictEngine;
  isEnabled: () => boolean;
  tier1?: Tier1Source;
}

interface AsyncSuggestion {
  context: string;
  text: string;
}

interface GhostState {
  deco: DecorationSet;
  text: string | null;
  pos: number;
  dismissed: boolean;
  /** Latest Tier 1 phrase, kept until its context no longer matches. */
  async: AsyncSuggestion | null;
}

type Meta = { type: 'dismiss' } | { type: 'async'; result: AsyncSuggestion };

const key = new PluginKey<GhostState>('reader-predict-ghost');
const TIER1_DEBOUNCE_MS = 350;

const emptyState = (async: AsyncSuggestion | null = null): GhostState => ({
  deco: DecorationSet.empty,
  text: null,
  pos: 0,
  dismissed: false,
  async,
});

/** The suggestable caret context, or null when we shouldn't suggest here. */
function caretContext(
  state: EditorState,
): { textBefore: string; pos: number; nextWord: boolean } | null {
  const sel = state.selection;
  if (!sel.empty) return null;
  const $from = sel.$from;
  if (!$from.parent.isTextblock) return null;
  if ($from.parentOffset !== $from.parent.content.size) return null; // only at block end
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n', ' ');
  if (!textBefore.trim()) return null;
  const nextWord = !/[\p{L}\p{N}]$/u.test(textBefore);
  return { textBefore, pos: sel.from, nextWord };
}

function accept(view: EditorView, text: string, pos: number): void {
  view.dispatch(view.state.tr.insertText(text, pos).scrollIntoView());
  view.focus();
}

type Source = 'tier0' | 'tier1';

function renderGhost(text: string, pos: number, source: Source): (view: EditorView) => HTMLElement {
  return (view) => {
    const span = document.createElement('span');
    span.className = `predict-ghost predict-ghost--${source}`;
    span.textContent = text;
    span.setAttribute('contenteditable', 'false');
    span.addEventListener('mousedown', (e) => {
      e.preventDefault();
      accept(view, text, pos);
    });
    return span;
  };
}

function buildDeco(state: EditorState, text: string, pos: number, source: Source): DecorationSet {
  return DecorationSet.create(state.doc, [
    Decoration.widget(pos, renderGhost(text, pos, source), {
      side: 1,
      ignoreSelection: true,
      key: `ghost-${source}-${pos}-${text}`,
    }),
  ]);
}

/** Decide what to show for the current caret, blending Tier 0 and Tier 1. */
function compute(state: EditorState, sources: GhostSources, async: AsyncSuggestion | null): GhostState {
  const ctx = caretContext(state);
  if (!ctx) return emptyState(null); // moved away → drop any stale async phrase

  let text: string | null = null;
  let source: Source = 'tier0';
  // Prefer a Tier 1 phrase when it was generated for *this* exact context.
  if (ctx.nextWord && async && async.context === ctx.textBefore) {
    const lead = /\s$/.test(ctx.textBefore) ? '' : ' ';
    text = lead + async.text;
    source = 'tier1';
  } else {
    text = sources.engine.predict(ctx.textBefore);
  }

  if (!text) return emptyState(async);
  return { deco: buildDeco(state, text, ctx.pos, source), text, pos: ctx.pos, dismissed: false, async };
}

export function ghostPlugin(sources: GhostSources) {
  return $prose(() => {
    let editable = true;

    // Tier 1 request bookkeeping (lives in the plugin-view closure).
    let timer: number | null = null;
    let requestedContext: string | null = null;

    const scheduleTier1 = (view: EditorView) => {
      const t1 = sources.tier1;
      if (!t1 || !sources.isEnabled() || !view.editable || !t1.isReady()) return;
      const ctx = caretContext(view.state);
      if (!ctx || !ctx.nextWord) return;
      if (ctx.textBefore === requestedContext) return; // already asked for this

      if (timer !== null) clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        requestedContext = ctx.textBefore;
        void t1.suggest(ctx.textBefore).then((phrase) => {
          if (!phrase) return;
          // Only surface it if the caret context is still the same one.
          const cur = caretContext(view.state);
          if (!cur || cur.textBefore !== ctx.textBefore) return;
          view.dispatch(
            view.state.tr.setMeta(key, {
              type: 'async',
              result: { context: ctx.textBefore, text: phrase },
            } satisfies Meta),
          );
        });
      }, TIER1_DEBOUNCE_MS);
    };

    return new Plugin<GhostState>({
      key,
      view: (editorView) => {
        editable = editorView.editable;
        return {
          update: (v) => {
            editable = v.editable;
            scheduleTier1(v);
          },
          destroy: () => {
            if (timer !== null) clearTimeout(timer);
          },
        };
      },
      state: {
        init: () => emptyState(),
        apply(tr, value, _old, newState): GhostState {
          const meta = tr.getMeta(key) as Meta | undefined;
          if (meta?.type === 'dismiss') {
            return { ...emptyState(), dismissed: true };
          }
          if (!editable || !sources.isEnabled()) return emptyState();

          const async = meta?.type === 'async' ? meta.result : value.async;

          // Stay dismissed until the user types or moves the caret.
          if (value.dismissed && !tr.docChanged && !tr.selectionSet && meta?.type !== 'async') {
            return value;
          }
          return compute(newState, sources, async);
        },
      },
      props: {
        decorations(state) {
          return key.getState(state)?.deco ?? DecorationSet.empty;
        },
        handleKeyDown(view, event) {
          if (event.isComposing) return false;
          const st = key.getState(view.state);
          if (!st?.text) return false;
          if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            accept(view, st.text, st.pos);
            return true;
          }
          if (event.key === 'Escape') {
            view.dispatch(view.state.tr.setMeta(key, { type: 'dismiss' } satisfies Meta));
            return true;
          }
          return false;
        },
      },
    });
  });
}
