import { createTranslator } from '../../i18n';

// Each plugin is a self-contained unit and ships its own translations.
// English is required (it doubles as the fallback); other languages are
// optional and kept key-for-key via the `Record<keyof typeof en, string>`
// annotation below.
const en = {
  label: 'Language',
  'menu.open': 'Choose language…',
  'dialog.title': 'Language',
  'dialog.desc':
    "By default the UI language follows your system settings. Your choice is saved in this browser's localStorage.",
  'option.auto': 'System default',
  'btn.close': 'Close',
} as const;

const ru: Record<keyof typeof en, string> = {
  label: 'Язык',
  'menu.open': 'Выбрать язык…',
  'dialog.title': 'Язык',
  'dialog.desc':
    'По умолчанию язык интерфейса определяется системными настройками. Выбор сохраняется в localStorage этого браузера.',
  'option.auto': 'Системный',
  'btn.close': 'Закрыть',
};

export const t = createTranslator({ en, ru });
