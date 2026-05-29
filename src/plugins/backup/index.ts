import type { ReaderPlugin } from '../api';
import { openBackupDialog } from './dialog';
import { t } from './i18n';

export const backupPlugin: ReaderPlugin = {
  id: 'backup',
  label: t('label'),
  menuItems() {
    return [{ label: t('menu.open'), action: openBackupDialog }];
  },
};

export default backupPlugin;
