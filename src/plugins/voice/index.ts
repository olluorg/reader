/**
 * Voice plugin — on-device voice typing (dictation).
 *
 * Hold a configurable trigger key (double-tap and hold) to dictate: the
 * microphone is captured and transcribed on-device by Whisper (transformers.js
 * + WebGPU) in a worker. While held, interim text shows as a live ghost
 * preview at the caret; on release it's committed into the document once. The
 * model is an explicit, opt-in download from settings — it never downloads on
 * its own, and audio never leaves the browser.
 *
 * State and lifecycle live in controller.ts; this file is just the
 * ReaderPlugin surface.
 */

import type { MilkdownPlugin } from '@milkdown/kit/ctx';
import type { ReaderPlugin, ReaderPluginContext } from '../api';
import { init } from './controller';
import { previewPlugin } from './preview';
import { openVoiceDialog } from './dialog';
import { t } from './i18n';

export const voicePlugin: ReaderPlugin = {
  id: 'voice',
  label: t('label'),

  async onAppStart(ctx: ReaderPluginContext) {
    await init(ctx);
  },

  editorPlugins(ctx: ReaderPluginContext): MilkdownPlugin[] {
    if (ctx.getMode() === 'view') return [];
    return [previewPlugin()];
  },

  menuItems() {
    return [{ label: t('menu.open'), action: openVoiceDialog }];
  },
};

export default voicePlugin;
