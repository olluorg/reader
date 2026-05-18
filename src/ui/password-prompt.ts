import { t } from '../i18n';

export function promptPassword(opts: { retry?: boolean }): Promise<string | null> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'dialog dialog--narrow';
    dialog.innerHTML = `
      <h2 class="dialog__title"></h2>
      <p class="dialog__desc"></p>
      <div class="dialog__field">
        <input class="dialog__input" type="password" autocomplete="off">
      </div>
      <div class="dialog__actions">
        <button class="btn btn--ghost" data-action="cancel"></button>
        <button class="btn btn--primary" data-action="ok"></button>
      </div>
    `;
    (dialog.querySelector('.dialog__title') as HTMLElement).textContent = t('password.title');
    (dialog.querySelector('.dialog__desc') as HTMLElement).textContent = opts.retry
      ? t('password.desc.retry')
      : t('password.desc.first');
    const input = dialog.querySelector('input') as HTMLInputElement;
    input.placeholder = t('password.placeholder');
    (dialog.querySelector('[data-action="cancel"]') as HTMLElement).textContent =
      t('password.btn.cancel');
    (dialog.querySelector('[data-action="ok"]') as HTMLElement).textContent =
      t('password.btn.ok');

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    input.focus();

    const cleanup = () => backdrop.remove();
    const submit = () => {
      const v = input.value;
      cleanup();
      resolve(v || null);
    };
    const cancel = () => {
      cleanup();
      resolve(null);
    };

    dialog.querySelector('[data-action="ok"]')!.addEventListener('click', submit);
    dialog.querySelector('[data-action="cancel"]')!.addEventListener('click', cancel);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') cancel();
    });
  });
}
