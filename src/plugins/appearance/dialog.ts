import { showToast } from '../../ui/toast';
import {
  applyAppearance,
  DEFAULTS,
  SANS_PRESETS,
  SERIF_PRESETS,
  type AppearanceConfig,
  type Theme,
} from './apply';
import { loadAppearance, saveAppearance } from './storage';

export function openAppearanceDialog(): void {
  const current = loadAppearance();

  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'dialog dialog--narrow';
  dialog.innerHTML = `
    <h2 class="dialog__title">Внешний вид</h2>

    <div class="dialog__field">
      <span class="dialog__label">Тема</span>
      <div data-role="theme" style="display: flex; gap: 8px; flex-wrap: wrap"></div>
    </div>

    <div class="dialog__field">
      <label class="dialog__label" for="appearance-sans">Sans-serif</label>
      <select class="dialog__input" id="appearance-sans" data-role="sans"></select>
    </div>

    <div class="dialog__field">
      <label class="dialog__label" for="appearance-serif">Serif</label>
      <select class="dialog__input" id="appearance-serif" data-role="serif"></select>
    </div>

    <div class="dialog__field">
      <span class="dialog__hint">Изменения применяются сразу. Сохраняются в localStorage этого браузера.</span>
    </div>

    <div class="dialog__actions">
      <button class="btn btn--ghost" data-action="reset">Сбросить</button>
      <button class="btn btn--primary" data-action="close">Закрыть</button>
    </div>
  `;

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  const themeBox = dialog.querySelector('[data-role="theme"]') as HTMLElement;
  const sansSel = dialog.querySelector('[data-role="sans"]') as HTMLSelectElement;
  const serifSel = dialog.querySelector('[data-role="serif"]') as HTMLSelectElement;
  const resetBtn = dialog.querySelector('[data-action="reset"]') as HTMLButtonElement;
  const closeBtn = dialog.querySelector('[data-action="close"]') as HTMLButtonElement;

  const themeOptions: Array<{ value: Theme; label: string }> = [
    { value: 'auto', label: 'Системная' },
    { value: 'light', label: 'Светлая' },
    { value: 'dark', label: 'Тёмная' },
  ];

  function renderTheme(active: Theme) {
    themeBox.innerHTML = '';
    for (const opt of themeOptions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--ghost btn--small';
      btn.textContent = opt.label;
      if (opt.value === active) btn.classList.add('btn--active');
      btn.addEventListener('click', () => {
        const next: AppearanceConfig = { ...current, theme: opt.value };
        Object.assign(current, next);
        applyAppearance(next);
        saveAppearance(next);
        renderTheme(opt.value);
      });
      themeBox.appendChild(btn);
    }
  }

  function fillSelect(
    sel: HTMLSelectElement,
    presets: ReadonlyArray<{ label: string; value: string }>,
    current: string,
  ) {
    sel.innerHTML = '';
    let matched = false;
    for (const p of presets) {
      const opt = document.createElement('option');
      opt.value = p.value;
      opt.textContent = p.label;
      if (p.value === current) {
        opt.selected = true;
        matched = true;
      }
      sel.appendChild(opt);
    }
    if (!matched) {
      const opt = document.createElement('option');
      opt.value = current;
      opt.textContent = 'Своё значение';
      opt.selected = true;
      sel.appendChild(opt);
    }
  }

  renderTheme(current.theme);
  fillSelect(sansSel, SANS_PRESETS, current.fontSans);
  fillSelect(serifSel, SERIF_PRESETS, current.fontSerif);

  sansSel.addEventListener('change', () => {
    current.fontSans = sansSel.value;
    applyAppearance(current);
    saveAppearance(current);
  });
  serifSel.addEventListener('change', () => {
    current.fontSerif = serifSel.value;
    applyAppearance(current);
    saveAppearance(current);
  });

  resetBtn.addEventListener('click', () => {
    Object.assign(current, DEFAULTS);
    applyAppearance(current);
    saveAppearance(current);
    renderTheme(current.theme);
    fillSelect(sansSel, SANS_PRESETS, current.fontSans);
    fillSelect(serifSel, SERIF_PRESETS, current.fontSerif);
    showToast('Внешний вид сброшен к умолчаниям', { kind: 'info' });
  });

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
