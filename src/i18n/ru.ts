export const ru = {
  // toolbar
  'toolbar.brand': 'Reader',
  'toolbar.mode.view': 'чтение',
  'toolbar.mode.comment': 'комментарии',
  'toolbar.mode.edit': 'редактирование',
  'toolbar.parts.title': 'Документ из {total} частей',
  'toolbar.parts.badge': '{loaded}/{total} частей',
  'toolbar.btn.history': 'История',
  'toolbar.btn.history.title': 'Документы, которые вы открывали',
  'toolbar.btn.saved': 'Сохранённые',
  'toolbar.btn.saved.title': 'Сохранённые закладки',
  'toolbar.btn.mine': 'Мои',
  'toolbar.btn.mine.title': 'Документы, которые вы публиковали',
  'toolbar.btn.versions': 'Версии ({count})',
  'toolbar.btn.versions.title': 'История версий документа',
  'toolbar.btn.parts': 'Части ({loaded}/{total})',
  'toolbar.btn.parts.title': 'Добавить недостающие части',
  'toolbar.btn.new': 'Новый',
  'toolbar.btn.share': 'Поделиться',

  // status bar
  'status.text': '{words} слов · {kb} / {maxKb} КБ',

  // welcome doc
  'welcome.markdown': `# Тихое место, чтобы читать и писать

Это редактор markdown без сервера. Документы целиком живут внутри ссылки — сжатые, при желании зашифрованные, полностью ваши.

## Как это работает

- **Пишите.** Markdown рендерится в реальном времени.
- **Делитесь.** Нажмите *Поделиться* — получите автономный URL.
- **Шифруйте.** Добавьте пароль — ссылка превратится в AES-256.
- **Роли.** Можно сделать отдельные ссылки для *чтения*, *комментирования* и *редактирования*.

## Что это значит

> Нет сервера. Нет базы. Нет аккаунта. Ссылка *и есть* документ.

Длинные документы → длинные ссылки. Агрессивное сжатие (brotli где есть, иначе deflate-raw) удерживает размер — следите за индикатором внизу экрана.

---

Начните печатать, чтобы заменить этот текст. Добро пожаловать.`,

  // raw view banner
  'raw.tooLarge':
    'Документ слишком большой для редактора ({chars} символов > лимит {max}).',
  'raw.editorFailed':
    'Редактор не смог обработать содержимое — показан сырой markdown.',
  'raw.banner.suffix':
    'Можно читать и редактировать как обычный текст, шаринг и версии работают.',
  'raw.btn.tryEditor': 'Открыть в редакторе',
  'raw.editorCrashedToast':
    'Редактор не справился с этим документом ({detail}). Переключаюсь на raw-режим.',

  // limit toast
  'limit.tooLargeToast':
    'Документ перерос лимит одной ссылки (~{kb} КБ > {maxKb} КБ). При шаринге будет предложено разбить на части.',

  // missing parts
  'parts.missing.sub': 'Часть {n} из {total} ещё не загружена',
  'parts.missing.addBtn': 'Добавить ссылку',
  'parts.missing.fallbackTitle': 'Часть {n}',
  'parts.boundary.aria': 'Начало части {n} из {total}: {title}',
  'parts.boundary.index': 'Часть {n}/{total}',
  'parts.loaded.toast': 'Часть «{title}» загружена',

  // load-part errors
  'parts.err.notPartsMode': 'не в режиме частей',
  'parts.err.notReaderLink': 'это не ссылка на часть документа',
  'parts.err.otherDocument': 'ссылка из другого документа',
  'parts.err.alreadyLoaded': 'эта часть уже загружена',
  'parts.err.decode': 'ошибка декодирования',
  'parts.err.tooManyAttempts': 'слишком много попыток ввода пароля',
  'parts.err.cancelled': 'отменено',

  // top-level errors
  'error.title': 'Не получается открыть документ',
  'error.startNew': 'Создать новый документ →',
  'error.passwordRequired':
    'Документ зашифрован. Чтобы открыть, нужен пароль.',
  'error.tooManyAttempts': 'Слишком много неверных попыток ввода пароля.',
  'error.decode': 'Не удалось декодировать ссылку: {message}',
  'error.unexpected': 'Непредвиденная ошибка: {message}',
  'error.unknown': 'неизвестная ошибка',

  // library dialog
  'library.history.title': 'История открытых',
  'library.history.desc':
    'Документы, которые вы открывали по ссылке. Самые свежие — сверху.',
  'library.history.empty':
    'Здесь пока пусто. Откройте любую ссылку — и она появится тут.',
  'library.saved.title': 'Сохранённые',
  'library.saved.desc':
    'Закладки: ссылки, которые вам прислали и вы решили оставить себе.',
  'library.saved.empty':
    'Пока ничего не сохранено. Нажмите ☆ в Истории, чтобы добавить закладку.',
  'library.mine.title': 'Мои документы',
  'library.mine.desc':
    'Документы, созданные или изменённые вами и опубликованные через Share.',
  'library.mine.empty':
    'Здесь появятся документы, для которых вы сгенерировали ссылку.',
  'library.btn.close': 'Закрыть',
  'library.row.open': 'Открыть',
  'library.row.unsave': 'Убрать из сохранённых',
  'library.row.save': 'Сохранить в закладки',
  'library.row.delete': 'Удалить из списка',
  'library.size.chars': '{n} сим',
  'library.size.kb': '{n} К',
  'library.mode.view': 'просмотр',
  'library.mode.comment': 'коммент',
  'library.mode.edit': 'правка',

  // time
  'time.justNow': 'только что',
  'time.minutesAgo': {
    one: '{n} мин назад',
    few: '{n} мин назад',
    many: '{n} мин назад',
    other: '{n} мин назад',
  },
  'time.hoursAgo': {
    one: '{n} ч назад',
    few: '{n} ч назад',
    many: '{n} ч назад',
    other: '{n} ч назад',
  },
  'time.daysAgo': {
    one: '{n} д назад',
    few: '{n} д назад',
    many: '{n} д назад',
    other: '{n} д назад',
  },

  // new document dialog
  'newDoc.title': 'Новый документ',
  'newDoc.desc':
    'Назовите его и начните с чистого листа или загрузите файл Markdown / текстовый.',
  'newDoc.label.title': 'Название',
  'newDoc.placeholder.title': 'Без названия',
  'newDoc.label.import': 'Импорт',
  'newDoc.import.hint': 'опционально — .md или .txt',
  'newDoc.import.placeholder': 'Выберите файл или перетащите его сюда',
  'newDoc.import.error.type': 'Поддерживаются только файлы .md и .txt.',
  'newDoc.import.error.size':
    'Файл слишком большой ({mb} МБ). Лимит — 2 МБ.',
  'newDoc.import.error.read': 'Не удалось прочитать файл: {message}',
  'newDoc.import.picked': '{name} · {kb} КБ',
  'newDoc.btn.cancel': 'Отмена',
  'newDoc.btn.create': 'Создать',
  'newDoc.untitled': 'Без названия',

  // password prompt
  'password.title': 'Требуется пароль',
  'password.desc.retry': 'Этот пароль не подошёл. Попробуйте ещё раз.',
  'password.desc.first':
    'Документ зашифрован. Введите пароль, чтобы открыть.',
  'password.placeholder': 'Пароль',
  'password.btn.cancel': 'Отмена',
  'password.btn.ok': 'Открыть',

  // share dialog
  'share.title': 'Поделиться документом',
  'share.desc':
    'Создаёт автономный URL с зашифрованным документом внутри. Ничего не загружается на сервер — ссылка <em>и есть</em> документ.',
  'share.label.access': 'Уровень доступа',
  'share.mode.view.label': 'Только чтение',
  'share.mode.view.desc':
    'Только просмотр. Получатель не может редактировать или комментировать.',
  'share.mode.comment.label': 'Комментарии',
  'share.mode.comment.desc':
    'Получатель может читать и оставлять комментарии (UI комментариев скоро).',
  'share.mode.edit.label': 'Редактирование',
  'share.mode.edit.desc':
    'Полный доступ. Получатель получает те же права, что и вы.',
  'share.label.password': 'Пароль',
  'share.hint.password': 'опционально — шифрование AES-256-GCM',
  'share.placeholder.password': 'Оставьте пустым, чтобы без шифрования',
  'share.versioning.label': 'Сохранить версию вместе с ссылкой',
  'share.versioning.desc':
    'История изменений с момента, когда вы открыли документ, будет упакована в ссылку. Получатель увидит примененные правки. По умолчанию выключено.',
  'share.split.label': 'Разбить на части',
  'share.split.hint': 'если документ не помещается в одну ссылку',
  'share.split.placeholder': 'авто',
  'share.split.note': 'Каждая часть — отдельная ссылка с тем же docId.',
  'share.result.label': 'Готовая ссылка',
  'share.result.copy': 'Скопировать ссылку',
  'share.parts.label': 'Ссылки на части',
  'share.parts.copyAll': 'Скопировать все ссылки',
  'share.parts.copy': 'Копировать',
  'share.parts.summary': '{count} ссылок · итого {kb} КБ{lock}',
  'share.media.label': 'Ссылки на изображения',
  'share.media.note':
    'Каждое изображение — отдельный ресурс. Поделитесь ими вместе с основной ссылкой; получатель сможет либо открыть каждую, либо импортировать файл с диска (совпадение определяется по перцептивному хэшу).',
  'share.media.copyAll': 'Скопировать ссылки на изображения',
  'share.media.copyOne': 'Копировать',
  'share.media.fallbackTitle': 'изображение · {id}…',
  'share.media.summary': {
    one: '{count} ресурс · итого {kb} КБ{lock}',
    few: '{count} ресурса · итого {kb} КБ{lock}',
    many: '{count} ресурсов · итого {kb} КБ{lock}',
    other: '{count} ресурсов · итого {kb} КБ{lock}',
  },
  'share.media.missingBytes':
    'Не нашёл байтов для изображения {name} — пропускаю.',
  'share.media.packFailed':
    'Не удалось упаковать изображение {name}: {message}',
  'share.btn.close': 'Закрыть',
  'share.btn.generate': 'Сгенерировать ссылку',
  'share.copied': 'Скопировано ✓',
  'share.meta.payload': '{kb} КБ payload · {chars} символов{lock}',
  'share.meta.payloadCopied':
    '{kb} КБ payload · {chars} символов{lock} · скопировано',
  'share.meta.encrypted': ' · 🔒 шифрование',
  'share.meta.imagesInLink': {
    one: ' · {count} картинка в ссылке',
    few: ' · {count} картинки в ссылке',
    many: ' · {count} картинок в ссылке',
    other: ' · {count} картинок в ссылке',
  },
  'share.toast.tooLong':
    'Ссылка всё ещё превышает {maxKb} КБ. Разбиваю на {parts} частей автоматически.',
  'share.toast.suggestSplit':
    'Ссылка получилась слишком длинной ({kb} КБ > {maxKb} КБ лимит). Разбейте документ на части или нажмите Generate ещё раз — он будет разделён автоматически на {parts}.',
  'share.toast.suggestBtn': 'Разбить на {parts}',
  'share.toast.splitDone': 'Документ разбит на {count} частей.',
  'share.toast.splitFailed': 'Не удалось разбить: {message}',
  'share.toast.encodeFailed': 'Не удалось закодировать: {message}',

  // parts dialog
  'partsDialog.title': 'Документ разбит на части',
  'partsDialog.desc.missing':
    'Этот документ слишком большой и был разделён на <strong>{total}</strong> ссылок. Вставьте оставшиеся {missing}, чтобы увидеть весь текст. Пропущенные части отобразятся как «…» в самом документе — вы сможете добавить их позже.',
  'partsDialog.desc.allLoaded':
    'Этот документ разделён на <strong>{total}</strong> ссылок. Все части уже загружены ✓',
  'partsDialog.btn.skip': 'Пропустить',
  'partsDialog.btn.done': 'Готово',
  'partsDialog.status.loaded': '✓ загружено',
  'partsDialog.status.empty': 'нет ссылки',
  'partsDialog.status.loading': 'загружаю…',
  'partsDialog.status.notReader': 'не похоже на ссылку Reader',
  'partsDialog.input.placeholder': 'https://…#хэш',

  // versions dialog
  'versions.title': 'История версий',
  'versions.empty':
    'Версии пока не сохранялись. Включите «Сохранить версию» в диалоге Share, чтобы зафиксировать снимок.',
  'versions.summary': {
    one: '{count} версия. Каждая запись — состояние документа в момент шаринга.',
    few: '{count} версии. Каждая запись — состояние документа в момент шаринга.',
    many: '{count} версий. Каждая запись — состояние документа в момент шаринга.',
    other: '{count} версий. Каждая запись — состояние документа в момент шаринга.',
  },
  'versions.unsaved': 'Несохранённые правки',
  'versions.noChanges': 'Без изменений.',
  'versions.btn.close': 'Закрыть',

  // media dialog
  'media.title': 'Изображения документа',
  'media.desc.missing':
    'Документ ссылается на <strong>{total}</strong> {imagesWord}. Не хватает {missing}. Вставьте ссылку на ресурс или выберите файл с диска — даже пережатая копия будет распознана по перцептивному хэшу.',
  'media.desc.allLoaded':
    'Документ ссылается на <strong>{total}</strong> {imagesWord}. Все изображения уже загружены ✓',
  'media.imagesWord': {
    one: 'изображение',
    few: 'изображения',
    many: 'изображений',
    other: 'изображений',
  },
  'media.btn.skip': 'Пропустить',
  'media.btn.done': 'Готово',
  'media.status.loaded': '✓ загружено',
  'media.status.empty': 'нет файла',
  'media.status.loading': 'загружаю…',
  'media.status.importing': 'импортирую…',
  'media.status.imported': '✓ импортировано',
  'media.status.importedFuzzy': '✓ импортировано · похожесть {match}/64 бит',
  'media.status.notReader': 'не похоже на ссылку Reader',
  'media.input.placeholder': 'https://…#хэш ресурса',
  'media.file.placeholder': 'Выбрать файл или перетащить сюда',
  'media.file.picked': '{name} · {kb} КБ',
  'media.fallbackTitle': 'Изображение {n}',

  // split preview
  'preview.willSplitInto': 'Документ разобьётся на {count} частей при шаринге',
  'preview.lineIndex': 'Часть {n}/{total}',
  'preview.lineTitle': 'При шаринге документ разрежется здесь — это начало части {n} из {total}',

  // toast
  'toast.dismiss': 'Закрыть',

  // editor
  'editor.imageLabel': 'Изображение',

  // toolbar plugins dropdown
  'toolbar.plugins.label': 'Расширения',

  // image import / media (main.ts)
  'image.err.notImage': 'Это не похоже на изображение.',
  'image.err.tooLarge': 'Файл слишком большой ({mb} MB). Максимум — {maxMb} MB.',
  'image.err.read': 'Не удалось прочитать файл: {message}',
  'image.err.decode': 'Не удалось декодировать изображение: {message}',
  'image.optimized': 'Изображение оптимизировано: {from} → {to} KB (-{saved}%)',
  'image.insert.editorOnly': 'Вставка изображений доступна только в редакторе',
  'image.added': 'Изображение «{name}» добавлено',
  'image.noName': 'без имени',
  'media.missing.sizeUnknown': 'размер неизвестен',
  'media.missing.subLqip': 'Не загружено · {size} · {w}×{h}',
  'media.missing.subPlain': 'Изображение не загружено · {size}',
  'media.missing.add': 'Добавить',
  'media.collector.empty': 'В этом документе нет изображений',
  'media.err.notMediaLink': 'это не ссылка на изображение',
  'media.err.encrypted':
    'ресурс зашифрован — откройте основной документ с паролем',
  'media.err.wrongPassword': 'пароль не подходит этому ресурсу',
  'media.err.decode': 'не удалось декодировать: {message}',
  'media.import.mismatchHint.both':
    'ни хэш, ни превью не совпали ни с одним ожидаемым изображением',
  'media.import.mismatchHint.hash':
    'хэш не совпал ни с одним ожидаемым изображением',
  'media.import.mismatch':
    'Это другое изображение — {hint}. Попробуйте другой файл.',
  'media.import.previewMismatch':
    'Это другое изображение — превью отличается от того, что в документе (расхождение {delta}/255). Попробуйте другой файл.',
  'media.landing.saved':
    'Изображение «{name}» сохранено. Откройте документ, который его использует — оно подгрузится автоматически.',
  'media.landing.encrypted':
    'Этот ресурс зашифрован. Откройте сначала ссылку на основной документ с тем же паролем — изображения декодируются с теми же ключами.',
  'media.landing.loadFailed': 'Не удалось загрузить ресурс: {message}',
} as const;
