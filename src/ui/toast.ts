import { t } from '../i18n';

export type ToastKind = 'info' | 'warn' | 'error' | 'success';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  kind?: ToastKind;
  timeoutMs?: number;
  actions?: ToastAction[];
}

const CONTAINER_ID = 'reader-toasts';

function ensureContainer(): HTMLElement {
  let el = document.getElementById(CONTAINER_ID);
  if (el) return el;
  el = document.createElement('div');
  el.id = CONTAINER_ID;
  el.className = 'toasts';
  document.body.appendChild(el);
  return el;
}

export function showToast(message: string, opts: ToastOptions = {}): () => void {
  const container = ensureContainer();
  const toast = document.createElement('div');
  const kind = opts.kind ?? 'info';
  toast.className = `toast toast--${kind}`;
  toast.setAttribute('role', kind === 'error' || kind === 'warn' ? 'alert' : 'status');

  const body = document.createElement('div');
  body.className = 'toast__body';
  body.textContent = message;
  toast.appendChild(body);

  if (opts.actions?.length) {
    const actions = document.createElement('div');
    actions.className = 'toast__actions';
    for (const a of opts.actions) {
      const btn = document.createElement('button');
      btn.className = 'toast__action';
      btn.textContent = a.label;
      btn.addEventListener('click', () => {
        a.onClick();
        dismiss();
      });
      actions.appendChild(btn);
    }
    toast.appendChild(actions);
  }

  const close = document.createElement('button');
  close.className = 'toast__close';
  close.setAttribute('aria-label', t('toast.dismiss'));
  close.textContent = '×';
  close.addEventListener('click', () => dismiss());
  toast.appendChild(close);

  container.appendChild(toast);
  // Trigger CSS entrance transition.
  requestAnimationFrame(() => toast.classList.add('toast--visible'));

  let timer: number | null = null;
  // Errors and toasts with actions are sticky unless dismissed explicitly.
  const wantsAutoDismiss = !opts.actions?.length && kind !== 'error';
  const ttl = opts.timeoutMs ?? (kind === 'warn' ? 7000 : 4000);
  if (wantsAutoDismiss) {
    timer = window.setTimeout(() => dismiss(), ttl);
  }

  let done = false;
  function dismiss() {
    if (done) return;
    done = true;
    if (timer !== null) clearTimeout(timer);
    toast.classList.remove('toast--visible');
    toast.classList.add('toast--leaving');
    setTimeout(() => {
      toast.remove();
      if (container.childElementCount === 0) container.remove();
    }, 220);
  }

  return dismiss;
}
