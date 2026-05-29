/**
 * Live dictation preview for the Milkdown/ProseMirror editor.
 *
 * While the trigger key is held we show a non-editable widget at the caret: a
 * pulsing microphone marker plus the interim transcript. The interim text gets
 * *better* (and may rewrite earlier words) as more audio arrives, so it lives
 * only in this ghost — the document is committed once, on release, keeping the
 * doc and undo history clean no matter how much the interim wobbles.
 *
 * The controller drives it via {@link setPreview}, which dispatches a meta
 * transaction the plugin reads in `apply`. (That transaction also makes predict
 * re-run its own `apply`, where it sees the dictation flag and clears its
 * ghost — so the two never stack.)
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import type { EditorView } from '@milkdown/kit/prose/view';

interface PreviewState {
  deco: DecorationSet;
  active: boolean;
  text: string;
}

type Meta = { type: 'preview'; active: boolean; text: string };

const key = new PluginKey<PreviewState>('reader-voice-preview');

const empty: PreviewState = { deco: DecorationSet.empty, active: false, text: '' };

function renderWidget(text: string): () => HTMLElement {
  return () => {
    const wrap = document.createElement('span');
    wrap.className = 'voice-cursor';
    wrap.setAttribute('contenteditable', 'false');

    const mic = document.createElement('span');
    mic.className = 'voice-cursor__mic';
    mic.textContent = '🎤';
    wrap.appendChild(mic);

    if (text) {
      const ghost = document.createElement('span');
      ghost.className = 'voice-preview';
      ghost.textContent = text;
      wrap.appendChild(ghost);
    }
    return wrap;
  };
}

/** Drive the dictation widget. `active` shows the mic; `text` is interim. */
export function setPreview(view: EditorView, active: boolean, text: string): void {
  view.dispatch(view.state.tr.setMeta(key, { type: 'preview', active, text } satisfies Meta));
}

export function previewPlugin() {
  return $prose(() => {
    return new Plugin<PreviewState>({
      key,
      state: {
        init: () => empty,
        apply(tr, value, _old, newState): PreviewState {
          const meta = tr.getMeta(key) as Meta | undefined;
          const active = meta ? meta.active : value.active;
          const text = meta ? meta.text : value.text;
          if (!active) return empty;

          // Anchor at the caret; lead with a space when the text before the
          // caret doesn't already end in whitespace.
          const sel = newState.selection;
          const pos = sel.from;
          const before = sel.$from.parent.textBetween(
            0,
            Math.max(0, sel.$from.parentOffset),
            '\n',
            ' ',
          );
          const lead = !text || before === '' || /\s$/.test(before) ? '' : ' ';
          const deco = DecorationSet.create(newState.doc, [
            Decoration.widget(pos, renderWidget(lead + text), {
              side: 1,
              ignoreSelection: true,
              key: `voice-preview-${pos}-${text}`,
            }),
          ]);
          return { deco, active, text };
        },
      },
      props: {
        decorations(state) {
          return key.getState(state)?.deco ?? DecorationSet.empty;
        },
      },
    });
  });
}
