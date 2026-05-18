import type { DocumentPayload } from '../types';
import { t } from '../i18n';

export interface NewDocumentResult {
  title: string;
  doc: DocumentPayload;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

export function openNewDocumentDialog(): Promise<NewDocumentResult | null> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'dialog dialog--narrow';
    dialog.innerHTML = `
      <h2 class="dialog__title"></h2>
      <p class="dialog__desc"></p>

      <div class="dialog__field">
        <label class="dialog__label" for="new-doc-title" data-role="title-label"></label>
        <input class="dialog__input" type="text" id="new-doc-title"
               autocomplete="off" maxlength="200">
      </div>

      <div class="dialog__field">
        <span class="dialog__label" data-role="import-label">
          <span data-role="import-hint" class="dialog__hint"></span>
        </span>
        <label class="dialog__file" data-role="drop">
          <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden>
          <span class="dialog__file-label" data-role="file-label"></span>
        </label>
        <div class="dialog__file-error" data-role="file-error" hidden></div>
      </div>

      <div class="dialog__actions">
        <button class="btn btn--ghost" data-action="cancel"></button>
        <button class="btn btn--primary" data-action="create"></button>
      </div>
    `;

    (dialog.querySelector('.dialog__title') as HTMLElement).textContent = t('newDoc.title');
    (dialog.querySelector('.dialog__desc') as HTMLElement).textContent = t('newDoc.desc');
    (dialog.querySelector('[data-role="title-label"]') as HTMLElement).textContent = t(
      'newDoc.label.title',
    );
    const titleInput0 = dialog.querySelector('#new-doc-title') as HTMLInputElement;
    titleInput0.placeholder = t('newDoc.placeholder.title');
    const importLabel = dialog.querySelector('[data-role="import-label"]') as HTMLElement;
    importLabel.prepend(document.createTextNode(t('newDoc.label.import') + ' '));
    (dialog.querySelector('[data-role="import-hint"]') as HTMLElement).textContent = t(
      'newDoc.import.hint',
    );
    (dialog.querySelector('[data-role="file-label"]') as HTMLElement).textContent = t(
      'newDoc.import.placeholder',
    );
    (dialog.querySelector('[data-action="cancel"]') as HTMLElement).textContent =
      t('newDoc.btn.cancel');
    (dialog.querySelector('[data-action="create"]') as HTMLElement).textContent =
      t('newDoc.btn.create');

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    const titleInput = dialog.querySelector('#new-doc-title') as HTMLInputElement;
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    const fileLabel = dialog.querySelector('[data-role="file-label"]') as HTMLElement;
    const fileError = dialog.querySelector('[data-role="file-error"]') as HTMLElement;
    const drop = dialog.querySelector('[data-role="drop"]') as HTMLElement;

    let imported: { name: string; content: string } | null = null;
    let titleEdited = false;
    titleInput.addEventListener('input', () => {
      titleEdited = titleInput.value.trim().length > 0;
    });

    const showFileError = (msg: string) => {
      fileError.textContent = msg;
      fileError.hidden = false;
    };
    const clearFileError = () => {
      fileError.hidden = true;
      fileError.textContent = '';
    };

    const acceptFile = async (file: File) => {
      clearFileError();
      const name = file.name.toLowerCase();
      const isMd = name.endsWith('.md') || name.endsWith('.markdown');
      const isTxt = name.endsWith('.txt');
      if (!isMd && !isTxt) {
        showFileError(t('newDoc.import.error.type'));
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        showFileError(
          t('newDoc.import.error.size', {
            mb: (file.size / 1024 / 1024).toFixed(1),
          }),
        );
        return;
      }
      try {
        const content = await file.text();
        imported = { name: file.name, content };
        fileLabel.textContent = t('newDoc.import.picked', {
          name: file.name,
          kb: (file.size / 1024).toFixed(1),
        });
        drop.classList.add('dialog__file--has-file');
        if (!titleEdited) {
          titleInput.value = stripExtension(file.name);
        }
      } catch (err) {
        showFileError(
          t('newDoc.import.error.read', { message: (err as Error).message }),
        );
      }
    };

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) acceptFile(file);
    });

    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('dialog__file--dragover');
    });
    drop.addEventListener('dragleave', () => {
      drop.classList.remove('dialog__file--dragover');
    });
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('dialog__file--dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) acceptFile(file);
    });

    const cleanup = () => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
    };
    const cancel = () => {
      cleanup();
      resolve(null);
    };
    const create = () => {
      const title = titleInput.value.trim() || t('newDoc.untitled');
      const markdown = imported
        ? imported.content
        : `# ${title}\n\n`;
      cleanup();
      resolve({
        title,
        doc: { markdown, comments: [], title },
      });
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
      if (e.key === 'Enter' && document.activeElement === titleInput) create();
    };
    document.addEventListener('keydown', onKey);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) cancel();
    });
    dialog.querySelector('[data-action="cancel"]')!.addEventListener('click', cancel);
    dialog.querySelector('[data-action="create"]')!.addEventListener('click', create);

    titleInput.focus();
  });
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}
