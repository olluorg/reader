export const en = {
  // toolbar
  'toolbar.brand': 'Reader',
  'toolbar.mode.view': 'reading',
  'toolbar.mode.comment': 'commenting',
  'toolbar.mode.edit': 'editing',
  'toolbar.parts.title': 'Document is split into {total} parts',
  'toolbar.parts.badge': '{loaded}/{total} parts',
  'toolbar.btn.history': 'History',
  'toolbar.btn.history.title': 'Documents you have opened',
  'toolbar.btn.saved': 'Saved',
  'toolbar.btn.saved.title': 'Saved bookmarks',
  'toolbar.btn.mine': 'Mine',
  'toolbar.btn.mine.title': 'Documents you have published',
  'toolbar.btn.versions': 'Versions ({count})',
  'toolbar.btn.versions.title': 'Document version history',
  'toolbar.btn.parts': 'Parts ({loaded}/{total})',
  'toolbar.btn.parts.title': 'Add missing parts',
  'toolbar.btn.new': 'New',
  'toolbar.btn.share': 'Share',

  // status bar
  'status.text': '{words} words · {kb} / {maxKb} KB',

  // welcome doc
  'welcome.markdown': `# A quiet place to read & write

This is a markdown editor without a server. Documents live entirely inside their share links — compressed, optionally encrypted, completely yours.

## How it works

- **Write.** Markdown renders live as you type.
- **Share.** Click *Share* and you get a self-contained URL.
- **Encrypt.** Add a password and the link becomes AES-256 ciphertext.
- **Roles.** Generate distinct links for *view*, *comment*, or *edit*.

## What this means

> No server. No database. No account. The link *is* the document.

Long documents make long URLs. Aggressive compression (brotli where available, deflate-raw otherwise) keeps things tight — watch the size meter at the bottom of the screen.

---

Start typing to replace this. Welcome.`,

  // raw view banner
  'raw.tooLarge':
    'Document is too large for the editor ({chars} characters > limit {max}).',
  'raw.editorFailed':
    "Editor couldn't process the content — showing raw markdown.",
  'raw.banner.suffix':
    'You can read and edit it as plain text — sharing and versions still work.',
  'raw.btn.tryEditor': 'Open in editor',
  'raw.editorCrashedToast':
    "Editor couldn't handle this document ({detail}). Switching to raw mode.",

  // limit toast
  'limit.tooLargeToast':
    'Document outgrew the single-link limit (~{kb} KB > {maxKb} KB). When sharing you will be offered to split it.',

  // missing parts
  'parts.missing.sub': 'Part {n} of {total} is not loaded yet',
  'parts.missing.addBtn': 'Add link',
  'parts.missing.fallbackTitle': 'Part {n}',
  'parts.boundary.aria': 'Start of part {n} of {total}: {title}',
  'parts.boundary.index': 'Part {n}/{total}',
  'parts.loaded.toast': 'Part «{title}» loaded',

  // load-part errors
  'parts.err.notPartsMode': 'not in parts mode',
  'parts.err.notReaderLink': "doesn't look like a Reader link",
  'parts.err.otherDocument': 'link belongs to a different document',
  'parts.err.alreadyLoaded': 'this part is already loaded',
  'parts.err.decode': 'decode error',
  'parts.err.tooManyAttempts': 'too many password attempts',
  'parts.err.cancelled': 'cancelled',

  // top-level errors
  'error.title': "Can't open this document",
  'error.startNew': 'Start a new document →',
  'error.passwordRequired':
    'This document is encrypted. A password is required to view it.',
  'error.tooManyAttempts': 'Too many incorrect password attempts.',
  'error.decode': 'Failed to decode link: {message}',
  'error.unexpected': 'Unexpected error: {message}',
  'error.unknown': 'unknown error',

  // library dialog
  'library.history.title': 'Open history',
  'library.history.desc':
    'Documents you opened via link. Most recent first.',
  'library.history.empty':
    'Nothing here yet. Open any link and it will show up here.',
  'library.saved.title': 'Saved',
  'library.saved.desc':
    'Bookmarks: links sent to you that you decided to keep.',
  'library.saved.empty':
    'Nothing saved yet. Tap ☆ in History to bookmark.',
  'library.mine.title': 'My documents',
  'library.mine.desc':
    'Documents you created or edited and published via Share.',
  'library.mine.empty':
    'Documents you generate links for will appear here.',
  'library.btn.close': 'Close',
  'library.row.open': 'Open',
  'library.row.unsave': 'Remove from saved',
  'library.row.save': 'Bookmark',
  'library.row.delete': 'Remove from list',
  'library.size.chars': '{n} ch',
  'library.size.kb': '{n} K',
  'library.mode.view': 'view',
  'library.mode.comment': 'comment',
  'library.mode.edit': 'edit',

  // time
  'time.justNow': 'just now',
  'time.minutesAgo': {
    one: '{n} min ago',
    other: '{n} min ago',
  },
  'time.hoursAgo': {
    one: '{n} h ago',
    other: '{n} h ago',
  },
  'time.daysAgo': {
    one: '{n} d ago',
    other: '{n} d ago',
  },

  // new document dialog
  'newDoc.title': 'New document',
  'newDoc.desc':
    'Give it a name, then start from scratch or import a Markdown / text file.',
  'newDoc.label.title': 'Title',
  'newDoc.placeholder.title': 'Untitled',
  'newDoc.label.import': 'Import',
  'newDoc.import.hint': 'optional — .md or .txt',
  'newDoc.import.placeholder': 'Choose a file or drop one here',
  'newDoc.import.error.type': 'Only .md and .txt files are supported.',
  'newDoc.import.error.size':
    'File is too large ({mb} MB). Max 2 MB.',
  'newDoc.import.error.read': "Couldn't read file: {message}",
  'newDoc.import.picked': '{name} · {kb} KB',
  'newDoc.btn.cancel': 'Cancel',
  'newDoc.btn.create': 'Create',
  'newDoc.untitled': 'Untitled',

  // password prompt
  'password.title': 'Password required',
  'password.desc.retry': 'That password didn’t work. Try again.',
  'password.desc.first':
    'This document is encrypted. Enter the password to unlock it.',
  'password.placeholder': 'Password',
  'password.btn.cancel': 'Cancel',
  'password.btn.ok': 'Unlock',

  // share dialog
  'share.title': 'Share document',
  'share.desc':
    'Generates a self-contained URL with the encrypted document inside. Nothing is uploaded — the link <em>is</em> the document.',
  'share.label.access': 'Access level',
  'share.mode.view.label': 'View only',
  'share.mode.view.desc':
    'Read-only. Recipient cannot edit or add comments.',
  'share.mode.comment.label': 'Comment',
  'share.mode.comment.desc':
    'Recipient can read and add comments (commenting UI coming soon).',
  'share.mode.edit.label': 'Edit',
  'share.mode.edit.desc':
    'Full editing access. Recipient gets the same powers as you.',
  'share.label.password': 'Password',
  'share.hint.password': 'optional — AES-256-GCM encryption',
  'share.placeholder.password': 'Leave empty for no encryption',
  'share.versioning.label': 'Save a version with this link',
  'share.versioning.desc':
    'The change history since you opened the document will be packed into the link. The recipient will see the applied edits. Off by default.',
  'share.split.label': 'Split into parts',
  'share.split.hint': 'if the document does not fit into one link',
  'share.split.placeholder': 'auto',
  'share.split.note': 'Each part is a separate link with the same docId.',
  'share.result.label': 'Shareable link',
  'share.result.copy': 'Copy link',
  'share.parts.label': 'Part links',
  'share.parts.copyAll': 'Copy all links',
  'share.parts.copy': 'Copy',
  'share.parts.summary': '{count} links · {kb} KB total{lock}',
  'share.media.label': 'Image links',
  'share.media.note':
    'Each image is its own resource. Share these alongside the main link; recipients can open each one or import the file from disk (matched by perceptual hash).',
  'share.media.copyAll': 'Copy image links',
  'share.media.copyOne': 'Copy',
  'share.media.fallbackTitle': 'image · {id}…',
  'share.media.summary': {
    one: '{count} resource · {kb} KB total{lock}',
    other: '{count} resources · {kb} KB total{lock}',
  },
  'share.media.missingBytes':
    "Couldn't find bytes for image {name} — skipping.",
  'share.media.packFailed': "Couldn't pack image {name}: {message}",
  'share.btn.close': 'Close',
  'share.btn.generate': 'Generate link',
  'share.copied': 'Copied ✓',
  'share.meta.payload': '{kb} KB payload · {chars} chars{lock}',
  'share.meta.payloadCopied':
    '{kb} KB payload · {chars} chars{lock} · copied',
  'share.meta.encrypted': ' · 🔒 encrypted',
  'share.meta.imagesInLink': {
    one: ' · {count} image in link',
    other: ' · {count} images in link',
  },
  'share.toast.tooLong':
    'Link is still over {maxKb} KB. Splitting into {parts} parts automatically.',
  'share.toast.suggestSplit':
    'Link is too long ({kb} KB > {maxKb} KB). Split the document into parts or press Generate again — it will be split into {parts} automatically.',
  'share.toast.suggestBtn': 'Split into {parts}',
  'share.toast.splitDone': 'Document split into {count} parts.',
  'share.toast.splitFailed': "Couldn't split: {message}",
  'share.toast.encodeFailed': 'Failed to encode: {message}',

  // parts dialog
  'partsDialog.title': 'Document is split',
  'partsDialog.desc.missing':
    'This document was too large and was split into <strong>{total}</strong> links. Paste the remaining {missing} to see the whole text. Missing parts will show as «…» inside the document — you can add them later.',
  'partsDialog.desc.allLoaded':
    'This document was split into <strong>{total}</strong> links. All parts are already loaded ✓',
  'partsDialog.btn.skip': 'Skip',
  'partsDialog.btn.done': 'Done',
  'partsDialog.status.loaded': '✓ loaded',
  'partsDialog.status.empty': 'no link',
  'partsDialog.status.loading': 'loading…',
  'partsDialog.status.notReader': "doesn't look like a Reader link",
  'partsDialog.input.placeholder': 'https://…#hash',

  // versions dialog
  'versions.title': 'Version history',
  'versions.empty':
    'No versions saved yet. Enable «Save a version» in the Share dialog to capture a snapshot.',
  'versions.summary': {
    one: '{count} version. Each entry is the document at the moment of sharing.',
    other: '{count} versions. Each entry is the document at the moment of sharing.',
  },
  'versions.unsaved': 'Unsaved edits',
  'versions.noChanges': 'No changes.',
  'versions.btn.close': 'Close',

  // media dialog
  'media.title': 'Document images',
  'media.desc.missing':
    'The document references <strong>{total}</strong> {imagesWord}. Missing {missing}. Paste a resource link or pick a file from disk — even a recompressed copy is recognized by the perceptual hash.',
  'media.desc.allLoaded':
    'The document references <strong>{total}</strong> {imagesWord}. All images are loaded ✓',
  'media.imagesWord': {
    one: 'image',
    other: 'images',
  },
  'media.btn.skip': 'Skip',
  'media.btn.done': 'Done',
  'media.status.loaded': '✓ loaded',
  'media.status.empty': 'no file',
  'media.status.loading': 'loading…',
  'media.status.importing': 'importing…',
  'media.status.imported': '✓ imported',
  'media.status.importedFuzzy': '✓ imported · similarity {match}/64 bits',
  'media.status.notReader': "doesn't look like a Reader link",
  'media.input.placeholder': 'https://…#resource hash',
  'media.file.placeholder': 'Pick a file or drop it here',
  'media.file.picked': '{name} · {kb} KB',
  'media.fallbackTitle': 'Image {n}',

  // split preview
  'preview.willSplitInto': 'Document will split into {count} parts when shared',
  'preview.lineIndex': 'Part {n}/{total}',
  'preview.lineTitle': 'When shared, the document will be cut here — start of part {n} of {total}',

  // toast
  'toast.dismiss': 'Dismiss',

  // editor
  'editor.imageLabel': 'Image',

  // toolbar plugins dropdown
  'toolbar.plugins.label': 'Extensions',

  // image import / media (main.ts)
  'image.err.notImage': "This doesn't look like an image.",
  'image.err.tooLarge': 'File is too large ({mb} MB). Max {maxMb} MB.',
  'image.err.read': "Couldn't read file: {message}",
  'image.err.decode': "Couldn't decode image: {message}",
  'image.optimized': 'Image optimized: {from} → {to} KB (-{saved}%)',
  'image.insert.editorOnly': 'Inserting images is only available in the editor',
  'image.added': 'Image «{name}» added',
  'image.noName': 'untitled',
  'media.missing.sizeUnknown': 'size unknown',
  'media.missing.subLqip': 'Not loaded · {size} · {w}×{h}',
  'media.missing.subPlain': 'Image not loaded · {size}',
  'media.missing.add': 'Add',
  'media.collector.empty': 'This document has no images',
  'media.err.notMediaLink': "this isn't an image link",
  'media.err.encrypted': 'resource is encrypted — open the main document with its password',
  'media.err.wrongPassword': "password doesn't fit this resource",
  'media.err.decode': "couldn't decode: {message}",
  'media.import.mismatchHint.both':
    'neither hash nor preview matched any expected image',
  'media.import.mismatchHint.hash': 'hash matched no expected image',
  'media.import.mismatch': "This is a different image — {hint}. Try another file.",
  'media.import.previewMismatch':
    'This is a different image — the preview differs from the one in the document (divergence {delta}/255). Try another file.',
  'media.landing.saved':
    'Image «{name}» saved. Open a document that uses it — it will load automatically.',
  'media.landing.encrypted':
    'This resource is encrypted. Open the main document link first with the same password — images are decoded with the same keys.',
  'media.landing.loadFailed': "Couldn't load resource: {message}",
} as const;
