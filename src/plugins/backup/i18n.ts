import { createTranslator } from '../../i18n';

const en = {
  label: 'Backup',
  'menu.open': 'Export / import…',
  'dialog.title': 'Backup',
  'dialog.desc':
    'A local file with your library and image cache. JSON — openable in a text editor. Nothing is uploaded.',
  'field.export': 'Export',
  'btn.download': 'Download .json',
  'field.restore': 'Restore',
  'btn.merge': 'Merge with local…',
  'btn.replace': 'Replace local…',
  'restore.hint':
    '«Merge» keeps existing entries and overwrites matching keys on top. «Replace» wipes local storage first.',
  'btn.close': 'Close',
  'export.done': 'Saved: {name} ({kb} KB)',
  'export.failed': "Couldn't create backup: {message}",
  'replace.confirm':
    'Replace local data with data from the file? Current entries will be deleted.',
  'import.badJson': 'File is not valid JSON',
  'import.replaced': 'Data replaced. Reload the page to see it.',
  'import.merged': 'Data merged. Reload the page to see it.',
  'import.failed': 'Restore failed: {message}',
} as const;

const ru: Record<keyof typeof en, string> = {
  label: 'Бэкап',
  'menu.open': 'Экспорт / импорт…',
  'dialog.title': 'Бэкап',
  'dialog.desc':
    'Локальный файл с вашей библиотекой и кэшем изображений. JSON — можно открыть в текстовом редакторе. Никуда не отправляется.',
  'field.export': 'Экспорт',
  'btn.download': 'Скачать .json',
  'field.restore': 'Восстановление',
  'btn.merge': 'Слить с локальными…',
  'btn.replace': 'Заменить локальные…',
  'restore.hint':
    '«Слить» оставляет существующие записи и поверх перезаписывает совпадающие ключи. «Заменить» сначала чистит локальные стораджи.',
  'btn.close': 'Закрыть',
  'export.done': 'Сохранено: {name} ({kb} KB)',
  'export.failed': 'Не удалось создать бэкап: {message}',
  'replace.confirm':
    'Заменить локальные данные данными из файла? Текущие записи будут удалены.',
  'import.badJson': 'Файл не является корректным JSON',
  'import.replaced': 'Данные заменены. Перезагрузите страницу для отображения.',
  'import.merged': 'Данные слиты. Перезагрузите страницу для отображения.',
  'import.failed': 'Восстановление не удалось: {message}',
};

export const t = createTranslator({ en, ru });
