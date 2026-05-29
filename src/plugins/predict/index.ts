/**
 * Predict plugin — offline inline autocomplete.
 *
 * Tier 0 (always on): per-language n-gram ghost-text completion, learned from
 * the user's writing into a local IndexedDB. Instant, no download, offline.
 *
 * Tier 1 (English only, capable devices, explicit opt-in): a small LM
 * (distilgpt2, ~80 MB) in a WebGPU worker for whole-phrase suggestions. The
 * user downloads it deliberately from settings; it never downloads on its own.
 *
 * State and lifecycle live in controller.ts; this file is just the
 * ReaderPlugin surface.
 */

import type { MilkdownPlugin } from '@milkdown/kit/ctx';
import type { ReaderPlugin, ReaderPluginContext } from '../api';
import { ghostPlugin } from './ghost';
import { init, onEdited, ghostSources } from './controller';
import { openPredictDialog } from './dialog';
import { t } from './i18n';

export const predictPlugin: ReaderPlugin = {
  id: 'predict',
  label: t('label'),

  async onAppStart() {
    await init();
  },

  onDocEdited(_ctx, markdown) {
    onEdited(markdown);
  },

  editorPlugins(ctx: ReaderPluginContext): MilkdownPlugin[] {
    if (ctx.getMode() === 'view') return [];
    const sources = ghostSources();
    return sources ? [ghostPlugin(sources)] : [];
  },

  menuItems() {
    return [{ label: t('menu.open'), action: openPredictDialog }];
  },
};

export default predictPlugin;
