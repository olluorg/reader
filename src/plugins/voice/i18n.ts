import { createTranslator } from '../../i18n';

// Self-contained plugin translations. English is required (and is the
// fallback); other languages are kept key-for-key via the annotation below.
const en = {
  label: 'Voice typing',
  'menu.open': 'Voice typing settings…',

  'dialog.title': 'Voice typing',
  'dialog.desc':
    'Hold a key to dictate: text appears live as a preview and is inserted at the caret when you release. Recognition runs fully on your device — audio never leaves the browser.',

  'enabled.label': 'Voice typing',
  'enabled.hint': 'Hold a trigger key to dictate; release to insert.',

  'bindings.label': 'Dictation triggers',
  'bindings.hint':
    'Hold a key to dictate in its language; add another key for a second language. A modifier (Ctrl/Alt/Shift) is cleanest — a quick tap or shortcut never triggers; a printable key types its character on press.',
  'bindings.add': 'Add trigger',
  'bindings.empty': 'No triggers yet — add one to dictate.',
  'bindings.setKey': 'Set key…',
  'bindings.capturing': 'Press a key…',
  'bindings.remove': 'Remove',

  'model.label': 'Recognition model',
  'model.desc':
    'A speech model (Whisper) runs on-device via WebGPU. You download it once; it is cached by the browser and works offline afterwards.',
  'model.pickHint':
    'Bigger models are more accurate — especially for Russian — but download more and transcribe slower per tick.',
  'model.size': '~{mb} MB',
  'model.checking': 'Checking device support…',
  'model.unsupported':
    'This device cannot run on-device voice typing (needs WebGPU, a microphone, and a secure HTTPS page).',
  'model.idle': 'Not downloaded yet.',
  'model.warn': 'Downloads ~{mb} MB once, then runs offline. Best on Wi-Fi.',
  'model.loading': 'Downloading… {pct}%',
  'model.ready': 'Ready — hold the trigger key to dictate.',
  'model.errorState': 'Download failed.',

  'btn.download': 'Download (~{mb} MB)',
  'btn.remove': 'Remove model',
  'btn.retry': 'Retry',
  'btn.close': 'Close',

  'overlay.listening': '🎙 Listening…',
  'overlay.transcribing': 'Transcribing…',

  'toast.ready': 'Voice model ready.',
  'toast.error': 'Voice model failed to load.',
  'toast.micDenied': 'Microphone access was denied.',
  'toast.notReady': 'Download the voice model in settings first.',
} as const;

const ru: Record<keyof typeof en, string> = {
  label: 'Голосовой набор',
  'menu.open': 'Настройки голосового набора…',

  'dialog.title': 'Голосовой набор',
  'dialog.desc':
    'Удерживайте клавишу для диктовки: текст показывается как живое превью и вставляется у курсора при отпускании. Распознавание идёт полностью на устройстве — аудио не покидает браузер.',

  'enabled.label': 'Голосовой набор',
  'enabled.hint': 'Удерживайте клавишу-триггер для диктовки; отпустите — вставится.',

  'bindings.label': 'Триггеры диктовки',
  'bindings.hint':
    'Удерживайте клавишу, чтобы диктовать на её языке; добавьте ещё клавишу для второго языка. Модификатор (Ctrl/Alt/Shift) — чище всего: быстрое нажатие или шорткат не запускает диктовку; печатная клавиша вводит свой символ при нажатии.',
  'bindings.add': 'Добавить триггер',
  'bindings.empty': 'Триггеров пока нет — добавьте, чтобы диктовать.',
  'bindings.setKey': 'Задать клавишу…',
  'bindings.capturing': 'Нажмите клавишу…',
  'bindings.remove': 'Удалить',

  'model.label': 'Модель распознавания',
  'model.desc':
    'Речевая модель (Whisper) работает на устройстве через WebGPU. Скачивается один раз, кэшируется браузером и дальше работает офлайн.',
  'model.pickHint':
    'Модели побольше точнее — особенно для русского — но и скачиваются дольше, и расшифровывают медленнее на каждом тике.',
  'model.size': '~{mb} МБ',
  'model.checking': 'Проверка поддержки устройства…',
  'model.unsupported':
    'Это устройство не может запустить голосовой набор на устройстве (нужны WebGPU, микрофон и защищённая страница HTTPS).',
  'model.idle': 'Ещё не скачана.',
  'model.warn': 'Разовая загрузка ~{mb} МБ, дальше работает офлайн. Лучше по Wi-Fi.',
  'model.loading': 'Загрузка… {pct}%',
  'model.ready': 'Готово — удерживайте клавишу-триггер для диктовки.',
  'model.errorState': 'Не удалось скачать.',

  'btn.download': 'Скачать (~{mb} МБ)',
  'btn.remove': 'Удалить модель',
  'btn.retry': 'Повторить',
  'btn.close': 'Закрыть',

  'overlay.listening': '🎙 Слушаю…',
  'overlay.transcribing': 'Расшифровка…',

  'toast.ready': 'Голосовая модель готова.',
  'toast.error': 'Не удалось загрузить голосовую модель.',
  'toast.micDenied': 'Доступ к микрофону отклонён.',
  'toast.notReady': 'Сначала скачайте голосовую модель в настройках.',
};

export const t = createTranslator({ en, ru });
