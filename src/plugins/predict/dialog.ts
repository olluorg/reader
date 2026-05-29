/**
 * Autocomplete settings dialog.
 *
 * Houses the Tier 0 toggle (instant word completion) and the explicit,
 * opt-in download of the Tier 1 English phrase model — with a size/mobile
 * warning, a live progress bar, and an "active" confirmation. The Tier 1
 * section re-renders from controller updates so progress and ready-state are
 * reflected without reopening the dialog.
 */

import {
  downloadTier1,
  getTier1Status,
  isTier0Enabled,
  removeTier1,
  resetLearned,
  setTier0Enabled,
  subscribe,
} from './controller';
import { showToast } from '../../ui/toast';
import { t } from './i18n';

export function openPredictDialog(): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'dialog dialog--narrow';
  dialog.innerHTML = `
    <h2 class="dialog__title">${t('dialog.title')}</h2>
    <p class="dialog__desc">${t('dialog.desc')}</p>

    <div class="dialog__field">
      <div class="predict-row">
        <span class="dialog__label">${t('tier0.label')}</span>
        <button class="btn btn--ghost btn--small" data-role="tier0-toggle"></button>
      </div>
      <span class="dialog__hint">${t('tier0.hint')}</span>
    </div>

    <div class="dialog__field" data-role="tier1-field">
      <span class="dialog__label">${t('tier1.label')}</span>
      <span class="dialog__hint">${t('tier1.desc')}</span>
      <div data-role="tier1"></div>
    </div>

    <div class="dialog__actions">
      <button class="btn btn--ghost" data-action="reset">${t('menu.reset')}</button>
      <button class="btn btn--primary" data-action="close">${t('btn.close')}</button>
    </div>
  `;

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  const tier0Btn = dialog.querySelector('[data-role="tier0-toggle"]') as HTMLButtonElement;
  const tier1Field = dialog.querySelector('[data-role="tier1-field"]') as HTMLElement;
  const tier1Box = dialog.querySelector('[data-role="tier1"]') as HTMLElement;
  const resetBtn = dialog.querySelector('[data-action="reset"]') as HTMLButtonElement;
  const closeBtn = dialog.querySelector('[data-action="close"]') as HTMLButtonElement;

  function renderTier0(): void {
    const on = isTier0Enabled();
    tier0Btn.textContent = on ? t('state.on') : t('state.off');
    tier0Btn.classList.toggle('btn--active', on);
  }

  function renderTier1(): void {
    const s = getTier1Status();
    // Parked: hide the whole phrase-model section.
    if (s.state === 'disabled') {
      tier1Field.style.display = 'none';
      return;
    }
    tier1Box.innerHTML = '';

    const status = document.createElement('div');
    status.className = 'predict-status';

    const addButton = (label: string, onClick: () => void, primary = false): void => {
      const btn = document.createElement('button');
      btn.className = `btn btn--small ${primary ? 'btn--primary' : 'btn--ghost'}`;
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      tier1Box.appendChild(btn);
    };

    switch (s.state) {
      case 'checking':
        status.textContent = t('tier1.checking');
        tier1Box.appendChild(status);
        break;
      case 'unsupported':
        status.textContent = t('tier1.unsupported');
        status.classList.add('predict-status--muted');
        tier1Box.appendChild(status);
        break;
      case 'idle':
        status.textContent = t('tier1.idle');
        tier1Box.appendChild(status);
        {
          const warn = document.createElement('p');
          warn.className = 'predict-warn';
          warn.textContent = t('tier1.warn', { mb: s.sizeMB });
          tier1Box.appendChild(warn);
        }
        addButton(t('btn.download', { mb: s.sizeMB }), () => downloadTier1(), true);
        break;
      case 'loading': {
        const pct = Math.round(s.progress * 100);
        status.textContent = t('tier1.loading', { pct });
        tier1Box.appendChild(status);
        const bar = document.createElement('div');
        bar.className = 'predict-progress';
        bar.innerHTML = `<div class="predict-progress__fill" style="width:${pct}%"></div>`;
        tier1Box.appendChild(bar);
        break;
      }
      case 'ready':
        status.textContent = t('tier1.ready');
        status.classList.add('predict-status--ok');
        tier1Box.appendChild(status);
        addButton(t('btn.remove'), () => removeTier1());
        break;
      case 'error':
        status.textContent = t('tier1.errorState');
        status.classList.add('predict-status--err');
        tier1Box.appendChild(status);
        addButton(t('btn.retry'), () => downloadTier1(), true);
        break;
    }
  }

  renderTier0();
  renderTier1();

  tier0Btn.addEventListener('click', () => {
    setTier0Enabled(!isTier0Enabled());
    renderTier0();
  });
  resetBtn.addEventListener('click', () => {
    resetLearned();
    showToast(t('toast.reset'), { kind: 'info' });
  });

  const unsubscribe = subscribe(renderTier1);

  const close = () => {
    unsubscribe();
    backdrop.remove();
  };
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
