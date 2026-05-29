import { showToast } from '../../ui/toast';
import {
  applyAppearance,
  DEFAULTS,
  FONT_MAX,
  FONT_MIN,
  FONT_PRESETS,
  PALETTES,
  type AppearanceConfig,
  type PaletteId,
  type Theme,
} from './apply';
import { t } from './i18n';
import { loadAppearance, saveAppearance } from './storage';

export function openAppearanceDialog(): void {
  const current = loadAppearance();

  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'dialog dialog--narrow';
  dialog.innerHTML = `
    <h2 class="dialog__title">${t('dialog.title')}</h2>
    <p class="dialog__desc">${t('dialog.desc')}</p>

    <div class="dialog__field">
      <span class="dialog__label">${t('field.theme')}</span>
      <div data-role="theme" style="display: flex; gap: 8px; flex-wrap: wrap"></div>
    </div>

    <div class="dialog__field">
      <span class="dialog__label">${t('field.palette')}</span>
      <div class="palette-picker" data-role="palette"></div>
    </div>

    <div class="dialog__field">
      <label class="dialog__label" for="appearance-font">${t('field.font')}</label>
      <select class="dialog__input" id="appearance-font" data-role="font"></select>
    </div>

    <div class="dialog__field">
      <label class="dialog__label" for="appearance-size">
        ${t('field.size')} <span data-role="size-value"></span>px
      </label>
      <input class="dialog__input" type="range" id="appearance-size"
             data-role="size" min="${FONT_MIN}" max="${FONT_MAX}" step="1">
    </div>

    <div class="dialog__field">
      <span class="dialog__hint">${t('field.hint')}</span>
    </div>

    <div class="dialog__actions">
      <button class="btn btn--ghost" data-action="reset">${t('btn.reset')}</button>
      <button class="btn btn--primary" data-action="close">${t('btn.close')}</button>
    </div>
  `;

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  const themeBox = dialog.querySelector('[data-role="theme"]') as HTMLElement;
  const paletteBox = dialog.querySelector('[data-role="palette"]') as HTMLElement;
  const fontSel = dialog.querySelector('[data-role="font"]') as HTMLSelectElement;
  const sizeInput = dialog.querySelector('[data-role="size"]') as HTMLInputElement;
  const sizeValue = dialog.querySelector('[data-role="size-value"]') as HTMLElement;
  const resetBtn = dialog.querySelector('[data-action="reset"]') as HTMLButtonElement;
  const closeBtn = dialog.querySelector('[data-action="close"]') as HTMLButtonElement;

  const themeOptions: Array<{ value: Theme; label: string }> = [
    { value: 'auto', label: t('theme.auto') },
    { value: 'light', label: t('theme.light') },
    { value: 'dark', label: t('theme.dark') },
  ];

  function commit(next: Partial<AppearanceConfig>): void {
    Object.assign(current, next);
    applyAppearance(current);
    saveAppearance(current);
  }

  function renderTheme(active: Theme): void {
    themeBox.innerHTML = '';
    for (const opt of themeOptions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--ghost btn--small';
      btn.textContent = opt.label;
      if (opt.value === active) btn.classList.add('btn--active');
      btn.addEventListener('click', () => {
        commit({ theme: opt.value });
        renderTheme(opt.value);
      });
      themeBox.appendChild(btn);
    }
  }

  function renderPalette(active: PaletteId): void {
    paletteBox.innerHTML = '';
    for (const p of PALETTES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette-chip';
      if (p.id === active) btn.classList.add('palette-chip--active');
      const paletteLabel = t(`palette.${p.id}`);
      btn.title = paletteLabel;
      btn.setAttribute('aria-label', paletteLabel);
      btn.innerHTML = `
        <span class="palette-chip__swatch" aria-hidden="true">
          <span class="palette-chip__half palette-chip__half--light" style="background:${p.swatch.light}"></span>
          <span class="palette-chip__half palette-chip__half--dark" style="background:${p.swatch.dark}"></span>
        </span>
        <span class="palette-chip__label">${paletteLabel}</span>
      `;
      btn.addEventListener('click', () => {
        commit({ palette: p.id });
        renderPalette(p.id);
      });
      paletteBox.appendChild(btn);
    }
  }

  function fillFontSelect(currentValue: string): void {
    fontSel.innerHTML = '';
    let matched = false;
    for (const p of FONT_PRESETS) {
      const opt = document.createElement('option');
      opt.value = p.value;
      opt.textContent = t(`font.${p.id}`);
      if (p.value === currentValue) {
        opt.selected = true;
        matched = true;
      }
      fontSel.appendChild(opt);
    }
    if (!matched) {
      const opt = document.createElement('option');
      opt.value = currentValue;
      opt.textContent = t('font.custom');
      opt.selected = true;
      fontSel.appendChild(opt);
    }
  }

  renderTheme(current.theme);
  renderPalette(current.palette);
  fillFontSelect(current.fontBody);
  sizeInput.value = String(current.fontSize);
  sizeValue.textContent = String(current.fontSize);

  fontSel.addEventListener('change', () => {
    commit({ fontBody: fontSel.value });
  });
  sizeInput.addEventListener('input', () => {
    const next = Number(sizeInput.value);
    sizeValue.textContent = String(next);
    commit({ fontSize: next });
  });

  resetBtn.addEventListener('click', () => {
    Object.assign(current, DEFAULTS);
    applyAppearance(current);
    saveAppearance(current);
    renderTheme(current.theme);
    renderPalette(current.palette);
    fillFontSelect(current.fontBody);
    sizeInput.value = String(current.fontSize);
    sizeValue.textContent = String(current.fontSize);
    showToast(t('toast.reset'), { kind: 'info' });
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
