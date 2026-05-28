import type { ReaderPlugin } from '../api';
import { openBackupDialog } from './dialog';

export const backupPlugin: ReaderPlugin = {
  id: 'backup',
  label: 'Бэкап',
  menuItems() {
    return [{ label: 'Экспорт / импорт…', action: openBackupDialog }];
  },
};

export default backupPlugin;
