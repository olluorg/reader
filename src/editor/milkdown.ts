import { Crepe } from '@milkdown/crepe';
import {
  commandsCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  schemaCtx,
} from '@milkdown/kit/core';
import { clearTextInCurrentBlockCommand } from '@milkdown/kit/preset/commonmark';
import { replaceAll, insert } from '@milkdown/kit/utils';
import type { Mode } from '../types';

// Crepe's `common/style.css` is imported by main.ts BEFORE our main.css so
// that our typography overrides win on equal specificity. The `frame` theme
// (which wraps the editor in a card) is deliberately never imported.

export interface EditorHandle {
  getMarkdown: () => string;
  /** Replace the entire markdown body. Fires onChange/onRendered. */
  replaceMarkdown: (md: string) => Promise<void>;
  /**
   * Insert a markdown fragment at the current selection. Used by the
   * toolbar's "Insert image" affordance to drop an `![](reader-media:id)`
   * reference at the caret.
   */
  insertMarkdown: (md: string) => Promise<void>;
  /**
   * Insert an image node directly via the ProseMirror schema, bypassing the
   * markdown parser. Used as a fallback when `insertMarkdown` swallows
   * non-standard URL schemes — remark's image rule rejects URLs the URI
   * library doesn't recognise, so `![](reader-media:abc)` parses to nothing.
   */
  insertImageNode: (attrs: { src: string; alt?: string; title?: string }) => Promise<void>;
  destroy: () => Promise<void>;
}

export class EditorBootError extends Error {
  constructor(public readonly cause: unknown) {
    super(`Editor failed to initialize: ${(cause as Error)?.message ?? cause}`);
  }
}

export async function createEditor(opts: {
  root: HTMLElement;
  initialMarkdown: string;
  mode: Mode;
  onChange?: (md: string) => void;
  onRendered?: () => void;
  /**
   * Invoked when the user picks "Image" from the slash menu. Caller opens its
   * file picker, computes the dHash, stores bytes in IDB, then drops a
   * markdown ref via {@link EditorHandle.insertMarkdown}. We just clear the
   * "/image" trigger text and hand control over.
   */
  onImageRequest?: () => void;
  /** Reserved for future opt-out of GFM nodes; currently ignored under Crepe. */
  disableGfm?: boolean;
}): Promise<EditorHandle> {
  void opts.disableGfm;

  let currentMarkdown = opts.initialMarkdown;
  const readonly = opts.mode === 'view';

  let crepe: Crepe;
  try {
    crepe = new Crepe({
      root: opts.root,
      defaultValue: opts.initialMarkdown,
      features: {
        // Slash menu (`/` to insert a block) + block handle. We keep the menu
        // and suppress the handle via featureConfigs below.
        [Crepe.Feature.BlockEdit]: true,
        // Floating selection toolbar (bold, italic, link, headings, etc.).
        [Crepe.Feature.Toolbar]: true,
        // "Type / to insert…" hint in empty paragraphs.
        [Crepe.Feature.Placeholder]: true,
        // Click-to-edit link UI.
        [Crepe.Feature.LinkTooltip]: true,
        // Smarter list-item handling (checkbox toggling for task lists, etc.).
        [Crepe.Feature.ListItem]: true,
        // GFM tables.
        [Crepe.Feature.Table]: true,
        // Off: heavy or visually noisy features we don't want.
        [Crepe.Feature.ImageBlock]: false,
        [Crepe.Feature.CodeMirror]: false, // saves ~1MB; code blocks still work
        [Crepe.Feature.Cursor]: false,
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.TopBar]: false,
      },
      featureConfigs: {
        [Crepe.Feature.BlockEdit]: {
          // Suppress the +/drag handle that appears next to blocks on hover.
          // The slash menu is unaffected.
          blockHandle: {
            shouldShow: () => false,
          },
          // The built-in ImageBlock advanced-group item is hidden because we
          // disable that feature. We add our own item that opens the host
          // app's file picker instead.
          buildMenu: opts.onImageRequest
            ? (builder) => {
                const advanced = builder.getGroup('advanced');
                if (!advanced) return;
                advanced.addItem('reader-image', {
                  label: 'Изображение',
                  // Inline SVG — picture frame, matches the floating-toolbar weight.
                  icon: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5L5 20"/></svg>`,
                  onRun: (ctx) => {
                    // Drop the "/image" text the user typed, then ask the host
                    // to take over (it owns the file picker + IDB storage).
                    ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key);
                    opts.onImageRequest!();
                  },
                });
              }
            : undefined,
        },
      },
    });

    crepe.editor.config((ctx) => {
      ctx.update(editorViewOptionsCtx, (prev) => ({
        ...prev,
        editable: () => !readonly,
        attributes: { class: 'milkdown' },
      }));
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, md) => {
        currentMarkdown = md;
        try {
          opts.onChange?.(md);
        } catch (err) {
          console.warn('editor onChange threw:', err);
        }
        if (opts.onRendered) requestAnimationFrame(() => opts.onRendered!());
      });
    });

    await crepe.create();
    if (readonly) crepe.setReadonly(true);
  } catch (err) {
    opts.root.innerHTML = '';
    throw new EditorBootError(err);
  }

  if (opts.onRendered) requestAnimationFrame(() => opts.onRendered!());

  return {
    getMarkdown: () => currentMarkdown,
    replaceMarkdown: async (md: string) => {
      currentMarkdown = md;
      await crepe.editor.action(replaceAll(md));
    },
    insertMarkdown: async (md: string) => {
      await crepe.editor.action(insert(md));
    },
    insertImageNode: async ({ src, alt = '', title = '' }) => {
      await crepe.editor.action((ctx) => {
        const schema = ctx.get(schemaCtx);
        const view = ctx.get(editorViewCtx);
        const imageType = schema.nodes['image'];
        if (!imageType) throw new Error('image node not registered');
        const node = imageType.create({ src, alt, title });
        view.dispatch(view.state.tr.replaceSelectionWith(node, false).scrollIntoView());
      });
    },
    destroy: async () => {
      await crepe.destroy();
    },
  };
}
