import type { Lang } from '../../i18n';
import { t } from './i18n';
import { loadLangPref, saveLangPref } from './storage';

type Choice = 'auto' | Lang;

// Language names stay as endonyms (shown in their own script) and are not
// translated; only the "follow the system" option is localized.
const OPTIONS: Array<{ value: Choice; label: string }> = [
  { value: 'auto', label: t('option.auto') },
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
];

export function openLanguageDialog(): void {
  const current: Choice = loadLangPref() ?? 'auto';

  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'dialog dialog--narrow';
  dialog.innerHTML = `
    <h2 class="dialog__title">${t('dialog.title')}</h2>
    <p class="dialog__desc">${t('dialog.desc')}</p>

    <div class="dialog__field">
      <div data-role="lang" style="display: flex; gap: 8px; flex-wrap: wrap"></div>
    </div>

    <div class="dialog__actions">
      <button class="btn btn--primary" data-action="close">${t('btn.close')}</button>
    </div>
  `;

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  const box = dialog.querySelector('[data-role="lang"]') as HTMLElement;
  const closeBtn = dialog.querySelector('[data-action="close"]') as HTMLButtonElement;

  for (const opt of OPTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--ghost btn--small';
    btn.textContent = opt.label;
    if (opt.value === current) btn.classList.add('btn--active');
    btn.addEventListener('click', () => {
      if (opt.value === current) return;
      saveLangPref(opt.value === 'auto' ? null : opt.value);
      // The active language is baked at i18n module load, so a reload is
      // the simplest way to re-render the whole UI. The document lives in
      // the URL hash, so nothing is lost across the reload.
      location.reload();
    });
    box.appendChild(btn);
  }

  const close = () => backdrop.remove();
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') close();
    },
    { once: true },
  );
}
