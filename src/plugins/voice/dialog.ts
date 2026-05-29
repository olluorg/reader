/**
 * Voice typing settings dialog.
 *
 * Enable toggle, push-to-talk bindings editor (each row maps a held key to a
 * dictation language — add a second key for a second language), a model picker,
 * and the explicit, opt-in download of the on-device Whisper model with a
 * size/Wi-Fi warning, live progress, and a ready confirmation. The model
 * section re-renders from controller updates so progress and ready-state show
 * without reopening the dialog.
 */

import {
  downloadModel,
  getBindings,
  getModelStatus,
  getSelectedModel,
  removeModel,
  setBindings,
  setModel,
  subscribe,
} from './controller';
import { MODELS } from './models';
import { isEnabled, setEnabled, type VoiceLang } from './store';
import { t } from './i18n';

function langLabel(lang: VoiceLang): string {
  return lang === 'ru' ? 'Русский' : 'English';
}

const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iP(hone|ad|od)/.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent,
  );

// Modifier names differ by platform: macOS labels Alt as Option (⌥) and Meta as
// Command (⌘), Windows labels Meta as Win.
function formatKey(code: string): string {
  if (code.startsWith('Control')) return IS_MAC ? '⌃ Control' : 'Ctrl';
  if (code.startsWith('Alt')) return IS_MAC ? '⌥ Option' : 'Alt';
  if (code.startsWith('Shift')) return IS_MAC ? '⇧ Shift' : 'Shift';
  if (code.startsWith('Meta')) return IS_MAC ? '⌘ Cmd' : 'Win';
  if (code === 'Space') return 'Space';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

export function openVoiceDialog(): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'dialog dialog--narrow';
  dialog.innerHTML = `
    <h2 class="dialog__title">${t('dialog.title')}</h2>
    <p class="dialog__desc">${t('dialog.desc')}</p>

    <div class="dialog__field">
      <div class="predict-row">
        <span class="dialog__label">${t('enabled.label')}</span>
        <button class="btn btn--ghost btn--small" data-role="enabled-toggle"></button>
      </div>
      <span class="dialog__hint">${t('enabled.hint')}</span>
    </div>

    <div class="dialog__field">
      <span class="dialog__label">${t('bindings.label')}</span>
      <span class="dialog__hint">${t('bindings.hint')}</span>
      <div data-role="bindings" style="margin-top: 8px"></div>
    </div>

    <div class="dialog__field">
      <span class="dialog__label">${t('model.label')}</span>
      <span class="dialog__hint">${t('model.desc')}</span>
      <div data-role="model-picker" style="display: flex; gap: 8px; flex-wrap: wrap; margin: 6px 0"></div>
      <span class="dialog__hint">${t('model.pickHint')}</span>
      <div data-role="model"></div>
    </div>

    <div class="dialog__actions">
      <button class="btn btn--primary" data-action="close">${t('btn.close')}</button>
    </div>
  `;

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  const enabledBtn = dialog.querySelector('[data-role="enabled-toggle"]') as HTMLButtonElement;
  const bindingsBox = dialog.querySelector('[data-role="bindings"]') as HTMLElement;
  const pickerBox = dialog.querySelector('[data-role="model-picker"]') as HTMLElement;
  const modelBox = dialog.querySelector('[data-role="model"]') as HTMLElement;
  const closeBtn = dialog.querySelector('[data-action="close"]') as HTMLButtonElement;

  // ── enabled toggle ──
  function renderEnabled(): void {
    const on = isEnabled();
    enabledBtn.textContent = on ? 'On' : 'Off';
    enabledBtn.classList.toggle('btn--active', on);
  }
  enabledBtn.addEventListener('click', () => {
    setEnabled(!isEnabled());
    renderEnabled();
  });

  // ── bindings editor (key → language) ──
  let capturingIndex: number | null = null;

  function captureKey(index: number): void {
    if (capturingIndex !== null) return;
    capturingIndex = index;
    renderBindings();
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener('keydown', onKey, true);
      capturingIndex = null;
      if (e.code !== 'Escape') {
        const next = getBindings();
        if (next[index]) {
          next[index] = { ...next[index]!, key: e.code };
          setBindings(next);
        }
      }
      renderBindings();
    };
    window.addEventListener('keydown', onKey, true);
  }

  function renderBindings(): void {
    const list = getBindings();
    bindingsBox.innerHTML = '';

    if (list.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'dialog__hint';
      empty.textContent = t('bindings.empty');
      bindingsBox.appendChild(empty);
    }

    list.forEach((b, i) => {
      const row = document.createElement('div');
      row.className = 'voice-binding';

      const langBtn = document.createElement('button');
      langBtn.type = 'button';
      langBtn.className = 'btn btn--ghost btn--small';
      langBtn.textContent = langLabel(b.lang);
      langBtn.addEventListener('click', () => {
        const next = getBindings();
        next[i] = { ...next[i]!, lang: next[i]!.lang === 'ru' ? 'en' : 'ru' };
        setBindings(next);
        renderBindings();
      });

      const keyBtn = document.createElement('button');
      keyBtn.type = 'button';
      keyBtn.className = 'btn btn--ghost btn--small voice-binding__key';
      const capturing = capturingIndex === i;
      keyBtn.textContent = capturing
        ? t('bindings.capturing')
        : b.key
          ? formatKey(b.key)
          : t('bindings.setKey');
      keyBtn.classList.toggle('btn--active', capturing);
      keyBtn.addEventListener('click', () => captureKey(i));

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn--ghost btn--small';
      removeBtn.textContent = '✕';
      removeBtn.title = t('bindings.remove');
      removeBtn.addEventListener('click', () => {
        const next = getBindings();
        next.splice(i, 1);
        setBindings(next);
        renderBindings();
      });

      row.append(langBtn, keyBtn, removeBtn);
      bindingsBox.appendChild(row);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn--ghost btn--small';
    addBtn.style.marginTop = '8px';
    addBtn.textContent = `＋ ${t('bindings.add')}`;
    addBtn.addEventListener('click', () => {
      const next = getBindings();
      // Seed the new row with whichever language isn't bound yet.
      const lang: VoiceLang = next.some((x) => x.lang === 'ru') ? 'en' : 'ru';
      next.push({ key: '', lang });
      setBindings(next);
      captureKey(next.length - 1); // jump straight into capturing its key
    });
    bindingsBox.appendChild(addBtn);
  }

  // ── model picker ──
  function renderPicker(): void {
    const cur = getSelectedModel();
    pickerBox.innerHTML = '';
    for (const m of MODELS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--ghost btn--small';
      btn.textContent = `${m.label} · ${t('model.size', { mb: m.sizeMB })}`;
      if (m.id === cur) btn.classList.add('btn--active');
      btn.addEventListener('click', () => {
        if (m.id === getSelectedModel()) return;
        setModel(m.id);
        renderPicker();
        renderModel();
      });
      pickerBox.appendChild(btn);
    }
  }

  // ── model section ──
  function renderModel(): void {
    const s = getModelStatus();
    modelBox.innerHTML = '';

    const status = document.createElement('div');
    status.className = 'predict-status';

    const addButton = (label: string, onClick: () => void, primary = false): void => {
      const btn = document.createElement('button');
      btn.className = `btn btn--small ${primary ? 'btn--primary' : 'btn--ghost'}`;
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      modelBox.appendChild(btn);
    };

    switch (s.state) {
      case 'checking':
        status.textContent = t('model.checking');
        modelBox.appendChild(status);
        break;
      case 'unsupported':
        status.textContent = t('model.unsupported');
        status.classList.add('predict-status--muted');
        modelBox.appendChild(status);
        break;
      case 'idle':
        status.textContent = t('model.idle');
        modelBox.appendChild(status);
        {
          const warn = document.createElement('p');
          warn.className = 'predict-warn';
          warn.textContent = t('model.warn', { mb: s.sizeMB });
          modelBox.appendChild(warn);
        }
        addButton(t('btn.download', { mb: s.sizeMB }), () => downloadModel(), true);
        break;
      case 'loading': {
        const pct = Math.round(s.progress * 100);
        status.textContent = t('model.loading', { pct });
        modelBox.appendChild(status);
        const bar = document.createElement('div');
        bar.className = 'predict-progress';
        bar.innerHTML = `<div class="predict-progress__fill" style="width:${pct}%"></div>`;
        modelBox.appendChild(bar);
        break;
      }
      case 'ready':
        status.textContent = t('model.ready');
        status.classList.add('predict-status--ok');
        modelBox.appendChild(status);
        addButton(t('btn.remove'), () => removeModel());
        break;
      case 'error':
        status.textContent = t('model.errorState');
        status.classList.add('predict-status--err');
        modelBox.appendChild(status);
        addButton(t('btn.retry'), () => downloadModel(), true);
        break;
    }
  }

  renderEnabled();
  renderBindings();
  renderPicker();
  renderModel();

  const unsubscribe = subscribe(renderModel);

  const onEscape = (e: KeyboardEvent) => {
    // While capturing a key, Esc is consumed by the capture handler instead.
    if (e.key === 'Escape' && capturingIndex === null) close();
  };

  const close = () => {
    unsubscribe();
    document.removeEventListener('keydown', onEscape);
    backdrop.remove();
  };
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', onEscape);
}
