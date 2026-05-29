import { createTranslator } from '../../i18n';

// Self-contained translations for the predict plugin. English is required and
// doubles as the fallback; Russian is provided key-for-key.
const en = {
  label: 'Autocomplete',
  'menu.open': 'Autocomplete settings…',
  'menu.reset': 'Forget what it learned',

  'dialog.title': 'Autocomplete',
  'dialog.desc':
    'Inline suggestions as you type — press Tab (or click) to accept. Everything stays on this device.',

  'tier0.label': 'Word completion',
  'tier0.hint': 'Instant, offline, learns from your writing. No download.',

  'tier1.label': 'Phrase suggestions (English)',
  'tier1.desc':
    'Optional on-device model that suggests whole phrases in English. Russian keeps word completion.',
  'tier1.warn': 'The model is about {mb} MB. On mobile data the download can be slow and costly.',
  'tier1.checking': 'Checking this device…',
  'tier1.unsupported': 'Not supported on this device (needs WebGPU).',
  'tier1.idle': 'Not downloaded.',
  'tier1.loading': 'Downloading… {pct}%',
  'tier1.ready': '✓ Model active',
  'tier1.errorState': 'Download failed.',

  'state.on': 'On',
  'state.off': 'Off',
  'btn.download': 'Download (~{mb} MB)',
  'btn.remove': 'Remove model',
  'btn.retry': 'Retry',
  'btn.close': 'Close',

  'toast.reset': 'Cleared the learned writing model',
  'toast.tier1.ready': 'Phrase suggestions ready',
  'toast.tier1.error': 'Phrase model unavailable — staying with word completion',
} as const;

const ru: Record<keyof typeof en, string> = {
  label: 'Автодополнение',
  'menu.open': 'Настройки автодополнения…',
  'menu.reset': 'Забыть выученное',

  'dialog.title': 'Автодополнение',
  'dialog.desc':
    'Подсказки прямо при наборе — Tab (или клик) принимает. Всё остаётся на этом устройстве.',

  'tier0.label': 'Дополнение слов',
  'tier0.hint': 'Мгновенно, оффлайн, учится на ваших текстах. Без загрузки.',

  'tier1.label': 'Подсказки фраз (английский)',
  'tier1.desc':
    'Необязательная модель на устройстве, подсказывает целые фразы по-английски. Для русского — дополнение слов.',
  'tier1.warn': 'Модель весит около {mb} МБ. На мобильном трафике загрузка может быть долгой и дорогой.',
  'tier1.checking': 'Проверка устройства…',
  'tier1.unsupported': 'Не поддерживается на этом устройстве (нужен WebGPU).',
  'tier1.idle': 'Не загружена.',
  'tier1.loading': 'Загрузка… {pct}%',
  'tier1.ready': '✓ Модель активна',
  'tier1.errorState': 'Не удалось загрузить.',

  'state.on': 'Вкл',
  'state.off': 'Выкл',
  'btn.download': 'Скачать (~{mb} МБ)',
  'btn.remove': 'Удалить модель',
  'btn.retry': 'Повторить',
  'btn.close': 'Закрыть',

  'toast.reset': 'Выученная модель письма очищена',
  'toast.tier1.ready': 'Подсказки фраз готовы',
  'toast.tier1.error': 'Модель фраз недоступна — остаёмся на дополнении слов',
};

export const t = createTranslator({ en, ru });
