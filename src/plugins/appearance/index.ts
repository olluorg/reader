import type { ReaderPlugin } from '../api';
import { applyAppearance } from './apply';
import { openAppearanceDialog } from './dialog';
import { t } from './i18n';
import { loadAppearance } from './storage';

export const appearancePlugin: ReaderPlugin = {
  id: 'appearance',
  label: t('label'),
  onAppStart() {
    // Apply persisted preferences as early as possible so the user
    // doesn't see a flash of unstyled (default) theme on load.
    applyAppearance(loadAppearance());
  },
  menuItems() {
    return [{ label: t('menu.open'), action: openAppearanceDialog }];
  },
};

export default appearancePlugin;
