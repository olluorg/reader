import type { ReaderPlugin } from '../api';
import { openLanguageDialog } from './dialog';
import { t } from './i18n';

export const languagePlugin: ReaderPlugin = {
  id: 'language',
  label: t('label'),
  menuItems() {
    return [{ label: t('menu.open'), action: openLanguageDialog }];
  },
};

export default languagePlugin;
