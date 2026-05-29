import type { ReaderPlugin } from '../api';
import { openLanguageDialog } from './dialog';

export const languagePlugin: ReaderPlugin = {
  id: 'language',
  label: 'Язык',
  menuItems() {
    return [{ label: 'Выбрать язык…', action: openLanguageDialog }];
  },
};

export default languagePlugin;
