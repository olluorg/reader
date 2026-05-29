import type { MilkdownPlugin } from '@milkdown/kit/ctx';
import type { EditorHandle } from '../editor/milkdown';
import type { DocumentPayload, DocumentVersion, Mode, PartHeader } from '../types';

/**
 * Plugin extension surface for reader.
 *
 * The reader core (`main.ts`) drives the document, the editor, the URL
 * encoding and the local library. Optional functionality — sync,
 * backups, future things like an LLM proxy — lives in plugins that
 * subscribe to lifecycle hooks and contribute UI.
 *
 * A plugin is a plain object implementing `ReaderPlugin`. It registers
 * itself by being included in the array passed to `bootstrap()`.
 *
 * The `ReaderPluginContext` is a curated view of reader's state plus a
 * handful of capabilities (apply a remote update, repaint media, etc.).
 * Plugins do NOT touch reader internals directly.
 */

export interface ShareGenerated {
  readonly hash: string;
  readonly url: string;
  readonly mode: Mode;
  readonly encrypted: boolean;
  readonly size: number;
  readonly doc: DocumentPayload;
}

export interface SplitSharePart {
  readonly hash: string;
  readonly url: string;
  readonly index: number;
  readonly total: number;
}

export interface SplitShareGenerated {
  readonly parts: readonly SplitSharePart[];
  readonly mode: Mode;
  readonly encrypted: boolean;
  readonly doc: DocumentPayload;
}

export interface MenuItem {
  readonly label: string;
  readonly action: () => void;
}

export type DecodeWithPasswordResult =
  | {
      ok: true;
      doc: DocumentPayload;
      mode: Mode;
      part: PartHeader | null;
      password?: string;
    }
  | {
      ok: false;
      reason: 'cancelled' | 'too-many-attempts' | 'decode';
      message?: string;
    };

export interface ReaderPluginContext {
  // ────────── State readers ──────────
  getDoc(): DocumentPayload;
  getMode(): Mode;
  getPassword(): string | undefined;
  getLoadedFromHash(): string | null;
  isPartsMode(): boolean;
  getEditor(): EditorHandle | null;
  getRawTextarea(): HTMLTextAreaElement | null;
  getBaselineMarkdown(): string;
  appendVersion(version: DocumentVersion): void;

  // ────────── Capabilities ──────────
  /**
   * Replace the open document with a fresh payload (typically decoded
   * from a sibling URL hash). Updates state, the editor, and the URL
   * bar without bouncing through hashchange or the local-edit path.
   */
  applyRemoteUpdate(doc: DocumentPayload, newHash: string): Promise<void>;
  decodeWithPassword(hash: string, password?: string): Promise<DecodeWithPasswordResult>;
  paintMediaImages(): Promise<void>;
  installMissingPlaceholders(): void;
  /** Union of in-body media refs and the doc's `media` manifest. */
  collectDocMediaIds(doc: DocumentPayload): string[];
  /** Re-render the toolbar in place to reflect new plugin contributions. */
  refreshToolbar(): void;
}

export interface ReaderPlugin {
  readonly id: string;
  /** Human-readable plugin label for the dropdown section header. */
  readonly label?: string;

  // Lifecycle
  onAppStart?(ctx: ReaderPluginContext): Promise<void> | void;

  // Document lifecycle
  onDocLoaded?(
    ctx: ReaderPluginContext,
    hash: string,
    isOwned: boolean,
  ): Promise<void> | void;
  onNewDocument?(ctx: ReaderPluginContext): void;
  onHashCleared?(ctx: ReaderPluginContext): void;
  onDocEdited?(ctx: ReaderPluginContext, markdown: string): void;
  onShareGenerated?(ctx: ReaderPluginContext, gen: ShareGenerated): void;
  onSplitShareGenerated?(
    ctx: ReaderPluginContext,
    gen: SplitShareGenerated,
  ): void;

  /**
   * Items to show inside the plugins dropdown in the toolbar. The dropdown
   * groups items by plugin (label header). Mobile and desktop share this
   * dropdown — there's no separate toolbarButtons / overflowMenuItems.
   */
  menuItems?(ctx: ReaderPluginContext): readonly MenuItem[];

  /**
   * Native Milkdown/ProseMirror plugins to install on the WYSIWYG editor.
   * Collected by the core when it builds the editor (every render), so they
   * survive editor re-creation. Use this to add decorations, keymaps, or
   * view behaviour — the predict plugin adds inline ghost-text completion
   * this way. Not invoked for the raw-textarea fallback view.
   */
  editorPlugins?(ctx: ReaderPluginContext): readonly MilkdownPlugin[];
}

export interface PluginMenuSection {
  readonly id: string;
  readonly label: string;
  readonly items: readonly MenuItem[];
}
